package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.openmetadata.schema.type.Include.ALL;
import static org.openmetadata.schema.type.Include.DELETED;
import static org.openmetadata.schema.type.Include.NON_DELETED;
import static org.openmetadata.service.Entity.DATA_CONTRACT;
import static org.openmetadata.service.Entity.FIELD_DATA_CONTRACT;
import static org.openmetadata.service.Entity.FIELD_OWNERS;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.openmetadata.schema.entity.Bot;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;

@ExtendWith(MockitoExtension.class)
class DataContractFieldSupportTest {

  @Mock private CollectionDAO mockCollectionDAO;
  @Mock private CollectionDAO.EntityRelationshipDAO mockRelationshipDAO;
  @Mock private EntityDAO<Table> mockEntityDAO;
  @Mock private EntityRelationshipRepository mockEntityRelRepo;

  private TestTableRepository repository;

  static class TestTableRepository extends EntityRepository<Table> {
    TestTableRepository(CollectionDAO collectionDAO, EntityDAO<Table> entityDAO) {
      super("/tables", "table", Table.class, entityDAO, "", "", Set.of());
    }

    @Override
    protected void setFields(Table entity, Fields fields, RelationIncludes relationIncludes) {}

    @Override
    protected void clearFields(Table entity, Fields fields) {}

    @Override
    protected void prepare(Table entity, boolean update) {}

    @Override
    protected void storeEntity(Table entity, boolean update) {}

    @Override
    protected void storeRelationships(Table entity) {}

    EntityReference callGetDataContract(Table entity, Include include) {
      return getDataContract(entity, include);
    }

    EntityReference callGetDataContractNoArg(Table entity) {
      return getDataContract(entity);
    }
  }

  static class TestBotRepository extends EntityRepository<Bot> {
    TestBotRepository(CollectionDAO collectionDAO, EntityDAO<Bot> entityDAO) {
      super("/bots", "bot", Bot.class, entityDAO, "", "", Set.of());
    }

    @Override
    protected void setFields(Bot entity, Fields fields, RelationIncludes relationIncludes) {}

    @Override
    protected void clearFields(Bot entity, Fields fields) {}

    @Override
    protected void prepare(Bot entity, boolean update) {}

    @Override
    protected void storeEntity(Bot entity, boolean update) {}

    @Override
    protected void storeRelationships(Bot entity) {}
  }

  @BeforeEach
  void setUp() {
    lenient().when(mockCollectionDAO.relationshipDAO()).thenReturn(mockRelationshipDAO);
    Entity.setCollectionDAO(mockCollectionDAO);
    Entity.setEntityRelationshipRepository(mockEntityRelRepo);
    repository = new TestTableRepository(mockCollectionDAO, mockEntityDAO);
  }

  @AfterEach
  void tearDown() {
    Entity.cleanup();
  }

  @Test
  void constructor_setsSupportsDataContract() {
    assertTrue(repository.supportsDataContract);
  }

  @Test
  void setFieldsInternal_preservesDataContractWhenNotInFields() {
    Table table = new Table();
    table.setId(UUID.randomUUID());
    EntityReference existingContract =
        new EntityReference().withId(UUID.randomUUID()).withType(DATA_CONTRACT);
    table.setDataContract(existingContract);

    Fields fields = new Fields(Set.of(FIELD_OWNERS));
    repository.setFieldsInternal(table, fields, RelationIncludes.fromInclude(NON_DELETED));

    assertEquals(existingContract, table.getDataContract());
  }

  @Test
  void setFieldsInternal_fetchesDataContractWhenInFields() {
    UUID entityId = UUID.randomUUID();
    UUID contractId = UUID.randomUUID();
    Table table = new Table();
    table.setId(entityId);

    CollectionDAO.EntityRelationshipRecord record =
        CollectionDAO.EntityRelationshipRecord.builder().id(contractId).type(DATA_CONTRACT).build();
    when(mockRelationshipDAO.findTo(
            entityId, "table", Relationship.CONTAINS.ordinal(), DATA_CONTRACT))
        .thenReturn(List.of(record));

    EntityReference contractRef = new EntityReference().withId(contractId).withType(DATA_CONTRACT);
    when(mockEntityRelRepo.getEntityReferences(eq(List.of(record)), any(Include.class)))
        .thenReturn(List.of(contractRef));

    Fields fields = new Fields(Set.of(FIELD_DATA_CONTRACT));
    repository.setFieldsInternal(table, fields, RelationIncludes.fromInclude(NON_DELETED));

    assertNotNull(table.getDataContract());
    assertEquals(contractId, table.getDataContract().getId());
  }

  @Test
  void setFieldsInternal_setsNullWhenNoContractExists() {
    UUID entityId = UUID.randomUUID();
    Table table = new Table();
    table.setId(entityId);

    when(mockRelationshipDAO.findTo(
            entityId, "table", Relationship.CONTAINS.ordinal(), DATA_CONTRACT))
        .thenReturn(Collections.emptyList());
    when(mockEntityRelRepo.getEntityReferences(eq(Collections.emptyList()), any(Include.class)))
        .thenReturn(Collections.emptyList());

    Fields fields = new Fields(Set.of(FIELD_DATA_CONTRACT));
    repository.setFieldsInternal(table, fields, RelationIncludes.fromInclude(NON_DELETED));

    assertNull(table.getDataContract());
  }

  @Test
  void clearFieldsInternal_clearsDataContractWhenNotInFields() {
    Table table = new Table();
    table.setId(UUID.randomUUID());
    EntityReference existingContract =
        new EntityReference().withId(UUID.randomUUID()).withType(DATA_CONTRACT);
    table.setDataContract(existingContract);

    Fields fields = new Fields(Set.of(FIELD_OWNERS));
    repository.clearFieldsInternal(table, fields);

    assertNull(table.getDataContract());
  }

  @Test
  void clearFieldsInternal_preservesDataContractWhenInFields() {
    Table table = new Table();
    table.setId(UUID.randomUUID());
    EntityReference existingContract =
        new EntityReference().withId(UUID.randomUUID()).withType(DATA_CONTRACT);
    table.setDataContract(existingContract);

    Fields fields = new Fields(Set.of(FIELD_DATA_CONTRACT));
    repository.clearFieldsInternal(table, fields);

    assertEquals(existingContract, table.getDataContract());
  }

  @SuppressWarnings("unchecked")
  @Test
  void getDataContract_returnsNullWhenNotSupported() {
    EntityDAO<Bot> mockBotDAO = mock(EntityDAO.class);
    TestBotRepository botRepo = new TestBotRepository(mockCollectionDAO, mockBotDAO);

    assertNull(botRepo.getDataContract(new Bot(), NON_DELETED));
  }

  @Test
  void batchFetchDataContract_handlesEmptyList() throws Exception {
    Method method = EntityRepository.class.getDeclaredMethod("batchFetchDataContract", List.class);
    method.setAccessible(true);

    @SuppressWarnings("unchecked")
    Map<UUID, EntityReference> result =
        (Map<UUID, EntityReference>) method.invoke(repository, Collections.emptyList());

    assertTrue(result.isEmpty());
  }

  @Test
  void batchFetchDataContract_mapsContractsToEntities() throws Exception {
    UUID entityId = UUID.randomUUID();
    UUID contractId = UUID.randomUUID();

    Table table = new Table();
    table.setId(entityId);

    CollectionDAO.EntityRelationshipObject relObj =
        CollectionDAO.EntityRelationshipObject.builder()
            .fromId(entityId.toString())
            .toId(contractId.toString())
            .fromEntity("table")
            .toEntity(DATA_CONTRACT)
            .relation(Relationship.CONTAINS.ordinal())
            .build();

    when(mockRelationshipDAO.findToBatch(
            anyList(),
            eq("table"),
            eq(DATA_CONTRACT),
            eq(Relationship.CONTAINS.ordinal()),
            eq(ALL)))
        .thenReturn(List.of(relObj));

    EntityReference contractRef = new EntityReference().withId(contractId).withType(DATA_CONTRACT);

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class, Mockito.CALLS_REAL_METHODS)) {
      entityMock
          .when(() -> Entity.getEntityReferencesByIds(eq(DATA_CONTRACT), anyList(), eq(ALL)))
          .thenReturn(List.of(contractRef));

      Method method =
          EntityRepository.class.getDeclaredMethod("batchFetchDataContract", List.class);
      method.setAccessible(true);

      @SuppressWarnings("unchecked")
      Map<UUID, EntityReference> result =
          (Map<UUID, EntityReference>) method.invoke(repository, List.of(table));

      assertEquals(1, result.size());
      assertEquals(contractRef, result.get(entityId));
    }
  }

  @Test
  void fetchAndSetDataContract_earlyReturnWhenFieldNotRequested() throws Exception {
    Table table = new Table();
    table.setId(UUID.randomUUID());

    Fields fields = new Fields(Set.of(FIELD_OWNERS));

    Method method =
        EntityRepository.class.getDeclaredMethod(
            "fetchAndSetDataContract", List.class, Fields.class);
    method.setAccessible(true);
    method.invoke(repository, List.of(table), fields);

    verify(mockRelationshipDAO, never())
        .findToBatch(anyList(), anyString(), anyString(), anyInt(), any(Include.class));
  }

  @Test
  void getDataContract_noArgDelegatesToIncludeOverload() {
    UUID entityId = UUID.randomUUID();
    UUID contractId = UUID.randomUUID();
    Table table = new Table();
    table.setId(entityId);

    CollectionDAO.EntityRelationshipRecord record =
        CollectionDAO.EntityRelationshipRecord.builder().id(contractId).type(DATA_CONTRACT).build();
    when(mockRelationshipDAO.findTo(
            entityId, "table", Relationship.CONTAINS.ordinal(), DATA_CONTRACT))
        .thenReturn(List.of(record));

    EntityReference contractRef = new EntityReference().withId(contractId).withType(DATA_CONTRACT);
    when(mockEntityRelRepo.getEntityReferences(eq(List.of(record)), any(Include.class)))
        .thenReturn(List.of(contractRef));

    EntityReference result = repository.callGetDataContractNoArg(table);
    assertNotNull(result);
    assertEquals(contractId, result.getId());
  }

  @Test
  void getDataContract_returnsFromReadBundleWhenPresent() {
    UUID entityId = UUID.randomUUID();
    UUID contractId = UUID.randomUUID();
    Table table = new Table();
    table.setId(entityId);

    EntityReference contractRef = new EntityReference().withId(contractId).withType(DATA_CONTRACT);
    ReadBundle bundle = new ReadBundle();
    bundle.putRelations(entityId, FIELD_DATA_CONTRACT, NON_DELETED, List.of(contractRef));
    ReadBundleContext.push(bundle);
    try {
      EntityReference result = repository.callGetDataContract(table, NON_DELETED);
      assertNotNull(result);
      assertEquals(contractId, result.getId());
    } finally {
      ReadBundleContext.pop();
    }
  }

  @Test
  void fetchAndSetDataContract_setsContractWhenFieldRequested() throws Exception {
    UUID entityId = UUID.randomUUID();
    UUID contractId = UUID.randomUUID();
    Table table = new Table();
    table.setId(entityId);

    CollectionDAO.EntityRelationshipObject relObj =
        CollectionDAO.EntityRelationshipObject.builder()
            .fromId(entityId.toString())
            .toId(contractId.toString())
            .fromEntity("table")
            .toEntity(DATA_CONTRACT)
            .relation(Relationship.CONTAINS.ordinal())
            .build();

    when(mockRelationshipDAO.findToBatch(
            anyList(),
            eq("table"),
            eq(DATA_CONTRACT),
            eq(Relationship.CONTAINS.ordinal()),
            eq(ALL)))
        .thenReturn(List.of(relObj));

    EntityReference contractRef = new EntityReference().withId(contractId).withType(DATA_CONTRACT);
    Fields fields = new Fields(Set.of(FIELD_DATA_CONTRACT));

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class, Mockito.CALLS_REAL_METHODS)) {
      entityMock
          .when(() -> Entity.getEntityReferencesByIds(eq(DATA_CONTRACT), anyList(), eq(ALL)))
          .thenReturn(List.of(contractRef));

      Method method =
          EntityRepository.class.getDeclaredMethod(
              "fetchAndSetDataContract", List.class, Fields.class);
      method.setAccessible(true);
      method.invoke(repository, List.of(table), fields);

      assertNotNull(table.getDataContract());
      assertEquals(contractId, table.getDataContract().getId());
    }
  }

  @Test
  void findToBatch_appliesIncludeConditionNonDeleted() {
    CollectionDAO.EntityRelationshipDAO dao =
        mock(CollectionDAO.EntityRelationshipDAO.class, Mockito.CALLS_REAL_METHODS);

    List<String> fromIds = List.of(UUID.randomUUID().toString());
    dao.findToBatch(fromIds, "table", DATA_CONTRACT, Relationship.CONTAINS.ordinal(), NON_DELETED);

    verify(dao)
        .findToBatchWithCondition(
            fromIds,
            Relationship.CONTAINS.ordinal(),
            "table",
            DATA_CONTRACT,
            "AND deleted = FALSE");
  }

  @Test
  void findToBatch_appliesIncludeConditionAll() {
    CollectionDAO.EntityRelationshipDAO dao =
        mock(CollectionDAO.EntityRelationshipDAO.class, Mockito.CALLS_REAL_METHODS);

    List<String> fromIds = List.of(UUID.randomUUID().toString());
    dao.findToBatch(fromIds, "table", DATA_CONTRACT, Relationship.CONTAINS.ordinal(), ALL);

    verify(dao)
        .findToBatchWithCondition(
            fromIds, Relationship.CONTAINS.ordinal(), "table", DATA_CONTRACT, "");
  }

  @Test
  void findToBatch_appliesIncludeConditionDeleted() {
    CollectionDAO.EntityRelationshipDAO dao =
        mock(CollectionDAO.EntityRelationshipDAO.class, Mockito.CALLS_REAL_METHODS);

    List<String> fromIds = List.of(UUID.randomUUID().toString());
    dao.findToBatch(fromIds, "table", DATA_CONTRACT, Relationship.CONTAINS.ordinal(), DELETED);

    verify(dao)
        .findToBatchWithCondition(
            fromIds, Relationship.CONTAINS.ordinal(), "table", DATA_CONTRACT, "AND deleted = TRUE");
  }
}
