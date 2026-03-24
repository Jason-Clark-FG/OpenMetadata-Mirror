package org.openmetadata.service.migration.utils.v200;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.Handle;
import org.openmetadata.schema.api.search.SearchSettings;
import org.openmetadata.schema.entity.activity.ActivityEvent;
import org.openmetadata.schema.settings.Settings;
import org.openmetadata.schema.type.ActivityEventType;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.ChangeEvent;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.EventType;
import org.openmetadata.schema.type.FieldChange;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.migration.utils.SearchSettingsMergeUtil;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.FullyQualifiedName;

@Slf4j
public class MigrationUtil {

  private static final String TABLE_COLUMN_ASSET_TYPE = "tableColumn";

  private MigrationUtil() {}

  public static void addTableColumnSearchSettings() {
    try {
      LOG.info("Adding tableColumn search settings configuration for column search support");

      Settings searchSettings = SearchSettingsMergeUtil.getSearchSettingsFromDatabase();

      if (searchSettings == null) {
        LOG.warn(
            "Search settings not found in database. "
                + "Default settings will be loaded on next startup which includes tableColumn.");
        return;
      }

      SearchSettings currentSettings = SearchSettingsMergeUtil.loadSearchSettings(searchSettings);
      SearchSettings defaultSettings = SearchSettingsMergeUtil.loadSearchSettingsFromFile();

      if (defaultSettings == null) {
        LOG.error("Failed to load default search settings from file, skipping migration");
        return;
      }

      boolean assetTypeAdded =
          SearchSettingsMergeUtil.addMissingAssetTypeConfiguration(
              currentSettings, defaultSettings, TABLE_COLUMN_ASSET_TYPE);

      boolean allowedFieldsAdded =
          SearchSettingsMergeUtil.addMissingAllowedFields(
              currentSettings, defaultSettings, TABLE_COLUMN_ASSET_TYPE);

      if (assetTypeAdded || allowedFieldsAdded) {
        SearchSettingsMergeUtil.saveSearchSettings(searchSettings, currentSettings);
        LOG.info(
            "Successfully added tableColumn search settings: "
                + "assetTypeConfiguration={}, allowedFields={}",
            assetTypeAdded,
            allowedFieldsAdded);
      } else {
        LOG.info("tableColumn search settings already exist, no updates needed");
      }

    } catch (Exception e) {
      LOG.error("Error adding tableColumn search settings", e);
      throw new RuntimeException("Failed to add tableColumn search settings", e);
    }
  }

  /**
   * Migrate suggestions from the old suggestions table to the new task_entity table. Each
   * suggestion becomes a Task with type=Suggestion and category=MetadataUpdate. The about
   * EntityReference and aboutFqnHash are properly computed from the entityLink.
   */
  public static void migrateSuggestionsToTaskEntity(Handle handle) {
    LOG.info("Starting migration of suggestions to task_entity");

    boolean tableExists;
    try {
      handle.createQuery("SELECT 1 FROM suggestions LIMIT 1").mapToMap().list();
      tableExists = true;
    } catch (Exception e) {
      tableExists = false;
    }

    if (!tableExists) {
      LOG.info("suggestions table does not exist, skipping suggestion migration");
      return;
    }

    List<Map<String, Object>> suggestions =
        handle.createQuery("SELECT json FROM suggestions ORDER BY updatedAt ASC").mapToMap().list();

    if (suggestions.isEmpty()) {
      LOG.info("No suggestions found to migrate");
      handle.execute("DROP TABLE IF EXISTS suggestions");
      return;
    }

    LOG.info("Found {} suggestions to migrate", suggestions.size());

    long seqVal = getSequenceValue(handle);
    int migrated = 0;
    int skipped = 0;

    for (Map<String, Object> row : suggestions) {
      try {
        String jsonStr = row.get("json").toString();
        JsonNode suggestionJson = JsonUtils.readTree(jsonStr);

        String suggestionId = suggestionJson.get("id").asText();

        if (taskExists(handle, suggestionId)) {
          skipped++;
          continue;
        }

        seqVal++;
        String taskIdStr = String.format("TASK-%05d", seqVal);
        String fqnHash = FullyQualifiedName.buildHash(taskIdStr);

        String entityLink =
            suggestionJson.has("entityLink") ? suggestionJson.get("entityLink").asText() : null;
        String suggestionType =
            suggestionJson.has("type") ? suggestionJson.get("type").asText() : "SuggestDescription";
        String oldStatus =
            suggestionJson.has("status") ? suggestionJson.get("status").asText() : "Open";

        String mappedSuggestionType =
            "SuggestTagLabel".equals(suggestionType) ? "Tag" : "Description";
        String newStatus =
            switch (oldStatus) {
              case "Accepted" -> "Approved";
              case "Rejected" -> "Rejected";
              default -> "Open";
            };

        ObjectNode taskJson = JsonUtils.getObjectNode();
        taskJson.put("id", suggestionId);
        taskJson.put("taskId", taskIdStr);
        taskJson.put("name", taskIdStr);
        taskJson.put("fullyQualifiedName", taskIdStr);
        taskJson.put("category", "MetadataUpdate");
        taskJson.put("type", "Suggestion");
        taskJson.put("status", newStatus);
        taskJson.put("priority", "Medium");

        // Build about reference and aboutFqnHash from entityLink
        if (entityLink != null) {
          setAboutFromEntityLink(taskJson, entityLink, suggestionJson);
        }

        // Build payload
        ObjectNode payload = JsonUtils.getObjectNode();
        payload.put("suggestionType", mappedSuggestionType);

        String fieldPath = extractFieldPathFromEntityLink(entityLink);
        payload.put("fieldPath", fieldPath);

        if ("Tag".equals(mappedSuggestionType)) {
          JsonNode tagLabels = suggestionJson.get("tagLabels");
          if (tagLabels != null) {
            payload.put("suggestedValue", tagLabels.toString());
          } else {
            payload.put("suggestedValue", "[]");
          }
        } else {
          String desc =
              suggestionJson.has("description") ? suggestionJson.get("description").asText() : "";
          payload.put("suggestedValue", desc);
        }
        payload.put("source", "User");
        taskJson.set("payload", payload);

        // Extract createdBy ID from the suggestion's EntityReference
        String createdByUserId = null;
        if (suggestionJson.has("createdBy")
            && suggestionJson.get("createdBy").has("id")
            && !suggestionJson.get("createdBy").get("id").isNull()) {
          createdByUserId = suggestionJson.get("createdBy").get("id").asText();
          taskJson.put("createdById", createdByUserId);
        }

        long createdAt =
            suggestionJson.has("createdAt") ? suggestionJson.get("createdAt").asLong() : 0;
        long updatedAt =
            suggestionJson.has("updatedAt") ? suggestionJson.get("updatedAt").asLong() : createdAt;
        String updatedBy =
            suggestionJson.has("updatedBy") ? suggestionJson.get("updatedBy").asText() : "system";

        taskJson.put("createdAt", createdAt);
        taskJson.put("updatedAt", updatedAt);
        taskJson.put("updatedBy", updatedBy);
        taskJson.put("deleted", false);
        taskJson.put("version", 0.1);
        taskJson.set("comments", JsonUtils.getObjectNode().arrayNode());
        taskJson.put("commentCount", 0);
        taskJson.set("tags", JsonUtils.getObjectNode().arrayNode());

        insertTask(handle, suggestionId, taskJson.toString(), fqnHash);
        migrated++;
      } catch (Exception e) {
        LOG.warn("Error migrating suggestion: {}", e.getMessage());
        skipped++;
      }
    }

    updateSequenceValue(handle, seqVal);
    handle.execute("DROP TABLE IF EXISTS suggestions");
    LOG.info("Suggestion migration complete: migrated={}, skipped={}", migrated, skipped);
  }

  /**
   * Migrate thread-based tasks from thread_entity to the new task_entity table. Each thread with
   * type='Task' becomes a proper Task entity with correct type mapping, payload, and aboutFqnHash.
   */
  public static void migrateThreadTasksToTaskEntity(Handle handle) {
    LOG.info("Starting migration of thread-based tasks to task_entity");

    List<Map<String, Object>> threads =
        handle
            .createQuery(
                "SELECT json FROM thread_entity WHERE type = 'Task' ORDER BY createdAt ASC")
            .mapToMap()
            .list();

    if (threads.isEmpty()) {
      LOG.info("No thread-based tasks found to migrate");
      return;
    }

    LOG.info("Found {} thread-based tasks to migrate", threads.size());

    long seqVal = getSequenceValue(handle);
    int migrated = 0;
    int skipped = 0;

    for (Map<String, Object> row : threads) {
      try {
        String jsonStr = row.get("json").toString();
        JsonNode threadJson = JsonUtils.readTree(jsonStr);

        String threadId = threadJson.get("id").asText();

        if (taskExists(handle, threadId)) {
          skipped++;
          continue;
        }

        JsonNode taskDetails = threadJson.get("task");
        if (taskDetails == null) {
          skipped++;
          continue;
        }

        String aboutLink = threadJson.has("about") ? threadJson.get("about").asText() : null;
        if (aboutLink == null) {
          skipped++;
          continue;
        }

        String oldType = taskDetails.get("type").asText();
        String oldStatus = taskDetails.has("status") ? taskDetails.get("status").asText() : "Open";

        MessageParser.EntityLink entityLink;
        try {
          entityLink = MessageParser.EntityLink.parse(aboutLink);
        } catch (Exception e) {
          LOG.warn("Cannot parse entityLink '{}', skipping thread {}", aboutLink, threadId);
          skipped++;
          continue;
        }

        String entityType = entityLink.getEntityType();
        String newType = mapThreadTaskType(oldType, entityType);
        String newCategory = mapThreadTaskCategory(oldType, entityType);
        String newStatus = mapThreadTaskStatus(oldStatus, oldType, entityType);

        seqVal++;
        String taskIdStr = String.format("TASK-%05d", seqVal);
        String fqnHash = FullyQualifiedName.buildHash(taskIdStr);

        ObjectNode taskJson = JsonUtils.getObjectNode();
        taskJson.put("id", threadId);
        taskJson.put("taskId", taskIdStr);
        taskJson.put("name", taskIdStr);
        taskJson.put("fullyQualifiedName", taskIdStr);
        taskJson.put("category", newCategory);
        taskJson.put("type", newType);
        taskJson.put("status", newStatus);
        taskJson.put("priority", "Medium");

        // Set about and aboutFqnHash
        setAboutFromEntityLink(taskJson, aboutLink, threadJson);

        // Build payload
        ObjectNode payload = buildThreadTaskPayload(oldType, taskDetails, entityLink);
        if (payload != null) {
          taskJson.set("payload", payload);
        }

        // Set assignees
        if (taskDetails.has("assignees") && taskDetails.get("assignees").isArray()) {
          taskJson.set("assignees", taskDetails.get("assignees"));
        }

        // Set description from thread message
        if (threadJson.has("message")) {
          taskJson.put("description", threadJson.get("message").asText());
        }

        long createdAt = threadJson.has("threadTs") ? threadJson.get("threadTs").asLong() : 0;
        long updatedAt =
            threadJson.has("updatedAt") ? threadJson.get("updatedAt").asLong() : createdAt;
        String createdByName =
            threadJson.has("createdBy") ? threadJson.get("createdBy").asText() : "system";
        String updatedBy =
            threadJson.has("updatedBy") ? threadJson.get("updatedBy").asText() : createdByName;

        // Look up createdBy user ID from user_entity by name
        String createdByUserId = lookupUserId(handle, createdByName);
        if (createdByUserId != null) {
          taskJson.put("createdById", createdByUserId);
        }

        taskJson.put("createdAt", createdAt);
        taskJson.put("updatedAt", updatedAt);
        taskJson.put("updatedBy", updatedBy);
        taskJson.put("deleted", false);
        taskJson.put("version", 0.1);
        taskJson.set("comments", JsonUtils.getObjectNode().arrayNode());
        taskJson.put("commentCount", 0);
        taskJson.set("tags", JsonUtils.getObjectNode().arrayNode());

        // Set resolution details for closed tasks
        if ("Closed".equals(oldStatus)) {
          ObjectNode resolution = JsonUtils.getObjectNode();
          resolution.put("type", newStatus.equals("Approved") ? "Approved" : "Completed");
          if (taskDetails.has("closedBy")) {
            resolution.put("comment", "Migrated from thread-based task system");
          }
          if (taskDetails.has("closedAt")) {
            resolution.put("resolvedAt", taskDetails.get("closedAt").asLong());
          }
          if (taskDetails.has("newValue")) {
            resolution.put("newValue", taskDetails.get("newValue").asText());
          }
          taskJson.set("resolution", resolution);
        }

        insertTask(handle, threadId, taskJson.toString(), fqnHash);
        migrated++;
      } catch (Exception e) {
        LOG.warn("Error migrating thread task: {}", e.getMessage());
        skipped++;
      }
    }

    updateSequenceValue(handle, seqVal);
    LOG.info("Thread task migration complete: migrated={}, skipped={}", migrated, skipped);
  }

  /**
   * Backfill the new activity_stream table from legacy change_event rows so user dashboards and
   * entity activity tabs can read from the new activity APIs immediately after migration.
   */
  public static void migrateChangeEventsToActivityStream(Handle handle) {
    LOG.info("Starting migration of change events to activity_stream");

    boolean tableExists;
    try {
      handle.createQuery("SELECT 1 FROM change_event LIMIT 1").mapTo(Integer.class).list();
      tableExists = true;
    } catch (Exception e) {
      tableExists = false;
    }

    if (!tableExists) {
      LOG.info("change_event table does not exist, skipping activity stream migration");
      return;
    }

    List<Map<String, Object>> rows =
        handle.createQuery("SELECT json FROM change_event ORDER BY eventTime ASC").mapToMap().list();

    if (rows.isEmpty()) {
      LOG.info("No change events found to migrate into activity_stream");
      return;
    }

    int migrated = 0;
    int skipped = 0;

    for (Map<String, Object> row : rows) {
      try {
        ChangeEvent changeEvent = JsonUtils.readValue(row.get("json").toString(), ChangeEvent.class);
        List<ActivityEvent> events = buildActivityEvents(handle, changeEvent);

        if (events.isEmpty()) {
          skipped++;
          continue;
        }

        for (ActivityEvent event : events) {
          if (activityEventExists(handle, event.getId(), event.getTimestamp())) {
            continue;
          }

          insertActivityEvent(handle, event);
          migrated++;
        }
      } catch (Exception e) {
        LOG.warn("Error migrating change event to activity_stream: {}", e.getMessage());
        skipped++;
      }
    }

    LOG.info(
        "Activity stream migration complete: migrated={}, skippedSourceEvents={}", migrated, skipped);
  }

  private static void setAboutFromEntityLink(
      ObjectNode taskJson, String entityLinkStr, JsonNode sourceJson) {
    try {
      MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
      String entityType = entityLink.getEntityType();
      String entityFQN = entityLink.getEntityFQN();

      ObjectNode aboutRef = JsonUtils.getObjectNode();
      if (sourceJson.has("entityId") && !sourceJson.get("entityId").isNull()) {
        aboutRef.put("id", sourceJson.get("entityId").asText());
      }
      aboutRef.put("type", entityType);
      aboutRef.put("fullyQualifiedName", entityFQN);
      taskJson.set("about", aboutRef);

      String aboutFqnHash = FullyQualifiedName.buildHash(entityFQN);
      taskJson.put("aboutFqnHash", aboutFqnHash);
    } catch (Exception e) {
      LOG.debug("Could not parse entityLink '{}': {}", entityLinkStr, e.getMessage());
    }
  }

  private static String extractFieldPathFromEntityLink(String entityLinkStr) {
    if (entityLinkStr == null) {
      return "description";
    }
    try {
      MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
      String fieldName = entityLink.getFieldName();
      if (fieldName != null) {
        String arrayFieldName = entityLink.getArrayFieldName();
        String arrayFieldValue = entityLink.getArrayFieldValue();
        if (arrayFieldName != null && arrayFieldValue != null) {
          return fieldName + "." + arrayFieldName + "." + arrayFieldValue;
        } else if (arrayFieldName != null) {
          return fieldName + "." + arrayFieldName;
        }
        return fieldName;
      }
    } catch (Exception e) {
      LOG.debug("Could not parse entityLink '{}': {}", entityLinkStr, e.getMessage());
    }
    return "description";
  }

  private static String mapThreadTaskType(String oldType, String entityType) {
    return switch (oldType) {
      case "RequestDescription", "UpdateDescription" -> "DescriptionUpdate";
      case "RequestTag", "UpdateTag" -> "TagUpdate";
      case "RequestApproval" -> Entity.GLOSSARY_TERM.equals(entityType)
          ? "GlossaryApproval"
          : "RequestApproval";
      case "RequestTestCaseFailureResolution" -> "TestCaseResolution";
      case "RecognizerFeedbackApproval" -> "DataQualityReview";
      default -> "CustomTask";
    };
  }

  private static String mapThreadTaskCategory(String oldType, String entityType) {
    return switch (oldType) {
      case "RequestDescription", "UpdateDescription", "RequestTag", "UpdateTag" -> "MetadataUpdate";
      case "RequestApproval" -> "Approval";
      case "RequestTestCaseFailureResolution" -> "Incident";
      case "RecognizerFeedbackApproval" -> "Review";
      default -> "Custom";
    };
  }

  private static String mapThreadTaskStatus(String oldStatus, String oldType, String entityType) {
    if ("Open".equals(oldStatus)) {
      return "Open";
    }
    // Closed status - map based on task type
    return switch (oldType) {
      case "RequestApproval", "RecognizerFeedbackApproval" -> "Approved";
      default -> "Completed";
    };
  }

  private static ObjectNode buildThreadTaskPayload(
      String oldType, JsonNode taskDetails, MessageParser.EntityLink entityLink) {
    return switch (oldType) {
      case "RequestDescription", "UpdateDescription" -> {
        ObjectNode payload = JsonUtils.getObjectNode();
        String fieldPath = entityLink.getFieldName();
        if (fieldPath != null) {
          String arrayField = entityLink.getArrayFieldName();
          if (arrayField != null) {
            payload.put("fieldPath", fieldPath + "." + arrayField + ".description");
          } else {
            payload.put("fieldPath", fieldPath);
          }
        } else {
          payload.put("fieldPath", "description");
        }
        if (taskDetails.has("oldValue") && !taskDetails.get("oldValue").isNull()) {
          payload.put("currentDescription", taskDetails.get("oldValue").asText());
        }
        String newDesc = null;
        if (taskDetails.has("newValue") && !taskDetails.get("newValue").isNull()) {
          newDesc = taskDetails.get("newValue").asText();
        } else if (taskDetails.has("suggestion") && !taskDetails.get("suggestion").isNull()) {
          newDesc = taskDetails.get("suggestion").asText();
        }
        if (newDesc != null) {
          payload.put("newDescription", newDesc);
        } else {
          payload.put("newDescription", "");
        }
        payload.put("source", "User");
        yield payload;
      }
      case "RequestTag", "UpdateTag" -> {
        ObjectNode payload = JsonUtils.getObjectNode();
        String fieldPath = entityLink.getFieldName();
        if (fieldPath != null) {
          String arrayField = entityLink.getArrayFieldName();
          if (arrayField != null) {
            payload.put("fieldPath", fieldPath + "." + arrayField);
          } else {
            payload.put("fieldPath", fieldPath);
          }
        }
        payload.put("operation", "Add");
        if (taskDetails.has("suggestion") && !taskDetails.get("suggestion").isNull()) {
          try {
            JsonNode tagsNode = JsonUtils.readTree(taskDetails.get("suggestion").asText());
            payload.set("tagsToAdd", tagsNode);
          } catch (Exception e) {
            payload.put("source", "User");
          }
        }
        payload.put("source", "User");
        yield payload;
      }
      case "RequestTestCaseFailureResolution" -> {
        if (taskDetails.has("testCaseResolutionStatusId")
            && !taskDetails.get("testCaseResolutionStatusId").isNull()) {
          ObjectNode payload = JsonUtils.getObjectNode();
          payload.put(
              "testCaseResolutionStatusId", taskDetails.get("testCaseResolutionStatusId").asText());
          yield payload;
        }
        yield null;
      }
      case "RecognizerFeedbackApproval" -> {
        ObjectNode payload = JsonUtils.getObjectNode();
        if (taskDetails.has("feedback") && !taskDetails.get("feedback").isNull()) {
          payload.set("data", taskDetails.get("feedback"));
        }
        if (taskDetails.has("recognizer") && !taskDetails.get("recognizer").isNull()) {
          ObjectNode metadata = JsonUtils.getObjectNode();
          metadata.set("recognizer", taskDetails.get("recognizer"));
          payload.set("metadata", metadata);
        }
        yield payload;
      }
      case "Generic" -> {
        ObjectNode payload = JsonUtils.getObjectNode();
        if (taskDetails.has("suggestion") && !taskDetails.get("suggestion").isNull()) {
          payload.put("data", taskDetails.get("suggestion").asText());
        }
        yield payload;
      }
      default -> null;
    };
  }

  private static List<ActivityEvent> buildActivityEvents(Handle handle, ChangeEvent changeEvent) {
    List<ActivityEvent> events = new ArrayList<>();

    if (changeEvent == null
        || changeEvent.getId() == null
        || changeEvent.getEntityId() == null
        || changeEvent.getEntityType() == null) {
      return events;
    }

    EntityReference entityRef =
        new EntityReference()
            .withId(changeEvent.getEntityId())
            .withType(changeEvent.getEntityType())
            .withFullyQualifiedName(changeEvent.getEntityFullyQualifiedName());
    EntityReference actorRef = buildActivityActorReference(handle, changeEvent.getUserName());
    List<EntityReference> domains = buildActivityDomains(changeEvent.getDomains());
    ChangeDescription changeDescription = changeEvent.getChangeDescription();

    int fieldChangeIndex = 0;
    if (changeDescription != null) {
      fieldChangeIndex =
          appendFieldActivityEvents(
              events,
              changeEvent,
              entityRef,
              actorRef,
              domains,
              changeDescription.getFieldsAdded(),
              fieldChangeIndex);
      fieldChangeIndex =
          appendFieldActivityEvents(
              events,
              changeEvent,
              entityRef,
              actorRef,
              domains,
              changeDescription.getFieldsUpdated(),
              fieldChangeIndex);
      appendFieldActivityEvents(
          events,
          changeEvent,
          entityRef,
          actorRef,
          domains,
          changeDescription.getFieldsDeleted(),
          fieldChangeIndex);
    }

    if (events.isEmpty()) {
      ActivityEventType eventType = mapChangeEventToActivityEventType(changeEvent.getEventType());
      if (eventType != null) {
        events.add(
            buildActivityEvent(
                changeEvent, entityRef, actorRef, domains, eventType, null, 0));
      }
    }

    return events;
  }

  private static int appendFieldActivityEvents(
      List<ActivityEvent> events,
      ChangeEvent changeEvent,
      EntityReference entityRef,
      EntityReference actorRef,
      List<EntityReference> domains,
      List<FieldChange> fieldChanges,
      int startIndex) {
    if (fieldChanges == null) {
      return startIndex;
    }

    int currentIndex = startIndex;
    for (FieldChange fieldChange : fieldChanges) {
      ActivityEventType eventType =
          mapFieldChangeToActivityEventType(fieldChange != null ? fieldChange.getName() : null);
      if (eventType == null) {
        continue;
      }

      events.add(
          buildActivityEvent(
              changeEvent,
              entityRef,
              actorRef,
              domains,
              eventType,
              fieldChange,
              currentIndex));
      currentIndex++;
    }

    return currentIndex;
  }

  private static ActivityEvent buildActivityEvent(
      ChangeEvent changeEvent,
      EntityReference entityRef,
      EntityReference actorRef,
      List<EntityReference> domains,
      ActivityEventType eventType,
      FieldChange fieldChange,
      int eventIndex) {
    String seed =
        changeEvent.getId()
            + ":"
            + eventType.value()
            + ":"
            + (fieldChange != null ? fieldChange.getName() : "")
            + ":"
            + eventIndex;

    return new ActivityEvent()
        .withId(UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)))
        .withEventType(eventType)
        .withEntity(entityRef)
        .withAbout(
            buildActivityEntityLink(
                changeEvent.getEntityType(), changeEvent.getEntityFullyQualifiedName(), fieldChange))
        .withDomains(domains)
        .withActor(actorRef)
        .withTimestamp(changeEvent.getTimestamp())
        .withSummary(buildActivitySummary(changeEvent, eventType, fieldChange))
        .withFieldName(fieldChange != null ? fieldChange.getName() : null)
        .withOldValue(fieldChange != null ? truncateActivityValue(fieldChange.getOldValue()) : null)
        .withNewValue(fieldChange != null ? truncateActivityValue(fieldChange.getNewValue()) : null);
  }

  private static EntityReference buildActivityActorReference(Handle handle, String userName) {
    String actorName =
        userName == null || userName.isBlank() ? "system" : userName;
    String actorId = lookupUserId(handle, actorName);
    UUID actorUuid =
        actorId != null
            ? UUID.fromString(actorId)
            : UUID.nameUUIDFromBytes(("activity-actor:" + actorName).getBytes(StandardCharsets.UTF_8));

    return new EntityReference()
        .withId(actorUuid)
        .withType(Entity.USER)
        .withName(actorName)
        .withFullyQualifiedName(actorName);
  }

  private static List<EntityReference> buildActivityDomains(List<UUID> domainIds) {
    if (domainIds == null || domainIds.isEmpty()) {
      return null;
    }

    return domainIds.stream()
        .map(domainId -> new EntityReference().withId(domainId).withType(Entity.DOMAIN))
        .toList();
  }

  private static ActivityEventType mapChangeEventToActivityEventType(EventType eventType) {
    if (eventType == null) {
      return null;
    }

    return switch (eventType) {
      case ENTITY_CREATED -> ActivityEventType.ENTITY_CREATED;
      case ENTITY_UPDATED -> ActivityEventType.ENTITY_UPDATED;
      case ENTITY_DELETED -> ActivityEventType.ENTITY_DELETED;
      case ENTITY_SOFT_DELETED -> ActivityEventType.ENTITY_SOFT_DELETED;
      case ENTITY_RESTORED -> ActivityEventType.ENTITY_RESTORED;
      default -> null;
    };
  }

  private static ActivityEventType mapFieldChangeToActivityEventType(String fieldName) {
    if (fieldName == null || fieldName.isBlank()) {
      return null;
    }

    if (fieldName.equals("description")
        || fieldName.startsWith("columns.")
        || fieldName.startsWith("schemaFields.")
        || fieldName.startsWith("children.")) {
      if (fieldName.contains("description")) {
        return ActivityEventType.DESCRIPTION_UPDATED;
      }
    }

    if (fieldName.equals("tags")
        || fieldName.startsWith("columns.")
        || fieldName.startsWith("schemaFields.")
        || fieldName.startsWith("children.")) {
      if (fieldName.contains("tags")) {
        return ActivityEventType.TAGS_UPDATED;
      }
    }

    if (fieldName.equals("owners") || fieldName.equals("owner")) {
      return ActivityEventType.OWNER_UPDATED;
    }
    if (fieldName.equals("domain") || fieldName.equals("domains")) {
      return ActivityEventType.DOMAIN_UPDATED;
    }
    if (fieldName.equals("tier")) {
      return ActivityEventType.TIER_UPDATED;
    }
    if (fieldName.startsWith("extension")) {
      return ActivityEventType.CUSTOM_PROPERTY_UPDATED;
    }

    return null;
  }

  private static String buildActivitySummary(
      ChangeEvent changeEvent, ActivityEventType eventType, FieldChange fieldChange) {
    String entityType = changeEvent.getEntityType();
    String entityName = changeEvent.getEntityFullyQualifiedName();

    return switch (eventType) {
      case ENTITY_CREATED -> String.format("Created %s: %s", entityType, entityName);
      case ENTITY_DELETED -> String.format("Deleted %s: %s", entityType, entityName);
      case ENTITY_SOFT_DELETED -> String.format("Soft deleted %s: %s", entityType, entityName);
      case ENTITY_RESTORED -> String.format("Restored %s: %s", entityType, entityName);
      case DESCRIPTION_UPDATED -> fieldChange != null
          ? String.format("Updated description of %s", entityName)
          : String.format("Description updated on %s", entityName);
      case TAGS_UPDATED -> String.format("Tags updated on %s", entityName);
      case OWNER_UPDATED -> String.format("Owner changed on %s", entityName);
      case DOMAIN_UPDATED -> String.format("Domain changed on %s", entityName);
      case TIER_UPDATED -> String.format("Tier changed on %s", entityName);
      case CUSTOM_PROPERTY_UPDATED -> fieldChange != null
          ? String.format("Custom property '%s' updated on %s", fieldChange.getName(), entityName)
          : String.format("Custom property updated on %s", entityName);
      default -> String.format("Updated %s: %s", entityType, entityName);
    };
  }

  private static String buildActivityEntityLink(
      String entityType, String entityFqn, FieldChange fieldChange) {
    if (entityType == null || entityFqn == null || entityFqn.isBlank()) {
      return null;
    }

    StringBuilder link = new StringBuilder("<#E::");
    link.append(entityType).append("::").append(entityFqn);

    if (fieldChange != null && fieldChange.getName() != null && !fieldChange.getName().isBlank()) {
      String[] parts = fieldChange.getName().split("\\.", 3);
      if (parts.length >= 2) {
        link.append("::").append(parts[0]).append("::").append(parts[1]);
        if (parts.length == 3) {
          link.append("::").append(parts[2]);
        }
      } else {
        link.append("::").append(fieldChange.getName());
      }
    }

    link.append(">");

    return link.toString();
  }

  private static String truncateActivityValue(Object value) {
    if (value == null) {
      return null;
    }

    String stringValue = value.toString();
    if (stringValue.length() <= 1000) {
      return stringValue;
    }

    return stringValue.substring(0, 997) + "...";
  }

  private static boolean activityEventExists(Handle handle, UUID activityId, long timestamp) {
    return handle
            .createQuery("SELECT COUNT(*) FROM activity_stream WHERE id = :id AND timestamp = :timestamp")
            .bind("id", activityId.toString())
            .bind("timestamp", timestamp)
            .mapTo(Long.class)
            .one()
        > 0;
  }

  private static void insertActivityEvent(Handle handle, ActivityEvent event) {
    String entityFqnHash =
        event.getEntity().getFullyQualifiedName() != null
            ? FullyQualifiedName.buildHash(event.getEntity().getFullyQualifiedName())
            : null;
    String aboutFqnHash =
        event.getAbout() != null ? FullyQualifiedName.buildHash(event.getAbout()) : null;
    String domains =
        event.getDomains() == null || event.getDomains().isEmpty()
            ? null
            : JsonUtils.pojoToJson(
                event.getDomains().stream().map(domain -> domain.getId().toString()).toList());

    handle
        .createUpdate(
            "INSERT INTO activity_stream "
                + "(id, eventType, entityType, entityId, entityFqnHash, about, aboutFqnHash, "
                + "actorId, actorName, timestamp, summary, fieldName, oldValue, newValue, domains, json) "
                + "VALUES (:id, :eventType, :entityType, :entityId, :entityFqnHash, :about, "
                + ":aboutFqnHash, :actorId, :actorName, :timestamp, :summary, :fieldName, "
                + ":oldValue, :newValue, :domains, :json)")
        .bind("id", event.getId().toString())
        .bind("eventType", event.getEventType().value())
        .bind("entityType", event.getEntity().getType())
        .bind("entityId", event.getEntity().getId().toString())
        .bind("entityFqnHash", entityFqnHash)
        .bind("about", event.getAbout())
        .bind("aboutFqnHash", aboutFqnHash)
        .bind("actorId", event.getActor().getId().toString())
        .bind("actorName", event.getActor().getName())
        .bind("timestamp", event.getTimestamp())
        .bind("summary", event.getSummary())
        .bind("fieldName", event.getFieldName())
        .bind("oldValue", event.getOldValue())
        .bind("newValue", event.getNewValue())
        .bind("domains", domains)
        .bind("json", JsonUtils.pojoToJson(event))
        .execute();
  }

  private static long getSequenceValue(Handle handle) {
    return handle
        .createQuery("SELECT id FROM new_task_sequence")
        .mapTo(Long.class)
        .findOne()
        .orElse(0L);
  }

  private static void updateSequenceValue(Handle handle, long seqVal) {
    handle.execute("UPDATE new_task_sequence SET id = ?", seqVal);
  }

  private static boolean taskExists(Handle handle, String taskId) {
    return handle
            .createQuery("SELECT COUNT(*) FROM task_entity WHERE id = :id")
            .bind("id", taskId)
            .mapTo(Long.class)
            .one()
        > 0;
  }

  private static void insertTask(Handle handle, String id, String json, String fqnHash) {
    handle
        .createUpdate("INSERT INTO task_entity (id, json, fqnHash) VALUES (:id, :json, :fqnHash)")
        .bind("id", id)
        .bind("json", json)
        .bind("fqnHash", fqnHash)
        .execute();
  }

  private static String lookupUserId(Handle handle, String userName) {
    if (userName == null || "system".equals(userName)) {
      return null;
    }
    try {
      String nameHash = FullyQualifiedName.buildHash(userName);
      return handle
          .createQuery("SELECT id FROM user_entity WHERE nameHash = :nameHash")
          .bind("nameHash", nameHash)
          .mapTo(String.class)
          .findOne()
          .orElse(null);
    } catch (Exception e) {
      LOG.debug("Could not look up user '{}': {}", userName, e.getMessage());
      return null;
    }
  }
}
