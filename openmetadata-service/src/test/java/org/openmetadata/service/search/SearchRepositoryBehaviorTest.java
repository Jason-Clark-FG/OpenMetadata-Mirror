package org.openmetadata.service.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.apache.commons.lang3.tuple.Pair;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.EntityTimeSeriesInterface;
import org.openmetadata.schema.service.configuration.elasticsearch.ElasticSearchConfiguration;
import org.openmetadata.schema.type.AssetCertification;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.FieldChange;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.entity.classification.Tag;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.search.IndexMapping;
import org.openmetadata.search.IndexMappingLoader;
import org.openmetadata.service.Entity;
import org.openmetadata.service.events.lifecycle.EntityLifecycleEventDispatcher;

class SearchRepositoryBehaviorTest {

  private static final IndexMapping TABLE_MAPPING =
      IndexMapping.builder()
          .indexName("table_search_index")
          .alias("table")
          .childAliases(List.of("column_search_index"))
          .indexMappingFile("/elasticsearch/%s/table_index_mapping.json")
          .build();

  private static final IndexMapping DOMAIN_MAPPING =
      IndexMapping.builder()
          .indexName("domain_search_index")
          .alias("domain")
          .childAliases(List.of("domain_search_index"))
          .indexMappingFile("/elasticsearch/%s/domain_index_mapping.json")
          .build();

  private static final IndexMapping DATA_PRODUCT_MAPPING =
      IndexMapping.builder()
          .indexName("data_product_search_index")
          .alias("dataProduct")
          .childAliases(List.of("data_product_search_index"))
          .indexMappingFile("/elasticsearch/%s/data_product_index_mapping.json")
          .build();

  private static final IndexMapping DATABASE_SERVICE_MAPPING =
      IndexMapping.builder()
          .indexName("database_service_search_index")
          .alias("databaseService")
          .childAliases(List.of("database_search_index"))
          .indexMappingFile("/elasticsearch/%s/database_service_index_mapping.json")
          .build();

  private SearchClient searchClient;
  private SearchIndexFactory searchIndexFactory;
  private SearchRepository repository;

  @BeforeEach
  void setUp() {
    searchClient = mock(SearchClient.class);
    searchIndexFactory = mock(SearchIndexFactory.class);
    repository =
        newRepository(
            Map.of(
                Entity.TABLE, TABLE_MAPPING,
                Entity.DOMAIN, DOMAIN_MAPPING,
                Entity.DATA_PRODUCT, DATA_PRODUCT_MAPPING,
                Entity.DATABASE_SERVICE, DATABASE_SERVICE_MAPPING,
                Entity.TAG, TABLE_MAPPING),
            "cluster");
    Entity.setSearchRepository(repository);
  }

  @Test
  void indexNameHelpersRespectClusterAlias() {
    assertEquals(
        "cluster_table_search_index,cluster_domain_search_index",
        repository.getIndexOrAliasName("table_search_index, domain_search_index"));
    assertEquals("table_search_index", repository.getIndexNameWithoutAlias("cluster_table_search_index"));
  }

  @Test
  void indexExistsFallsBackToAliasLookup() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(false);
    when(searchClient.getIndicesByAlias("cluster_table_search_index")).thenReturn(Set.of("table_v1"));

    assertTrue(repository.indexExists(TABLE_MAPPING));
  }

  @Test
  void createIndexRemovesLateAppearingAliasTargetsBeforeCreatingIndex() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(false);
    when(searchClient.getIndicesByAlias("cluster_table_search_index"))
        .thenReturn(Set.of(), Set.of("legacy_table_index"));

    repository.createIndex(TABLE_MAPPING);

    verify(searchClient).removeAliases("legacy_table_index", Set.of("cluster_table_search_index"));
    verify(searchClient).deleteIndex("legacy_table_index");
    verify(searchClient).createIndex(eq(TABLE_MAPPING), any(String.class));
    verify(searchClient).createAliases(TABLE_MAPPING);
  }

  @Test
  void createIndexSkipsExistingIndices() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(true);

    repository.createIndex(TABLE_MAPPING);

    verify(searchClient, never()).createIndex(eq(TABLE_MAPPING), any(String.class));
    verify(searchClient, never()).createAliases(TABLE_MAPPING);
  }

  @Test
  void updateIndexCreatesMissingIndexAndAliasesIt() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(false);
    when(searchClient.getIndicesByAlias("cluster_table_search_index")).thenReturn(Set.of());

    repository.updateIndex(TABLE_MAPPING);

    verify(searchClient).createIndex(eq(TABLE_MAPPING), any(String.class));
    verify(searchClient).createAliases(TABLE_MAPPING);
  }

  @Test
  void updateIndexUpdatesExistingIndicesInPlace() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(true);

    repository.updateIndex(TABLE_MAPPING);

    verify(searchClient).updateIndex(eq(TABLE_MAPPING), any(String.class));
    verify(searchClient).createAliases(TABLE_MAPPING);
  }

  @Test
  void deleteIndexRemovesAliasTargetsWhenConcreteIndexIsAbsent() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(false);
    when(searchClient.getIndicesByAlias("cluster_table_search_index"))
        .thenReturn(Set.of("table_v1", "table_v2"));

    repository.deleteIndex(TABLE_MAPPING);

    verify(searchClient).removeAliases("table_v1", Set.of("cluster_table_search_index"));
    verify(searchClient).removeAliases("table_v2", Set.of("cluster_table_search_index"));
    verify(searchClient).deleteIndex("table_v1");
    verify(searchClient).deleteIndex("table_v2");
  }

  @Test
  void deleteIndexDeletesConcreteIndexWhenItExists() {
    when(searchClient.indexExists("cluster_table_search_index")).thenReturn(true);

    repository.deleteIndex(TABLE_MAPPING);

    verify(searchClient).deleteIndex(TABLE_MAPPING);
  }

  @Test
  void createEntityIndexBuildsAndWritesSearchDocument() throws IOException {
    UUID entityId = UUID.randomUUID();
    EntityInterface entity = mockEntity(Entity.TABLE, entityId, "orders");
    when(searchIndexFactory.buildIndex(Entity.TABLE, entity))
        .thenReturn(new MapBackedSearchIndex(entity, Map.of("name", "orders")));

    repository.createEntityIndex(entity);

    ArgumentCaptor<String> docCaptor = ArgumentCaptor.forClass(String.class);
    verify(searchClient).createEntity(eq("cluster_table_search_index"), eq(entityId.toString()), docCaptor.capture());
    assertTrue(docCaptor.getValue().contains("\"name\":\"orders\""));
  }

  @Test
  void createEntityIndexSkipsUnsupportedTypes() throws IOException {
    repository.createEntityIndex(mockEntity("unsupported", UUID.randomUUID(), "skip-me"));

    verify(searchClient, never()).createEntity(any(String.class), any(String.class), any(String.class));
  }

  @Test
  void createEntitiesIndexBulkWritesDocumentsOfTheSameType() throws IOException {
    EntityInterface first = mockEntity(Entity.TABLE, UUID.randomUUID(), "orders");
    EntityInterface second = mockEntity(Entity.TABLE, UUID.randomUUID(), "customers");
    when(searchIndexFactory.buildIndex(Entity.TABLE, first))
        .thenReturn(new MapBackedSearchIndex(first, Map.of("name", "orders")));
    when(searchIndexFactory.buildIndex(Entity.TABLE, second))
        .thenReturn(new MapBackedSearchIndex(second, Map.of("name", "customers")));

    repository.createEntitiesIndex(List.of(first, second));

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<Map<String, String>>> docsCaptor = ArgumentCaptor.forClass(List.class);
    verify(searchClient).createEntities(eq("cluster_table_search_index"), docsCaptor.capture());
    assertEquals(2, docsCaptor.getValue().size());
  }

  @Test
  void createEntitiesIndexSkipsEmptyEntityLists() throws IOException {
    repository.createEntitiesIndex(List.of());

    verify(searchClient, never()).createEntities(any(String.class), any(List.class));
  }

  @Test
  void createTimeSeriesEntityWritesGenericTimeSeriesDocuments() throws IOException {
    EntityTimeSeriesInterface entity = mockTimeSeriesEntity(Entity.TABLE, UUID.randomUUID(), "orders_ts");
    when(searchIndexFactory.buildIndex(Entity.TABLE, entity))
        .thenReturn(new MapBackedSearchIndex(entity, Map.of("timestamp", 42)));

    repository.createTimeSeriesEntity(entity);

    verify(searchClient)
        .createTimeSeriesEntity(
            "cluster_table_search_index",
            entity.getId().toString(),
            JsonUtils.pojoToJson(Map.of("timestamp", 42)));
  }

  @Test
  void updateTimeSeriesEntityUsesDefaultUpdateScript() {
    EntityTimeSeriesInterface entity = mockTimeSeriesEntity(Entity.TABLE, UUID.randomUUID(), "orders_ts");
    when(searchIndexFactory.buildIndex(Entity.TABLE, entity))
        .thenReturn(new MapBackedSearchIndex(entity, Map.of("timestamp", 42)));

    repository.updateTimeSeriesEntity(entity);

    verify(searchClient)
        .updateEntity(
            "cluster_table_search_index",
            entity.getId().toString(),
            Map.of("timestamp", 42),
            SearchClient.DEFAULT_UPDATE_SCRIPT);
  }

  @Test
  void updateEntityIndexPropagatesWhenTagRenameAffectsChildren() throws Exception {
    SearchRepository spyRepository = spy(repository);
    Tag tag = mock(Tag.class);
    EntityReference entityReference = new EntityReference().withId(UUID.randomUUID()).withType(Entity.TAG);
    ChangeDescription changeDescription =
        changeDescription(List.of(), List.of(new FieldChange().withName(Entity.FIELD_NAME).withOldValue("oldTag").withNewValue("newTag")), List.of())
            .withPreviousVersion(1.0);
    when(tag.getEntityReference()).thenReturn(entityReference);
    when(tag.getId()).thenReturn(entityReference.getId());
    when(tag.getVersion()).thenReturn(2.0);
    when(tag.getChangeDescription()).thenReturn(changeDescription);
    when(tag.getIncrementalChangeDescription()).thenReturn(null);
    when(tag.getFullyQualifiedName()).thenReturn("Classification.oldTag");
    when(searchIndexFactory.buildIndex(Entity.TAG, tag))
        .thenReturn(new MapBackedSearchIndex(tag, Map.of("name", "newTag")));
    doNothing().when(spyRepository).propagateInheritedFieldsToChildren(any(), any(), any(), any(), any());
    doNothing().when(spyRepository).propagateGlossaryTags(any(), any(), any());
    doNothing().when(spyRepository).propagateCertificationTags(any(), any(), any());
    doNothing().when(spyRepository).propagateToRelatedEntities(any(), any(), any(), any());

    spyRepository.updateEntityIndex(tag);

    verify(searchClient).updateEntity(eq("cluster_table_search_index"), eq(entityReference.getId().toString()), any(Map.class), any(String.class));
    verify(spyRepository).propagateInheritedFieldsToChildren(eq(Entity.TAG), eq(entityReference.getId().toString()), eq(changeDescription), eq(TABLE_MAPPING), eq(tag));
    verify(spyRepository).propagateGlossaryTags(eq(Entity.TAG), eq("Classification.oldTag"), eq(changeDescription));
    verify(spyRepository).propagateCertificationTags(eq(Entity.TAG), eq(tag), eq(changeDescription));
    verify(spyRepository).propagateToRelatedEntities(eq(Entity.TAG), eq(changeDescription), eq(TABLE_MAPPING), eq(tag));
  }

  @Test
  void deleteByScriptUsesTheMappedEntityIndex() throws IOException {
    repository.deleteByScript(Entity.TABLE, "ctx._source.remove('deleted')", Map.of("field", "deleted"));

    verify(searchClient)
        .deleteByScript(
            "cluster_table_search_index",
            "ctx._source.remove('deleted')",
            Map.of("field", "deleted"));
  }

  @Test
  void propagateInheritedFieldsToChildrenUsesServiceParentFieldForServiceDisplayNameChanges()
      throws IOException {
    EntityInterface serviceEntity = mockEntity(Entity.DATABASE_SERVICE, UUID.randomUUID(), "svc");
    ChangeDescription changeDescription =
        changeDescription(
            List.of(),
            List.of(
                new FieldChange()
                    .withName(Entity.FIELD_DISPLAY_NAME)
                    .withOldValue("Old Service")
                    .withNewValue("New Service")),
            List.of());

    repository.propagateInheritedFieldsToChildren(
        Entity.DATABASE_SERVICE, "service-id", changeDescription, DATABASE_SERVICE_MAPPING, serviceEntity);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<Pair<String, String>> fieldCaptor = ArgumentCaptor.forClass(Pair.class);
    @SuppressWarnings("unchecked")
    ArgumentCaptor<Pair<String, Map<String, Object>>> updateCaptor = ArgumentCaptor.forClass(Pair.class);
    verify(searchClient)
        .updateChildren(eq(List.of("cluster_database_search_index")), fieldCaptor.capture(), updateCaptor.capture());
    assertEquals("service.id", fieldCaptor.getValue().getLeft());
    assertEquals("service-id", fieldCaptor.getValue().getRight());
    assertEquals("New Service", updateCaptor.getValue().getRight().get(Entity.FIELD_DISPLAY_NAME));
  }

  @Test
  void propagateInheritedFieldsToChildrenUpdatesDomainChildrenAndDataProductsSeparately()
      throws IOException {
    EntityInterface domainEntity = mockEntity(Entity.DOMAIN, UUID.randomUUID(), "finance");
    ChangeDescription changeDescription =
        changeDescription(
            List.of(),
            List.of(
                new FieldChange()
                    .withName(Entity.FIELD_DISPLAY_NAME)
                    .withOldValue("Old Domain")
                    .withNewValue("New Domain")),
            List.of());

    repository.propagateInheritedFieldsToChildren(
        Entity.DOMAIN, "domain-id", changeDescription, DOMAIN_MAPPING, domainEntity);

    verify(searchClient)
        .updateChildren(eq(List.of("cluster_domain_search_index")), any(Pair.class), any(Pair.class));
    verify(searchClient)
        .updateChildren(eq(List.of("cluster_data_product_search_index")), any(Pair.class), any(Pair.class));
  }

  @Test
  void deleteEntityByFqnPrefixUsesEntityIndex() throws IOException {
    EntityInterface entity = mockEntity(Entity.TABLE, UUID.randomUUID(), "orders");

    repository.deleteEntityByFQNPrefix(entity);

    verify(searchClient).deleteEntityByFQNPrefix("cluster_table_search_index", "svc.db.schema.orders");
  }

  @Test
  void deleteTimeSeriesEntityByIdUsesEntityIndex() throws IOException {
    EntityTimeSeriesInterface entity = mockTimeSeriesEntity(Entity.TABLE, UUID.randomUUID(), "orders_ts");

    repository.deleteTimeSeriesEntityById(entity);

    verify(searchClient).deleteEntity("cluster_table_search_index", entity.getId().toString());
  }

  @Test
  void propagateGlossaryTagsMarksPropagatedTagsAsDerived() {
    TagLabel tagLabel =
        new TagLabel()
            .withTagFQN("Glossary.Term")
            .withName("Term")
            .withLabelType(TagLabel.LabelType.MANUAL);
    ChangeDescription changeDescription =
        changeDescription(
            List.of(new FieldChange().withName(Entity.FIELD_TAGS).withNewValue(JsonUtils.pojoToJson(List.of(tagLabel)))),
            List.of(),
            List.of());

    repository.propagateGlossaryTags(Entity.GLOSSARY_TERM, "Glossary.Term", changeDescription);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<Pair<String, Map<String, Object>>> updateCaptor = ArgumentCaptor.forClass(Pair.class);
    verify(searchClient)
        .updateChildren(eq(SearchClient.GLOBAL_SEARCH_ALIAS), any(Pair.class), updateCaptor.capture());
    @SuppressWarnings("unchecked")
    List<TagLabel> propagated = (List<TagLabel>) updateCaptor.getValue().getRight().get("tagAdded");
    assertEquals(TagLabel.LabelType.DERIVED, propagated.getFirst().getLabelType());
  }

  @Test
  void propagateCertificationTagsUpdatesDataAssetsForCertificationTags() {
    Tag tag = mock(Tag.class);
    when(tag.getClassification())
        .thenReturn(new EntityReference().withFullyQualifiedName("Certification"));
    when(tag.getName()).thenReturn("Gold");
    when(tag.getDescription()).thenReturn("Certified");
    when(tag.getFullyQualifiedName()).thenReturn("Certification.Gold");
    when(tag.getStyle()).thenReturn(null);

    repository.propagateCertificationTags(Entity.TAG, tag, changeDescription(List.of(), List.of(), List.of()));

    verify(searchClient)
        .updateChildren(eq(SearchClient.DATA_ASSET_SEARCH_ALIAS), any(Pair.class), any(Pair.class));
  }

  @Test
  void propagateCertificationTagsUpdatesEntityCertificationDocument() {
    Table table = mock(Table.class);
    UUID entityId = UUID.randomUUID();
    when(table.getId()).thenReturn(entityId);
    when(table.getEntityReference())
        .thenReturn(new EntityReference().withId(entityId).withType(Entity.TABLE));
    when(table.getCertification())
        .thenReturn(
            new AssetCertification()
                .withTagLabel(
                    new TagLabel()
                        .withName("Gold")
                        .withDescription("Certified")
                        .withTagFQN("Certification.Gold")));
    ChangeDescription changeDescription =
        changeDescription(
            List.of(),
            List.of(new FieldChange().withName("certification").withOldValue("{}").withNewValue("{}")),
            List.of());

    repository.propagateCertificationTags(Entity.TABLE, table, changeDescription);

    verify(searchClient)
        .updateEntity(eq("cluster_table_search_index"), eq(entityId.toString()), any(Map.class), eq(SearchClient.UPDATE_CERTIFICATION_SCRIPT));
  }

  @Test
  void deleteAndSoftDeleteOperationsSkipUnsupportedTypesButHandleMappedEntities() throws IOException {
    EntityInterface entity = mockEntity(Entity.TABLE, UUID.randomUUID(), "orders");
    SearchRepository spyRepository = spy(repository);
    doNothing().when(spyRepository).deleteOrUpdateChildren(any(), any());
    doNothing().when(spyRepository).softDeleteOrRestoredChildren(any(), any(), anyBoolean());

    spyRepository.deleteEntityIndex(entity);
    spyRepository.softDeleteOrRestoreEntityIndex(entity, true);

    verify(searchClient).deleteEntity("cluster_table_search_index", entity.getId().toString());
    verify(searchClient)
        .softDeleteOrRestoreEntity(
            "cluster_table_search_index",
            entity.getId().toString(),
            String.format(SearchClient.SOFT_DELETE_RESTORE_SCRIPT, true));

    EntityInterface unsupported = mockEntity("unsupported", UUID.randomUUID(), "skip-me");
    spyRepository.deleteEntityIndex(unsupported);
    verify(searchClient, never())
        .deleteEntity("cluster_unsupported_search_index", unsupported.getId().toString());
  }

  private SearchRepository newRepository(Map<String, IndexMapping> entityIndexMap, String clusterAlias) {
    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setClusterAlias(clusterAlias);
    config.setSearchType(ElasticSearchConfiguration.SearchType.ELASTICSEARCH);

    IndexMappingLoader mappingLoader = mock(IndexMappingLoader.class);
    when(mappingLoader.getIndexMapping()).thenReturn(entityIndexMap);
    EntityLifecycleEventDispatcher dispatcher = mock(EntityLifecycleEventDispatcher.class);
    TestSearchRepository.overrideSearchClient(searchClient);
    TestSearchRepository.overrideSearchIndexFactory(searchIndexFactory);
    try (var loaderMock = mockStatic(IndexMappingLoader.class);
        var dispatcherMock = mockStatic(EntityLifecycleEventDispatcher.class)) {
      loaderMock.when(IndexMappingLoader::getInstance).thenReturn(mappingLoader);
      dispatcherMock.when(EntityLifecycleEventDispatcher::getInstance).thenReturn(dispatcher);
      return new TestSearchRepository(config, 4);
    } finally {
      TestSearchRepository.clearOverrides();
    }
  }

  private EntityInterface mockEntity(String entityType, UUID id, String name) {
    EntityInterface entity = mock(EntityInterface.class);
    EntityReference entityReference = new EntityReference().withId(id).withType(entityType).withName(name);
    when(entity.getEntityReference()).thenReturn(entityReference);
    when(entity.getId()).thenReturn(id);
    when(entity.getName()).thenReturn(name);
    when(entity.getFullyQualifiedName()).thenReturn("svc.db.schema." + name);
    when(entity.getVersion()).thenReturn(1.0);
    return entity;
  }

  private EntityTimeSeriesInterface mockTimeSeriesEntity(String entityType, UUID id, String name) {
    EntityTimeSeriesInterface entity = mock(EntityTimeSeriesInterface.class);
    EntityReference entityReference =
        new EntityReference().withId(id).withType(entityType).withName(name);
    when(entity.getEntityReference()).thenReturn(entityReference);
    when(entity.getId()).thenReturn(id);
    return entity;
  }

  private ChangeDescription changeDescription(
      List<FieldChange> fieldsAdded, List<FieldChange> fieldsUpdated, List<FieldChange> fieldsDeleted) {
    return new ChangeDescription()
        .withFieldsAdded(fieldsAdded)
        .withFieldsUpdated(fieldsUpdated)
        .withFieldsDeleted(fieldsDeleted);
  }

  private static final class TestSearchRepository extends SearchRepository {
    private static final ThreadLocal<SearchClient> SEARCH_CLIENT_OVERRIDE = new ThreadLocal<>();
    private static final ThreadLocal<SearchIndexFactory> INDEX_FACTORY_OVERRIDE = new ThreadLocal<>();

    private TestSearchRepository(ElasticSearchConfiguration config, int maxDBConnections) {
      super(config, maxDBConnections);
    }

    static void overrideSearchClient(SearchClient searchClient) {
      SEARCH_CLIENT_OVERRIDE.set(searchClient);
    }

    static void overrideSearchIndexFactory(SearchIndexFactory searchIndexFactory) {
      INDEX_FACTORY_OVERRIDE.set(searchIndexFactory);
    }

    static void clearOverrides() {
      SEARCH_CLIENT_OVERRIDE.remove();
      INDEX_FACTORY_OVERRIDE.remove();
    }

    @Override
    public SearchClient buildSearchClient(ElasticSearchConfiguration config) {
      return SEARCH_CLIENT_OVERRIDE.get();
    }

    @Override
    public SearchIndexFactory buildIndexFactory() {
      return INDEX_FACTORY_OVERRIDE.get();
    }
  }

  private static final class MapBackedSearchIndex
      implements org.openmetadata.service.search.indexes.SearchIndex {
    private final Object entity;
    private final Map<String, Object> document;

    private MapBackedSearchIndex(Object entity, Map<String, Object> document) {
      this.entity = entity;
      this.document = document;
    }

    @Override
    public Object getEntity() {
      return entity;
    }

    @Override
    public Map<String, Object> buildSearchIndexDoc() {
      return document;
    }

    @Override
    public Map<String, Object> buildSearchIndexDocInternal(Map<String, Object> esDoc) {
      return document;
    }
  }
}
