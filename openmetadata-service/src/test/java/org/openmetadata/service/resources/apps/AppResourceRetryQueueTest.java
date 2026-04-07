package org.openmetadata.service.resources.apps;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.openmetadata.schema.entity.app.App;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.AppRepository;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.limits.Limits;
import org.openmetadata.service.security.Authorizer;
import org.openmetadata.service.security.policyevaluator.OperationContext;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppResourceRetryQueueTest {

  @Mock private AppRepository repository;
  @Mock private UriInfo uriInfo;
  @Mock private SecurityContext securityContext;
  @Mock private Authorizer authorizer;
  @Mock private Limits limits;
  @Mock private CollectionDAO collectionDAO;
  @Mock private CollectionDAO.SearchIndexRetryQueueDAO retryQueueDAO;

  private AppResource appResource;
  private MockedStatic<Entity> entityMock;

  @BeforeEach
  void setUp() {
    entityMock = mockStatic(Entity.class);
    entityMock.when(() -> Entity.getEntityRepository(Entity.APPLICATION)).thenReturn(repository);
    appResource = new AppResource(authorizer, limits);
  }

  @AfterEach
  void tearDown() {
    entityMock.close();
  }

  @Test
  void listRetryQueue_throwsBadRequestForNonSearchIndexApp() {
    App nonSearchApp = new App().withId(UUID.randomUUID()).withName("DataInsightsApplication");
    when(repository.getByName(any(), eq("DataInsightsApplication"), any()))
        .thenReturn(nonSearchApp);
    when(repository.getFields(eq("id"))).thenReturn(null);

    assertThrows(
        BadRequestException.class,
        () ->
            appResource.listRetryQueue(uriInfo, securityContext, "DataInsightsApplication", 10, 0));
  }

  @Test
  void listRetryQueue_returnsRecordsForSearchIndexingApplication() {
    App searchApp = new App().withId(UUID.randomUUID()).withName("SearchIndexingApplication");
    when(repository.getByName(any(), eq("SearchIndexingApplication"), any())).thenReturn(searchApp);
    when(repository.getFields(eq("id"))).thenReturn(null);
    when(collectionDAO.searchIndexRetryQueueDAO()).thenReturn(retryQueueDAO);
    when(retryQueueDAO.listAll(10, 0)).thenReturn(List.of());
    when(retryQueueDAO.countAll()).thenReturn(0);

    entityMock.when(Entity::getCollectionDAO).thenReturn(collectionDAO);

    Response response =
        appResource.listRetryQueue(uriInfo, securityContext, "SearchIndexingApplication", 10, 0);

    assertEquals(200, response.getStatus());
    assertNotNull(response.getEntity());
    verify(authorizer).authorize(eq(securityContext), any(OperationContext.class), any());
    verify(retryQueueDAO).listAll(10, 0);
    verify(retryQueueDAO).countAll();
  }

  @Test
  void listRetryQueue_passesLimitAndOffset() {
    App searchApp = new App().withId(UUID.randomUUID()).withName("SearchIndexingApplication");
    when(repository.getByName(any(), eq("SearchIndexingApplication"), any())).thenReturn(searchApp);
    when(repository.getFields(eq("id"))).thenReturn(null);
    when(collectionDAO.searchIndexRetryQueueDAO()).thenReturn(retryQueueDAO);
    when(retryQueueDAO.listAll(50, 25)).thenReturn(List.of());
    when(retryQueueDAO.countAll()).thenReturn(100);

    entityMock.when(Entity::getCollectionDAO).thenReturn(collectionDAO);

    Response response =
        appResource.listRetryQueue(uriInfo, securityContext, "SearchIndexingApplication", 50, 25);

    assertEquals(200, response.getStatus());
    verify(authorizer).authorize(eq(securityContext), any(OperationContext.class), any());
    verify(retryQueueDAO).listAll(50, 25);
  }
}
