package org.openmetadata.service.search.indexes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.openmetadata.schema.entity.data.APIEndpoint;
import org.openmetadata.schema.entity.data.Container;
import org.openmetadata.schema.entity.data.DashboardDataModel;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.data.Topic;
import org.openmetadata.schema.entity.data.Worksheet;
import org.openmetadata.schema.type.APISchema;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.ColumnDataType;
import org.openmetadata.schema.type.ContainerDataModel;
import org.openmetadata.schema.type.Field;
import org.openmetadata.schema.type.FieldDataType;
import org.openmetadata.schema.type.MessageSchema;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.service.Entity;
import org.openmetadata.service.search.SearchRepository;

class CollectChildTagsTest {

  private static MockedStatic<Entity> entityStaticMock;

  @BeforeAll
  static void setUp() {
    SearchRepository mockSearchRepo =
        Mockito.mock(SearchRepository.class, Mockito.RETURNS_DEEP_STUBS);
    entityStaticMock = Mockito.mockStatic(Entity.class);
    entityStaticMock.when(Entity::getSearchRepository).thenReturn(mockSearchRepo);
  }

  @AfterAll
  static void tearDown() {
    entityStaticMock.close();
  }

  private static final TagLabel TAG_PII =
      new TagLabel().withTagFQN("PII.Sensitive").withSource(TagLabel.TagSource.CLASSIFICATION);
  private static final TagLabel TAG_GLOSSARY =
      new TagLabel().withTagFQN("Glossary.Address").withSource(TagLabel.TagSource.GLOSSARY);

  // ==================== TableIndex ====================

  @Test
  void testTableIndex_collectsColumnTags() {
    Column col1 =
        new Column()
            .withName("email")
            .withDataType(ColumnDataType.VARCHAR)
            .withTags(List.of(TAG_PII));
    Column col2 = new Column().withName("id").withDataType(ColumnDataType.INT);

    Table table =
        new Table()
            .withId(UUID.randomUUID())
            .withName("users")
            .withFullyQualifiedName("s.d.sc.users")
            .withColumns(List.of(col1, col2));

    Set<List<TagLabel>> childTags = new TableIndex(table).collectChildTags();

    assertNotNull(childTags);
    assertEquals(1, childTags.size());
    assertTrue(
        childTags.stream()
            .flatMap(List::stream)
            .anyMatch(t -> "PII.Sensitive".equals(t.getTagFQN())));
  }

  @Test
  void testTableIndex_noColumnsReturnsEmpty() {
    Table table =
        new Table().withId(UUID.randomUUID()).withName("t").withFullyQualifiedName("s.d.sc.t");

    Set<List<TagLabel>> childTags = new TableIndex(table).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  @Test
  void testTableIndex_columnsWithoutTagsReturnsEmpty() {
    Column col = new Column().withName("id").withDataType(ColumnDataType.INT);
    Table table =
        new Table()
            .withId(UUID.randomUUID())
            .withName("t")
            .withFullyQualifiedName("s.d.sc.t")
            .withColumns(List.of(col));

    Set<List<TagLabel>> childTags = new TableIndex(table).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  @Test
  void testTableIndex_nestedColumnTags() {
    Column child =
        new Column()
            .withName("zip")
            .withDataType(ColumnDataType.VARCHAR)
            .withTags(List.of(TAG_GLOSSARY));
    Column parent =
        new Column()
            .withName("address")
            .withDataType(ColumnDataType.STRUCT)
            .withTags(List.of(TAG_PII))
            .withChildren(List.of(child));

    Table table =
        new Table()
            .withId(UUID.randomUUID())
            .withName("t")
            .withFullyQualifiedName("s.d.sc.t")
            .withColumns(List.of(parent));

    Set<List<TagLabel>> childTags = new TableIndex(table).collectChildTags();

    assertEquals(2, childTags.size());
  }

  // ==================== TopicIndex ====================

  @Test
  void testTopicIndex_collectsSchemaFieldTags() {
    Field f1 =
        new Field()
            .withName("userId")
            .withDataType(FieldDataType.STRING)
            .withTags(List.of(TAG_PII));
    Field f2 = new Field().withName("timestamp").withDataType(FieldDataType.LONG);
    MessageSchema schema = new MessageSchema().withSchemaFields(List.of(f1, f2));

    Topic topic =
        new Topic()
            .withId(UUID.randomUUID())
            .withName("events")
            .withFullyQualifiedName("svc.events")
            .withMessageSchema(schema);

    Set<List<TagLabel>> childTags = new TopicIndex(topic).collectChildTags();

    assertNotNull(childTags);
    assertEquals(1, childTags.size());
  }

  @Test
  void testTopicIndex_noSchemaReturnsEmpty() {
    Topic topic =
        new Topic().withId(UUID.randomUUID()).withName("t").withFullyQualifiedName("svc.t");

    Set<List<TagLabel>> childTags = new TopicIndex(topic).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  @Test
  void testTopicIndex_emptySchemaFieldsReturnsEmpty() {
    MessageSchema schema = new MessageSchema().withSchemaFields(Collections.emptyList());
    Topic topic =
        new Topic()
            .withId(UUID.randomUUID())
            .withName("t")
            .withFullyQualifiedName("svc.t")
            .withMessageSchema(schema);

    Set<List<TagLabel>> childTags = new TopicIndex(topic).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  // ==================== ContainerIndex ====================

  @Test
  void testContainerIndex_collectsDataModelColumnTags() {
    Column col =
        new Column()
            .withName("key")
            .withDataType(ColumnDataType.VARCHAR)
            .withTags(List.of(TAG_PII));
    ContainerDataModel dataModel = new ContainerDataModel().withColumns(List.of(col));

    Container container =
        new Container()
            .withId(UUID.randomUUID())
            .withName("bucket")
            .withFullyQualifiedName("svc.bucket")
            .withDataModel(dataModel);

    Set<List<TagLabel>> childTags = new ContainerIndex(container).collectChildTags();

    assertEquals(1, childTags.size());
  }

  @Test
  void testContainerIndex_noDataModelReturnsEmpty() {
    Container container =
        new Container().withId(UUID.randomUUID()).withName("c").withFullyQualifiedName("svc.c");

    Set<List<TagLabel>> childTags = new ContainerIndex(container).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  // ==================== APIEndpointIndex ====================

  @Test
  void testAPIEndpointIndex_collectsResponseAndRequestTags() {
    Field respField =
        new Field()
            .withName("userId")
            .withDataType(FieldDataType.STRING)
            .withTags(List.of(TAG_PII));
    Field reqField =
        new Field()
            .withName("address")
            .withDataType(FieldDataType.STRING)
            .withTags(List.of(TAG_GLOSSARY));
    APISchema responseSchema = new APISchema().withSchemaFields(List.of(respField));
    APISchema requestSchema = new APISchema().withSchemaFields(List.of(reqField));

    APIEndpoint endpoint =
        new APIEndpoint()
            .withId(UUID.randomUUID())
            .withName("getUser")
            .withFullyQualifiedName("svc.col.getUser")
            .withResponseSchema(responseSchema)
            .withRequestSchema(requestSchema);

    Set<List<TagLabel>> childTags = new APIEndpointIndex(endpoint).collectChildTags();

    assertEquals(2, childTags.size());
  }

  @Test
  void testAPIEndpointIndex_noSchemasReturnsEmpty() {
    APIEndpoint endpoint =
        new APIEndpoint()
            .withId(UUID.randomUUID())
            .withName("e")
            .withFullyQualifiedName("svc.col.e");

    Set<List<TagLabel>> childTags = new APIEndpointIndex(endpoint).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  // ==================== DashboardDataModelIndex ====================

  @Test
  void testDashboardDataModelIndex_collectsColumnTags() {
    Column col =
        new Column()
            .withName("metric")
            .withDataType(ColumnDataType.DOUBLE)
            .withTags(List.of(TAG_PII));
    DashboardDataModel model =
        new DashboardDataModel()
            .withId(UUID.randomUUID())
            .withName("dm")
            .withFullyQualifiedName("svc.dm")
            .withColumns(List.of(col));

    Set<List<TagLabel>> childTags = new DashboardDataModelIndex(model).collectChildTags();

    assertEquals(1, childTags.size());
  }

  @Test
  void testDashboardDataModelIndex_noColumnsReturnsEmpty() {
    DashboardDataModel model =
        new DashboardDataModel()
            .withId(UUID.randomUUID())
            .withName("dm")
            .withFullyQualifiedName("svc.dm");

    Set<List<TagLabel>> childTags = new DashboardDataModelIndex(model).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  // ==================== WorksheetIndex ====================

  @Test
  void testWorksheetIndex_collectsColumnTags() {
    Column col =
        new Column()
            .withName("amount")
            .withDataType(ColumnDataType.DECIMAL)
            .withTags(List.of(TAG_PII));
    Worksheet ws =
        new Worksheet()
            .withId(UUID.randomUUID())
            .withName("sheet1")
            .withFullyQualifiedName("svc.sp.sheet1")
            .withColumns(List.of(col));

    Set<List<TagLabel>> childTags = new WorksheetIndex(ws).collectChildTags();

    assertEquals(1, childTags.size());
  }

  @Test
  void testWorksheetIndex_noColumnsReturnsEmpty() {
    Worksheet ws =
        new Worksheet()
            .withId(UUID.randomUUID())
            .withName("sheet1")
            .withFullyQualifiedName("svc.sp.sheet1");

    Set<List<TagLabel>> childTags = new WorksheetIndex(ws).collectChildTags();

    assertTrue(childTags.isEmpty());
  }

  // ==================== Default implementation ====================

  @Test
  void testDefaultCollectChildTags_returnsNull() {
    // DashboardIndex implements TaggableIndex but does NOT override collectChildTags
    org.openmetadata.schema.entity.data.Dashboard d =
        new org.openmetadata.schema.entity.data.Dashboard()
            .withId(UUID.randomUUID())
            .withName("d")
            .withFullyQualifiedName("svc.d");

    Set<List<TagLabel>> childTags = new DashboardIndex(d).collectChildTags();

    assertNull(childTags);
  }
}
