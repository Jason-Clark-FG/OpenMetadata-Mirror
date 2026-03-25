package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.entity.data.Topic;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.Field;
import org.openmetadata.schema.type.FieldDataType;
import org.openmetadata.schema.type.MessageSchema;
import org.openmetadata.schema.type.SchemaType;
import org.openmetadata.service.Entity;

/**
 * Unit tests for TopicRepository.TopicUpdater to verify that PATCH operations on nested schema
 * fields are correctly detected and recorded. Regression test for a bug where the shouldCompare
 * optimization silently dropped schema field changes because the internal field name prefix
 * ("schemaFields") didn't match the patchedField ("messageSchema").
 */
class TopicUpdaterPatchTest {

  private static Topic createTopicWithNestedSchema() {
    return new Topic()
        .withId(UUID.randomUUID())
        .withName("test-topic")
        .withFullyQualifiedName("test-svc.test-topic")
        .withUpdatedBy("admin")
        .withVersion(0.1)
        .withMessageSchema(
            new MessageSchema()
                .withSchemaType(SchemaType.JSON)
                .withSchemaText("{\"test\": \"string\"}")
                .withSchemaFields(
                    Arrays.asList(
                        new Field()
                            .withName("id")
                            .withDataType(FieldDataType.STRING)
                            .withFullyQualifiedName("test-svc.test-topic.id"),
                        new Field()
                            .withName("record")
                            .withDataType(FieldDataType.RECORD)
                            .withFullyQualifiedName("test-svc.test-topic.record")
                            .withChildren(
                                Arrays.asList(
                                    new Field()
                                        .withName("id")
                                        .withDataType(FieldDataType.INT)
                                        .withFullyQualifiedName("test-svc.test-topic.record.id"),
                                    new Field()
                                        .withName("name")
                                        .withDataType(FieldDataType.STRING)
                                        .withFullyQualifiedName(
                                            "test-svc.test-topic.record.name"))))));
  }

  private TopicRepository.TopicUpdater createUpdater(Topic original, Topic updated) {
    CollectionDAO mockDao = mock(CollectionDAO.class);
    CollectionDAO.TopicDAO mockTopicDao = mock(CollectionDAO.TopicDAO.class);
    org.mockito.Mockito.when(mockDao.topicDAO()).thenReturn(mockTopicDao);

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock.when(Entity::getCollectionDAO).thenReturn(mockDao);
      entityMock.when(Entity::getSearchRepository).thenReturn(null);
      TopicRepository repo = new TopicRepository();
      return repo.new TopicUpdater(original, updated, EntityRepository.Operation.PATCH);
    }
  }

  @Test
  void patch_nestedSchemaFieldDescription_isDetected() {
    Topic original = createTopicWithNestedSchema();
    Topic updated = createTopicWithNestedSchema();

    updated
        .getMessageSchema()
        .getSchemaFields()
        .get(1)
        .getChildren()
        .get(1)
        .withDescription("Name of the record");

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("messageSchema"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertTrue(
        updater.fieldsChanged(),
        "Nested schema field description change must be detected when patchedFields={messageSchema}");
  }

  @Test
  void patch_topLevelSchemaFieldDescription_isDetected() {
    Topic original = createTopicWithNestedSchema();
    Topic updated = createTopicWithNestedSchema();

    updated.getMessageSchema().getSchemaFields().get(0).withDescription("Unique identifier");

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("messageSchema"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertTrue(
        updater.fieldsChanged(),
        "Top-level schema field description change must be detected when patchedFields={messageSchema}");
  }

  @Test
  void patch_nestedSchemaFieldDisplayName_isDetected() {
    Topic original = createTopicWithNestedSchema();
    Topic updated = createTopicWithNestedSchema();

    updated
        .getMessageSchema()
        .getSchemaFields()
        .get(1)
        .getChildren()
        .get(1)
        .withDisplayName("Record Name");

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("messageSchema"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertTrue(
        updater.fieldsChanged(),
        "Nested schema field displayName change must be detected when patchedFields={messageSchema}");
  }

  @Test
  void patch_unrelatedField_doesNotTriggerSchemaUpdate() {
    Topic original = createTopicWithNestedSchema();
    Topic updated = createTopicWithNestedSchema();

    updated
        .getMessageSchema()
        .getSchemaFields()
        .get(1)
        .getChildren()
        .get(1)
        .withDescription("Should not be detected");

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("retentionSize"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertFalse(
        updater.fieldsChanged(),
        "Schema field changes should NOT be detected when patchedFields does not include messageSchema");
  }

  @Test
  void patch_patchedFieldsRestoredAfterSchemaUpdate() {
    Topic original = createTopicWithNestedSchema();
    Topic updated = createTopicWithNestedSchema();

    updated.getMessageSchema().getSchemaFields().get(0).withDescription("Updated");

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("messageSchema"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertNotNull(
        updater.getPatchedFields(), "patchedFields must be restored after entitySpecificUpdate");
    assertTrue(
        updater.getPatchedFields().contains("messageSchema"),
        "patchedFields must contain original values after entitySpecificUpdate");
    assertFalse(
        updater.getPatchedFields().contains("schemaFields"),
        "Temporary 'schemaFields' entry must not leak into restored patchedFields");
  }

  @Test
  void patch_addSchemaToTopicWithoutSchema_isDetected() {
    // Original topic has no messageSchema
    Topic original =
        new Topic()
            .withId(UUID.randomUUID())
            .withName("test-topic")
            .withFullyQualifiedName("test-svc.test-topic")
            .withUpdatedBy("admin")
            .withVersion(0.1);

    // Updated topic adds a messageSchema with fields
    Topic updated = createTopicWithNestedSchema();

    TopicRepository.TopicUpdater updater = createUpdater(original, updated);
    updater.setPatchedFields(Set.of("messageSchema"));
    updater.changeDescription = new ChangeDescription();

    updater.entitySpecificUpdate(false);

    assertTrue(
        updater.fieldsChanged(),
        "Adding schema fields to a topic without messageSchema must be detected");
  }
}
