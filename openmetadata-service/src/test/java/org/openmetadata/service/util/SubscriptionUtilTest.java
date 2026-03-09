package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.openmetadata.schema.type.Include.NON_DELETED;
import static org.openmetadata.service.Entity.TEAM;
import static org.openmetadata.service.Entity.USER;

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.SubscriptionAction;
import org.openmetadata.schema.entity.events.SubscriptionDestination;
import org.openmetadata.schema.entity.events.SubscriptionStatus;
import org.openmetadata.schema.entity.events.TestDestinationStatus;
import org.openmetadata.schema.entity.teams.Team;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Paging;
import org.openmetadata.schema.type.Profile;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.schema.type.Webhook;
import org.openmetadata.schema.type.profile.SubscriptionConfig;
import org.openmetadata.schema.utils.ResultList;
import org.openmetadata.service.Entity;
import org.openmetadata.service.apps.bundles.changeEvent.Destination;
import org.openmetadata.service.events.errors.EventPublisherException;
import org.openmetadata.service.fernet.Fernet;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.UserRepository;
import org.openmetadata.service.security.SecurityUtil;

class SubscriptionUtilTest {

  @Test
  void getAdminsDataAggregatesAdminEmailsAcrossPages() {
    UserRepository userRepository = mock(UserRepository.class);
    ResultList<User> firstPage = mock(ResultList.class);
    ResultList<User> secondPage = mock(ResultList.class);
    Paging firstPaging = new Paging().withAfter("cursor-1");
    Paging secondPaging = new Paging().withAfter(null);

    when(firstPage.getData()).thenReturn(List.of(user("alice", "alice@example.com")));
    when(firstPage.getPaging()).thenReturn(firstPaging);
    when(secondPage.getData()).thenReturn(List.of(user("bob", "bob@example.com")));
    when(secondPage.getPaging()).thenReturn(secondPaging);
    when(userRepository.getFields("email,profile"))
        .thenReturn(new EntityUtil.Fields(Set.of("email", "profile")));
    when(userRepository.listAfter(isNull(), any(), any(), eq(50), isNull())).thenReturn(firstPage);
    when(userRepository.listAfter(isNull(), any(), any(), eq(50), eq("cursor-1")))
        .thenReturn(secondPage);

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity.when(() -> Entity.getEntityRepository(USER)).thenReturn(userRepository);

      Set<String> admins =
          SubscriptionUtil.getAdminsData(SubscriptionDestination.SubscriptionType.EMAIL);

      assertEquals(Set.of("alice@example.com", "bob@example.com"), admins);
    }
  }

  @Test
  void getEmailOrWebhookEndpointForUsersFiltersInvalidWebhookUrls() {
    User validWebhookUser =
        user("alice", "alice@example.com")
            .withProfile(profileWithSlack("https://hooks.slack.com/services/T1/B1/ok"));
    User invalidWebhookUser =
        user("bob", "bob@example.com").withProfile(profileWithSlack("notaurl"));
    User noProfileUser = user("carol", "carol@example.com");

    Set<String> receivers =
        SubscriptionUtil.getEmailOrWebhookEndpointForUsers(
            List.of(validWebhookUser, invalidWebhookUser, noProfileUser),
            SubscriptionDestination.SubscriptionType.SLACK);

    assertEquals(Set.of("https://hooks.slack.com/services/T1/B1/ok"), receivers);
  }

  @Test
  void getEmailOrWebhookEndpointForTeamsReturnsEmailTargets() {
    Team analytics = team("analytics", "analytics@example.com");
    Team finance = team("finance", "finance@example.com");

    Set<String> receivers =
        SubscriptionUtil.getEmailOrWebhookEndpointForTeams(
            List.of(analytics, finance), SubscriptionDestination.SubscriptionType.EMAIL);

    assertEquals(Set.of("analytics@example.com", "finance@example.com"), receivers);
  }

  @Test
  void getOwnerOrFollowersCombinesUserAndTeamEmails() {
    UUID entityId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    UUID teamId = UUID.randomUUID();
    CollectionDAO collectionDAO = mock(CollectionDAO.class);
    CollectionDAO.EntityRelationshipDAO relationshipDAO = mock(CollectionDAO.EntityRelationshipDAO.class);
    CollectionDAO.EntityRelationshipRecord userRecord = mock(CollectionDAO.EntityRelationshipRecord.class);
    CollectionDAO.EntityRelationshipRecord teamRecord = mock(CollectionDAO.EntityRelationshipRecord.class);

    when(collectionDAO.relationshipDAO()).thenReturn(relationshipDAO);
    when(relationshipDAO.findFrom(entityId, "table", Relationship.OWNS.ordinal()))
        .thenReturn(List.of(userRecord, teamRecord));
    when(userRecord.getType()).thenReturn(USER);
    when(userRecord.getId()).thenReturn(userId);
    when(teamRecord.getType()).thenReturn(TEAM);
    when(teamRecord.getId()).thenReturn(teamId);

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntity(USER, userId, "", NON_DELETED))
          .thenReturn(user("alice", "alice@example.com"));
      mockedEntity
          .when(() -> Entity.getEntity(TEAM, teamId, "id,profile,email", NON_DELETED))
          .thenReturn(team("analytics", "analytics@example.com"));

      Set<String> receivers =
          SubscriptionUtil.getOwnerOrFollowers(
              SubscriptionDestination.SubscriptionType.EMAIL,
              collectionDAO,
              entityId,
              "table",
              Relationship.OWNS);

      assertEquals(Set.of("alice@example.com", "analytics@example.com"), receivers);
    }
  }

  @Test
  void buildReceiversListFromActionsResolvesExplicitUsers() {
    SubscriptionAction action = new Webhook().withReceivers(Set.of("alice", "bob"));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityByName(USER, "alice", "", NON_DELETED))
          .thenReturn(user("alice", "alice@example.com"));
      mockedEntity
          .when(() -> Entity.getEntityByName(USER, "bob", "", NON_DELETED))
          .thenReturn(user("bob", "bob@example.com"));

      Set<String> receivers =
          SubscriptionUtil.buildReceiversListFromActions(
              action,
              SubscriptionDestination.SubscriptionCategory.USERS,
              SubscriptionDestination.SubscriptionType.EMAIL,
              null,
              UUID.randomUUID(),
              "table");

      assertEquals(Set.of("alice@example.com", "bob@example.com"), receivers);
    }
  }

  @Test
  void buildReceiversListFromActionsRejectsMissingTeamRecipients() {
    SubscriptionAction action = new Webhook().withReceivers(Set.of());

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                SubscriptionUtil.buildReceiversListFromActions(
                    action,
                    SubscriptionDestination.SubscriptionCategory.TEAMS,
                    SubscriptionDestination.SubscriptionType.EMAIL,
                    null,
                    UUID.randomUUID(),
                    "table"));

    assertTrue(exception.getMessage().contains("Teams Recipients List"));
  }

  @Test
  void appendHeadersAndQueryParamsToTargetReturnsPreparedBuilder() {
    Client client = mock(Client.class);
    WebTarget target = mock(WebTarget.class);
    Invocation.Builder builder = mock(Invocation.Builder.class);
    Webhook webhook =
        new Webhook()
            .withEndpoint(URI.create("https://hooks.example.com"))
            .withQueryParams(Map.of("env", "test"))
            .withSecretKey("plain-secret")
            .withHeaders(Map.of("X-Custom", "true"));
    Map<String, String> authHeaders = Map.of("X-Auth-Params-Email", "admin@open-metadata.org");

    when(client.target("https://hooks.example.com")).thenReturn(target);
    when(target.queryParam("env", "test")).thenReturn(target);

    try (MockedStatic<SecurityUtil> mockedSecurity = mockStatic(SecurityUtil.class);
        MockedStatic<Fernet> mockedFernet = mockStatic(Fernet.class)) {
      Fernet fernet = mock(Fernet.class);
      when(fernet.isKeyDefined()).thenReturn(false);
      mockedFernet.when(Fernet::getInstance).thenReturn(fernet);
      mockedSecurity
          .when(() -> SecurityUtil.authHeaders("admin@open-metadata.org"))
          .thenReturn(authHeaders);
      mockedSecurity.when(() -> SecurityUtil.addHeaders(target, authHeaders)).thenReturn(builder);

      Invocation.Builder returnedBuilder =
          SubscriptionUtil.appendHeadersAndQueryParamsToTarget(
              client, "https://hooks.example.com", webhook, "{\"ok\":true}");

      assertSame(builder, returnedBuilder);
      verify(target).queryParam("env", "test");
      verify(builder).header(eq("X-Custom"), eq("true"));
      verify(builder).header(eq("X-OM-Signature"), startsWith("sha256="));
      mockedSecurity.verify(() -> SecurityUtil.addHeaders(target, authHeaders), times(1));
    }
  }

  @Test
  void decryptWebhookSecretKeyUsesFernetWhenConfigured() {
    Fernet fernet = mock(Fernet.class);
    when(fernet.isKeyDefined()).thenReturn(true);
    when(fernet.decryptIfApplies("encrypted-secret")).thenReturn("plain-secret");

    try (MockedStatic<Fernet> mockedFernet = mockStatic(Fernet.class)) {
      mockedFernet.when(Fernet::getInstance).thenReturn(fernet);

      assertEquals("plain-secret", SubscriptionUtil.decryptWebhookSecretKey("encrypted-secret"));
    }
  }

  @Test
  void postWebhookMessageTracksSuccessAndFailureStatuses() throws EventPublisherException {
    Destination<org.openmetadata.schema.type.ChangeEvent> destination =
        mock(Destination.class, CALLS_REAL_METHODS);
    SubscriptionDestination subscriptionDestination =
        new SubscriptionDestination().withId(UUID.randomUUID());
    Invocation.Builder builder = mock(Invocation.Builder.class);
    Response successResponse = mock(Response.class);
    Response.StatusType successStatusInfo = mock(Response.StatusType.class);
    Response failureResponse = mock(Response.class);
    Response.StatusType failureStatusInfo = mock(Response.StatusType.class);

    when(destination.getSubscriptionDestination()).thenReturn(subscriptionDestination);
    when(successStatusInfo.getReasonPhrase()).thenReturn("Accepted");
    when(successResponse.getStatus()).thenReturn(202);
    when(successResponse.getStatusInfo()).thenReturn(successStatusInfo);
    when(successResponse.getStringHeaders()).thenReturn(new MultivaluedHashMap<>());
    when(successResponse.hasEntity()).thenReturn(true);
    when(successResponse.readEntity(String.class)).thenReturn("{\"ok\":true}");
    when(successResponse.getMediaType()).thenReturn(MediaType.APPLICATION_JSON_TYPE);
    when(builder.put(any())).thenReturn(successResponse);

    SubscriptionUtil.postWebhookMessage(
        destination, builder, Map.of("ok", true), Webhook.HttpMethod.PUT);

    SubscriptionStatus successStatus =
        (SubscriptionStatus) destination.getSubscriptionDestination().getStatusDetails();
    assertEquals(SubscriptionStatus.Status.ACTIVE, successStatus.getStatus());
    assertNotNull(successStatus.getLastSuccessfulAt());

    when(failureStatusInfo.getReasonPhrase()).thenReturn("Internal Server Error");
    when(failureResponse.getStatus()).thenReturn(500);
    when(failureResponse.getStatusInfo()).thenReturn(failureStatusInfo);
    when(failureResponse.getStringHeaders()).thenReturn(new MultivaluedHashMap<>());
    when(failureResponse.hasEntity()).thenReturn(true);
    when(failureResponse.readEntity(String.class)).thenReturn("boom");
    when(failureResponse.getMediaType()).thenReturn(MediaType.TEXT_PLAIN_TYPE);
    when(builder.post(any())).thenReturn(failureResponse);

    EventPublisherException exception =
        assertThrows(
            EventPublisherException.class,
            () ->
                SubscriptionUtil.postWebhookMessage(
                    destination, builder, Map.of("ok", false), Webhook.HttpMethod.POST));
    assertTrue(exception.getMessage().contains("HTTP 500"));

    SubscriptionStatus failedStatus =
        (SubscriptionStatus) destination.getSubscriptionDestination().getStatusDetails();
    assertEquals(SubscriptionStatus.Status.AWAITING_RETRY, failedStatus.getStatus());
    assertEquals(500, failedStatus.getLastFailedStatusCode());
    assertEquals("Internal Server Error", failedStatus.getLastFailedReason());
  }

  @Test
  void deliverTestWebhookMessageStoresDeliveryOutcome() {
    Destination<org.openmetadata.schema.type.ChangeEvent> destination =
        mock(Destination.class, CALLS_REAL_METHODS);
    SubscriptionDestination subscriptionDestination =
        new SubscriptionDestination().withId(UUID.randomUUID());
    Invocation.Builder builder = mock(Invocation.Builder.class);
    Response failureResponse = mock(Response.class);
    Response.StatusType failureStatusInfo = mock(Response.StatusType.class);
    when(destination.getSubscriptionDestination()).thenReturn(subscriptionDestination);
    when(failureStatusInfo.getReasonPhrase()).thenReturn("Bad Request");
    when(failureResponse.getStatus()).thenReturn(400);
    when(failureResponse.getStatusInfo()).thenReturn(failureStatusInfo);
    when(failureResponse.getStringHeaders()).thenReturn(new MultivaluedHashMap<>());
    when(failureResponse.hasEntity()).thenReturn(true);
    when(failureResponse.readEntity(String.class)).thenReturn("bad request");
    when(failureResponse.getMediaType()).thenReturn(MediaType.TEXT_PLAIN_TYPE);
    when(builder.post(any())).thenReturn(failureResponse);

    SubscriptionUtil.deliverTestWebhookMessage(destination, builder, Map.of("ok", false));

    Object statusDetails = destination.getSubscriptionDestination().getStatusDetails();
    assertInstanceOf(TestDestinationStatus.class, statusDetails);
    TestDestinationStatus status = (TestDestinationStatus) statusDetails;
    assertEquals(TestDestinationStatus.Status.FAILED, status.getStatus());
    assertEquals(400, status.getStatusCode());
  }

  @Test
  void addQueryParamsAppendsAllEntries() {
    WebTarget target = mock(WebTarget.class);
    when(target.queryParam("env", "test")).thenReturn(target);
    when(target.queryParam("team", "analytics")).thenReturn(target);

    WebTarget updated =
        SubscriptionUtil.addQueryParams(target, Map.of("env", "test", "team", "analytics"));

    assertSame(target, updated);
    verify(target).queryParam("env", "test");
    verify(target).queryParam("team", "analytics");
  }

  private User user(String name, String email) {
    return new User().withId(UUID.randomUUID()).withName(name).withEmail(email);
  }

  private Team team(String name, String email) {
    return new Team().withId(UUID.randomUUID()).withName(name).withEmail(email);
  }

  private Profile profileWithSlack(String endpoint) {
    return new Profile()
        .withSubscription(
            new SubscriptionConfig().withSlack(new Webhook().withEndpoint(URI.create(endpoint))));
  }
}
