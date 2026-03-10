package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.openmetadata.schema.type.Include.NON_DELETED;
import static org.openmetadata.service.Entity.ADMIN_ROLE;
import static org.openmetadata.service.Entity.ADMIN_USER_NAME;

import at.favre.lib.crypto.bcrypt.BCrypt;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.openmetadata.schema.api.teams.CreateTeam;
import org.openmetadata.schema.api.teams.CreateUser;
import org.openmetadata.schema.entity.teams.AuthenticationMechanism;
import org.openmetadata.schema.entity.teams.Role;
import org.openmetadata.schema.entity.teams.Team;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.ChangeEvent;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.EventType;
import org.openmetadata.schema.type.LandingPageSettings;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.sdk.exception.UserCreationException;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.BadRequestException;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.UserRepository;
import org.openmetadata.service.util.RestUtil.PutResponse;

class UserUtilTest {

  @Test
  void updateUserWithHashedPwdStoresBCryptPassword() {
    User user = new User();

    UserUtil.updateUserWithHashedPwd(user, "Sup3rSecret!");

    assertNotNull(user.getAuthenticationMechanism());
    assertEquals(
        AuthenticationMechanism.AuthType.BASIC, user.getAuthenticationMechanism().getAuthType());
    String hashedPassword =
        JsonUtils.convertValue(
                user.getAuthenticationMechanism().getConfig(),
                org.openmetadata.schema.auth.BasicAuthMechanism.class)
            .getPassword();
    assertTrue(BCrypt.verifyer().verify("Sup3rSecret!".toCharArray(), hashedPassword).verified);
  }

  @Test
  void assignTeamsFromClaimAddsOnlyNewGroupTeams() {
    UUID existingTeamId = UUID.randomUUID();
    UUID analyticsTeamId = UUID.randomUUID();
    User user =
        new User()
            .withName("alice")
            .withTeams(
                List.of(
                    new EntityReference()
                        .withId(existingTeamId)
                        .withType(Entity.TEAM)
                        .withName("existing")));

    Team analyticsTeam =
        new Team()
            .withId(analyticsTeamId)
            .withName("analytics")
            .withTeamType(CreateTeam.TeamType.GROUP);
    Team orgTeam =
        new Team()
            .withId(UUID.randomUUID())
            .withName("platform")
            .withTeamType(CreateTeam.TeamType.ORGANIZATION);

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.TEAM, "analytics", "id,teamType", NON_DELETED))
          .thenReturn(analyticsTeam);
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.TEAM, "platform", "id,teamType", NON_DELETED))
          .thenReturn(orgTeam);
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.TEAM, "missing", "id,teamType", NON_DELETED))
          .thenThrow(new EntityNotFoundException("team"));

      boolean changed =
          UserUtil.assignTeamsFromClaim(
              user, List.of("analytics", "platform", "analytics", "missing", ""));

      assertTrue(changed);
      assertEquals(2, user.getTeams().size());
      assertTrue(user.getTeams().stream().anyMatch(team -> existingTeamId.equals(team.getId())));
      assertTrue(user.getTeams().stream().anyMatch(team -> analyticsTeamId.equals(team.getId())));
      assertFalse(user.getTeams().stream().anyMatch(team -> "platform".equals(team.getName())));
    }
  }

  @Test
  void assignTeamsFromClaimReturnsFalseForEmptyOrBrokenClaims() {
    User user = new User().withName("alice");

    assertFalse(UserUtil.assignTeamsFromClaim(user, null));
    assertFalse(UserUtil.assignTeamsFromClaim(user, List.of("", " ")));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.TEAM, "broken", "id,teamType", NON_DELETED))
          .thenThrow(new RuntimeException("backend unavailable"));

      assertFalse(UserUtil.assignTeamsFromClaim(user, List.of("broken")));
      assertNull(user.getTeams());
    }
  }

  @Test
  void getRoleListFromUserReturnsRoleNames() {
    User user =
        new User()
            .withRoles(
                List.of(
                    new EntityReference().withName("DataConsumer"),
                    new EntityReference().withName("DataSteward")));

    assertEquals(Set.of("DataConsumer", "DataSteward"), UserUtil.getRoleListFromUser(user));
    assertTrue(UserUtil.getRoleListFromUser(new User()).isEmpty());
  }

  @Test
  void validateAndGetRolesRefSkipsAdminAndMissingRoles() {
    Role dataConsumerRole =
        new Role()
            .withId(UUID.randomUUID())
            .withName("DataConsumer")
            .withFullyQualifiedName("DataConsumer");

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.ROLE, "DataConsumer", "id", NON_DELETED, true))
          .thenReturn(dataConsumerRole);
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.ROLE, "MissingRole", "id", NON_DELETED, true))
          .thenThrow(new EntityNotFoundException("role"));

      List<EntityReference> references =
          UserUtil.validateAndGetRolesRef(Set.of(ADMIN_ROLE, "DataConsumer", "MissingRole"));

      assertEquals(1, references.size());
      assertEquals("DataConsumer", references.get(0).getName());
      assertEquals(dataConsumerRole.getId(), references.get(0).getId());
    }
  }

  @Test
  void isRolesSyncNeededDetectsChangesInEitherDirection() {
    assertFalse(UserUtil.isRolesSyncNeeded(Set.of("A", "B"), Set.of("B", "A")));
    assertTrue(UserUtil.isRolesSyncNeeded(Set.of("A", "B"), Set.of("A")));
    assertTrue(UserUtil.isRolesSyncNeeded(Set.of("A"), Set.of("A", "B")));
  }

  @Test
  void reSyncUserRolesFromTokenHandlesImmutableRoleSetsAndUpdatesUserState() {
    UUID userId = UUID.randomUUID();
    Role dataConsumerRole =
        new Role()
            .withId(UUID.randomUUID())
            .withName("DataConsumer")
            .withFullyQualifiedName("DataConsumer");
    UserRepository userRepository = mock(UserRepository.class);
    UriInfo uriInfo = mock(UriInfo.class);
    User user =
        new User()
            .withId(userId)
            .withName("alice")
            .withFullyQualifiedName("alice")
            .withIsAdmin(false)
            .withRoles(List.of(new EntityReference().withName("OldRole")));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity.when(() -> Entity.getEntityRepository(Entity.USER)).thenReturn(userRepository);
      mockedEntity
          .when(() -> Entity.getEntityByName(Entity.ROLE, "DataConsumer", "id", NON_DELETED, true))
          .thenReturn(dataConsumerRole);

      boolean changed =
          UserUtil.reSyncUserRolesFromToken(uriInfo, user, Set.of(ADMIN_ROLE, "DataConsumer"));

      assertTrue(changed);
      assertTrue(user.getIsAdmin());
      assertEquals(1, user.getRoles().size());
      assertEquals("DataConsumer", user.getRoles().get(0).getName());
      verify(userRepository).patch(eq(uriInfo), eq(userId), eq("alice"), any());
    }
  }

  @Test
  void reSyncUserRolesFromTokenSkipsPatchWhenNothingChanges() {
    UserRepository userRepository = mock(UserRepository.class);
    User user =
        new User()
            .withId(UUID.randomUUID())
            .withName("alice")
            .withFullyQualifiedName("alice")
            .withIsAdmin(false)
            .withRoles(List.of(new EntityReference().withName("DataConsumer")));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity.when(() -> Entity.getEntityRepository(Entity.USER)).thenReturn(userRepository);

      boolean changed = UserUtil.reSyncUserRolesFromToken(null, user, Set.of("DataConsumer"));

      assertFalse(changed);
      verifyNoInteractions(userRepository);
    }
  }

  @Test
  void getUserOrBotFallsBackToBotWhenUserDoesNotExist() {
    EntityReference botReference =
        new EntityReference()
            .withId(UUID.randomUUID())
            .withType(Entity.BOT)
            .withName("ingestion-bot");

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityReferenceByName(Entity.USER, "ingestion-bot", NON_DELETED))
          .thenThrow(new EntityNotFoundException("user"));
      mockedEntity
          .when(() -> Entity.getEntityReferenceByName(Entity.BOT, "ingestion-bot", NON_DELETED))
          .thenReturn(botReference);

      assertEquals(botReference, UserUtil.getUserOrBot("ingestion-bot"));
    }
  }

  @Test
  void getUserNormalizesIdentityFields() {
    UUID teamId = UUID.randomUUID();
    UUID roleId = UUID.randomUUID();
    String domainFqn = "finance";
    EntityReference domainReference =
        new EntityReference().withId(UUID.randomUUID()).withType(Entity.DOMAIN).withName(domainFqn);
    CreateUser create =
        new CreateUser()
            .withName("Alice")
            .withEmail("Alice@Example.COM")
            .withDisplayName("Alice Example")
            .withIsBot(false)
            .withIsAdmin(true)
            .withTeams(List.of(teamId))
            .withRoles(List.of(roleId))
            .withDomains(List.of(domainFqn));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity
          .when(() -> Entity.getEntityReferenceByName(Entity.DOMAIN, domainFqn, NON_DELETED))
          .thenReturn(domainReference);

      User user = UserUtil.getUser("ADMIN", create);

      assertEquals("alice", user.getName());
      assertEquals("alice", user.getFullyQualifiedName());
      assertEquals("alice@example.com", user.getEmail());
      assertEquals("admin", user.getUpdatedBy());
      assertEquals(teamId, user.getTeams().get(0).getId());
      assertEquals(roleId, user.getRoles().get(0).getId());
      assertEquals(domainReference.getId(), user.getDomains().get(0).getId());
    }
  }

  @Test
  void validateUserPersonaPreferencesImageAcceptsHttpsAndRejectsInvalidUrls() {
    LandingPageSettings valid =
        new LandingPageSettings().withHeaderImage("https://cdn.example.com/banner.png");
    UserUtil.validateUserPersonaPreferencesImage(valid);

    BadRequestException schemeError =
        assertThrows(
            BadRequestException.class,
            () ->
                UserUtil.validateUserPersonaPreferencesImage(
                    new LandingPageSettings().withHeaderImage("ftp://cdn.example.com/banner.png")));
    assertTrue(schemeError.getMessage().contains("HTTP or HTTPS"));

    BadRequestException malformedError =
        assertThrows(
            BadRequestException.class,
            () ->
                UserUtil.validateUserPersonaPreferencesImage(
                    new LandingPageSettings().withHeaderImage("not a url")));
    assertTrue(malformedError.getMessage().contains("valid URL"));
  }

  @Test
  void addOrUpdateUserCreatesChangeEventForCreatedUsers() {
    UserRepository userRepository = mock(UserRepository.class);
    CollectionDAO collectionDAO = mock(CollectionDAO.class);
    CollectionDAO.ChangeEventDAO changeEventDAO = mock(CollectionDAO.ChangeEventDAO.class);
    User user =
        new User()
            .withId(UUID.randomUUID())
            .withName("alice")
            .withFullyQualifiedName("alice")
            .withUpdatedAt(1234L)
            .withVersion(1.0);

    when(collectionDAO.changeEventDAO()).thenReturn(changeEventDAO);
    when(userRepository.findByNameOrNull("alice", NON_DELETED)).thenReturn(null);
    when(userRepository.createOrUpdate(null, user, ADMIN_USER_NAME))
        .thenReturn(new PutResponse<>(Response.Status.CREATED, user, EventType.ENTITY_CREATED));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity.when(() -> Entity.getEntityRepository(Entity.USER)).thenReturn(userRepository);
      mockedEntity.when(Entity::getCollectionDAO).thenReturn(collectionDAO);

      User returnedUser = UserUtil.addOrUpdateUser(user);

      assertEquals(user, returnedUser);
      ArgumentCaptor<String> jsonCaptor = ArgumentCaptor.forClass(String.class);
      verify(changeEventDAO).insert(jsonCaptor.capture());
      ChangeEvent changeEvent = JsonUtils.readValue(jsonCaptor.getValue(), ChangeEvent.class);
      assertEquals(EventType.ENTITY_CREATED, changeEvent.getEventType());
      assertEquals(user.getId(), changeEvent.getEntityId());
      assertEquals(user.getName(), changeEvent.getUserName());
    }
  }

  @Test
  void addOrUpdateUserClearsAuthMechanismWhenRepositoryWriteFails() {
    UserRepository userRepository = mock(UserRepository.class);
    User user =
        new User()
            .withId(UUID.randomUUID())
            .withName("alice")
            .withFullyQualifiedName("alice")
            .withAuthenticationMechanism(new AuthenticationMechanism());

    when(userRepository.findByNameOrNull("alice", NON_DELETED)).thenReturn(null);
    when(userRepository.createOrUpdate(null, user, ADMIN_USER_NAME))
        .thenThrow(new RuntimeException("duplicate request"));

    try (MockedStatic<Entity> mockedEntity = mockStatic(Entity.class)) {
      mockedEntity.when(() -> Entity.getEntityRepository(Entity.USER)).thenReturn(userRepository);

      UserCreationException exception =
          assertThrows(UserCreationException.class, () -> UserUtil.addOrUpdateUser(user));

      assertTrue(exception.getMessage().contains("duplicate request"));
      assertNull(user.getAuthenticationMechanism());
    }
  }
}
