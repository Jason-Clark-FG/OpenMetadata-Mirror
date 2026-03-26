package org.openmetadata.service.search.elasticsearch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import es.co.elastic.clients.elasticsearch.ElasticsearchClient;
import es.co.elastic.clients.elasticsearch.core.SearchRequest;
import es.co.elastic.clients.elasticsearch.core.SearchResponse;
import es.co.elastic.clients.elasticsearch.core.search.Hit;
import es.co.elastic.clients.elasticsearch.core.search.HitsMetadata;
import es.co.elastic.clients.json.JsonData;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.openmetadata.schema.api.lineage.EntityCountLineageRequest;
import org.openmetadata.schema.api.lineage.LineageDirection;
import org.openmetadata.schema.api.lineage.LineagePaginationInfo;
import org.openmetadata.schema.api.lineage.SearchLineageResult;
import org.openmetadata.service.Entity;
import org.openmetadata.service.search.SearchRepository;
import org.openmetadata.service.util.LineageUtil;

@ExtendWith(MockitoExtension.class)
class ESLineageGraphBuilderTest {

  @Mock private ElasticsearchClient esClient;
  @Mock private SearchResponse<JsonData> searchResponse;
  @Mock private HitsMetadata<JsonData> hitsMetadata;
  @Mock private SearchRepository searchRepository;

  private static final String ROOT_FQN = "service.database.schema.root_table";
  private static final String UPSTREAM_FQN = "service.database.schema.upstream_table";
  private static final String DOWNSTREAM_FQN = "service.database.schema.downstream_table";

  private void stubEsUtilsGetSearchRequest(MockedStatic<EsUtils> esUtilsMock) {
    SearchRequest mockRequest = SearchRequest.of(b -> b.index("test_index"));
    esUtilsMock
        .when(
            () ->
                EsUtils.getSearchRequest(
                    any(LineageDirection.class),
                    anyString(),
                    any(),
                    any(),
                    any(),
                    anyInt(),
                    anyInt(),
                    any(),
                    any(),
                    any()))
        .thenReturn(mockRequest);
  }

  private void stubEsClientSearch() throws IOException {
    when(esClient.search(any(SearchRequest.class), eq(JsonData.class))).thenReturn(searchResponse);
    when(searchResponse.hits()).thenReturn(hitsMetadata);
  }

  @Test
  void getLineagePaginationInfo_withNodeFilter_callsFilteredDepthCounts() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);
      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of());

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 2, 2, queryFilter, false, "table");

      assertNotNull(result);
      assertEquals(1, result.getTotalUpstreamEntities());
      assertEquals(1, result.getTotalDownstreamEntities());
      assertNotNull(result.getUpstreamDepthInfo());
      assertNotNull(result.getDownstreamDepthInfo());
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void getLineagePaginationInfo_withNodeFilter_returnsFilteredCounts() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> upstreamDoc = new HashMap<>();
      upstreamDoc.put("fullyQualifiedName", UPSTREAM_FQN);
      upstreamDoc.put("entityType", "table");

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(upstreamDoc);

      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      Map<String, Object> matchingResult = new HashMap<>();
      matchingResult.put(UPSTREAM_FQN, upstreamDoc);

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntitiesByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      anySet(),
                      anyInt(),
                      anyInt(),
                      anyList(),
                      anyString()))
          .thenReturn(matchingResult);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);
      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 1, 0, queryFilter, false, "table");

      assertNotNull(result);
      assertTrue(result.getTotalUpstreamEntities() >= 1);
      assertNotNull(result.getUpstreamDepthInfo());
      assertFalse(result.getUpstreamDepthInfo().isEmpty());
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void searchLineageByEntityCount_withQueryFilter_exercisesFilteredPath() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class);
        MockedStatic<LineageUtil> lineageUtilMock =
            mockStatic(LineageUtil.class, Mockito.CALLS_REAL_METHODS)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Map<String, Object> rootDoc = new HashMap<>();
      rootDoc.put("fullyQualifiedName", ROOT_FQN);
      rootDoc.put("entityType", "table");

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(rootDoc);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> downstreamDoc = new HashMap<>();
      downstreamDoc.put("fullyQualifiedName", DOWNSTREAM_FQN);
      downstreamDoc.put("entityType", "table");
      downstreamDoc.put("id", java.util.UUID.randomUUID().toString());

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(downstreamDoc);

      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      Map<String, Object> matchingDocs = new HashMap<>();
      matchingDocs.put(DOWNSTREAM_FQN, downstreamDoc);

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntitiesByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      anySet(),
                      anyInt(),
                      anyInt(),
                      anyList(),
                      anyString()))
          .thenReturn(matchingDocs);

      lineageUtilMock
          .when(() -> LineageUtil.replaceWithEntityLevelTagsBatch(anyList()))
          .then(invocation -> null);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      EntityCountLineageRequest request =
          new EntityCountLineageRequest()
              .withFqn(ROOT_FQN)
              .withDirection(LineageDirection.DOWNSTREAM)
              .withMaxDepth(2)
              .withQueryFilter(queryFilter)
              .withIncludeDeleted(false)
              .withFrom(0)
              .withSize(50)
              .withIncludeSourceFields(Set.of())
              .withIsConnectedVia(false);

      SearchLineageResult result = builder.searchLineageByEntityCount(request);

      assertNotNull(result);
      assertNotNull(result.getNodes());
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void searchLineageByEntityCount_withQueryFilter_upstreamNegatesDepth() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class);
        MockedStatic<LineageUtil> lineageUtilMock =
            mockStatic(LineageUtil.class, Mockito.CALLS_REAL_METHODS)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Map<String, Object> rootDoc = new HashMap<>();
      rootDoc.put("fullyQualifiedName", ROOT_FQN);
      rootDoc.put("entityType", "table");

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(rootDoc);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> upstreamDoc = new HashMap<>();
      upstreamDoc.put("fullyQualifiedName", UPSTREAM_FQN);
      upstreamDoc.put("entityType", "table");

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(upstreamDoc);

      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      Map<String, Object> matchingDocs = new HashMap<>();
      matchingDocs.put(UPSTREAM_FQN, upstreamDoc);

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntitiesByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      anySet(),
                      anyInt(),
                      anyInt(),
                      anyList(),
                      anyString()))
          .thenReturn(matchingDocs);

      lineageUtilMock
          .when(() -> LineageUtil.replaceWithEntityLevelTagsBatch(anyList()))
          .then(invocation -> null);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      EntityCountLineageRequest request =
          new EntityCountLineageRequest()
              .withFqn(ROOT_FQN)
              .withDirection(LineageDirection.UPSTREAM)
              .withMaxDepth(2)
              .withQueryFilter(queryFilter)
              .withIncludeDeleted(false)
              .withFrom(0)
              .withSize(50)
              .withIncludeSourceFields(Set.of())
              .withIsConnectedVia(false);

      SearchLineageResult result = builder.searchLineageByEntityCount(request);

      assertNotNull(result);
      assertNotNull(result.getNodes());
    }
  }

  @Test
  void getLineagePaginationInfo_withNodeFilter_emptyEntities_returnsEmptyDepthCounts()
      throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);
      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of());

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 1, 1, queryFilter, false, "table");

      assertNotNull(result);
      assertEquals(1, result.getTotalUpstreamEntities());
      assertEquals(1, result.getTotalDownstreamEntities());
    }
  }

  @Test
  void searchLineageByEntityCount_withNodeDepthZero_returnsRootOnly() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);

      Map<String, Object> rootDoc = new HashMap<>();
      rootDoc.put("fullyQualifiedName", ROOT_FQN);
      rootDoc.put("entityType", "table");

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(rootDoc);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      EntityCountLineageRequest request =
          new EntityCountLineageRequest()
              .withFqn(ROOT_FQN)
              .withDirection(LineageDirection.DOWNSTREAM)
              .withMaxDepth(2)
              .withNodeDepth(0)
              .withIncludeDeleted(false)
              .withFrom(0)
              .withSize(50)
              .withIncludeSourceFields(Set.of())
              .withIsConnectedVia(false);

      SearchLineageResult result = builder.searchLineageByEntityCount(request);

      assertNotNull(result);
      assertTrue(result.getNodes().containsKey(ROOT_FQN));
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void searchLineageByEntityCount_withQueryFilter_emptyMatchingDocs() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class);
        MockedStatic<LineageUtil> lineageUtilMock =
            mockStatic(LineageUtil.class, Mockito.CALLS_REAL_METHODS)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Map<String, Object> rootDoc = new HashMap<>();
      rootDoc.put("fullyQualifiedName", ROOT_FQN);
      rootDoc.put("entityType", "table");

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(rootDoc);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> entityDoc = new HashMap<>();
      entityDoc.put("fullyQualifiedName", DOWNSTREAM_FQN);
      entityDoc.put("entityType", "table");

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(entityDoc);

      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntitiesByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      anySet(),
                      anyInt(),
                      anyInt(),
                      anyList(),
                      anyString()))
          .thenReturn(new HashMap<>());

      lineageUtilMock
          .when(() -> LineageUtil.replaceWithEntityLevelTagsBatch(anyList()))
          .then(invocation -> null);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"dashboard\"}}]}}}";

      EntityCountLineageRequest request =
          new EntityCountLineageRequest()
              .withFqn(ROOT_FQN)
              .withDirection(LineageDirection.DOWNSTREAM)
              .withMaxDepth(1)
              .withQueryFilter(queryFilter)
              .withIncludeDeleted(false)
              .withFrom(0)
              .withSize(50)
              .withIncludeSourceFields(Set.of())
              .withIsConnectedVia(false);

      SearchLineageResult result = builder.searchLineageByEntityCount(request);

      assertNotNull(result);
      assertNotNull(result.getNodes());
    }
  }

  @Test
  void getLineagePaginationInfo_withNodeFilter_zeroDepths_skipsFilteredCounts() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 0, 0, queryFilter, false, "table");

      assertNotNull(result);
      assertEquals(1, result.getTotalUpstreamEntities());
      assertEquals(1, result.getTotalDownstreamEntities());
      assertEquals(0, result.getMaxUpstreamDepth());
      assertEquals(0, result.getMaxDownstreamDepth());
    }
  }

  @Test
  void getLineagePaginationInfo_noQueryFilter_callsDepthWiseEntityCounts() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);
      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of());

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      // null queryFilter exercises the else branch (getDepthWiseEntityCounts)
      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 2, 2, null, false, "table");

      assertNotNull(result);
      assertNotNull(result.getUpstreamDepthInfo());
      assertNotNull(result.getDownstreamDepthInfo());
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void getLineagePaginationInfo_withNodeFilter_downstreamEntities_exercisesFilteredCounts()
      throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> downstreamDoc = new HashMap<>();
      downstreamDoc.put("fullyQualifiedName", DOWNSTREAM_FQN);
      downstreamDoc.put("entityType", "table");

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(downstreamDoc);

      stubEsClientSearch();
      // First call returns one hit (downstream entity at depth 1), second returns empty
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      Map<String, Object> matchingResult = new HashMap<>();
      matchingResult.put(DOWNSTREAM_FQN, downstreamDoc);

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntitiesByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      anySet(),
                      anyInt(),
                      anyInt(),
                      anyList(),
                      anyString()))
          .thenReturn(matchingResult);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);
      String queryFilter =
          "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"entityType\":\"table\"}}]}}}";

      // Downstream direction — BFS discovers entities via fullyQualifiedName field
      LineagePaginationInfo result =
          builder.getLineagePaginationInfo(ROOT_FQN, 0, 1, queryFilter, false, "table");

      assertNotNull(result);
      assertNotNull(result.getDownstreamDepthInfo());
      assertTrue(result.getTotalDownstreamEntities() >= 1);
    }
  }

  @SuppressWarnings("unchecked")
  @Test
  void searchLineageByEntityCount_noFilter_exercisesUnfilteredPagination() throws IOException {
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class);
        MockedStatic<EsUtils> esUtilsMock = mockStatic(EsUtils.class);
        MockedStatic<LineageUtil> lineageUtilMock =
            mockStatic(LineageUtil.class, Mockito.CALLS_REAL_METHODS)) {

      entityMock.when(Entity::getSearchRepository).thenReturn(searchRepository);
      stubEsUtilsGetSearchRequest(esUtilsMock);

      Map<String, Object> rootDoc = new HashMap<>();
      rootDoc.put("fullyQualifiedName", ROOT_FQN);
      rootDoc.put("entityType", "table");

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(rootDoc);

      Hit<JsonData> mockHit = (Hit<JsonData>) Mockito.mock(Hit.class);
      JsonData mockJsonData = Mockito.mock(JsonData.class);
      when(mockHit.source()).thenReturn(mockJsonData);

      Map<String, Object> downstreamDoc = new HashMap<>();
      downstreamDoc.put("fullyQualifiedName", DOWNSTREAM_FQN);
      downstreamDoc.put("entityType", "table");
      downstreamDoc.put("id", java.util.UUID.randomUUID().toString());

      esUtilsMock.when(() -> EsUtils.jsonDataToMap(any(JsonData.class))).thenReturn(downstreamDoc);

      stubEsClientSearch();
      when(hitsMetadata.hits()).thenReturn(List.of(mockHit), List.of());

      esUtilsMock
          .when(
              () ->
                  EsUtils.searchEntityByKey(
                      any(ElasticsearchClient.class),
                      any(),
                      anyString(),
                      anyString(),
                      any(),
                      anyList()))
          .thenReturn(downstreamDoc);

      lineageUtilMock
          .when(() -> LineageUtil.replaceWithEntityLevelTagsBatch(anyList()))
          .then(invocation -> null);

      ESLineageGraphBuilder builder = new ESLineageGraphBuilder(esClient);

      // No queryFilter, no columnFilter — exercises the unfiltered pagination path
      EntityCountLineageRequest request =
          new EntityCountLineageRequest()
              .withFqn(ROOT_FQN)
              .withDirection(LineageDirection.DOWNSTREAM)
              .withMaxDepth(1)
              .withNodeDepth(1)
              .withIncludeDeleted(false)
              .withFrom(0)
              .withSize(50)
              .withIncludeSourceFields(Set.of())
              .withIsConnectedVia(false);

      SearchLineageResult result = builder.searchLineageByEntityCount(request);

      assertNotNull(result);
      assertNotNull(result.getNodes());
    }
  }
}
