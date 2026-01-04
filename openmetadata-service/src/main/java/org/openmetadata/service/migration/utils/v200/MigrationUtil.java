/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.migration.utils.v200;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.Handle;
import org.openmetadata.schema.entity.feed.Thread;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskDetails;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.type.TaskResolution;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.schema.type.TaskStatus;
import org.openmetadata.schema.type.TaskType;
import org.openmetadata.schema.type.ThreadType;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.FullyQualifiedName;

@Slf4j
public class MigrationUtil {

  private MigrationUtil() {}

  public static void migrateThreadTasksToTaskEntity(Handle handle, boolean isPostgres) {
    LOG.info("Starting migration of Thread tasks to Task entities...");

    String selectQuery =
        isPostgres
            ? "SELECT id, json::text FROM thread_entity WHERE json->>'type' = 'Task'"
            : "SELECT id, json FROM thread_entity WHERE JSON_UNQUOTE(JSON_EXTRACT(json, '$.type')) = 'Task'";

    List<Map<String, Object>> threadRows = handle.createQuery(selectQuery).mapToMap().list();

    LOG.info("Found {} Thread tasks to migrate", threadRows.size());

    int migrated = 0;
    int failed = 0;

    for (Map<String, Object> row : threadRows) {
      try {
        String threadId = (String) row.get("id");
        String jsonStr = (String) row.get("json");
        Thread thread = JsonUtils.readValue(jsonStr, Thread.class);

        if (thread.getType() != ThreadType.Task || thread.getTask() == null) {
          continue;
        }

        Task task = convertThreadToTask(thread);

        // Resolve domain from target entity
        EntityReference domain = resolveDomainFromEntity(handle, thread.getEntityRef(), isPostgres);
        task.setDomain(domain);

        insertTask(handle, task, isPostgres);

        // Insert domain relationship if domain exists
        if (domain != null && domain.getId() != null) {
          insertDomainRelationship(handle, domain.getId(), task.getId(), isPostgres);
        }

        recordMigrationMapping(handle, threadId, task.getId().toString(), isPostgres);
        migrated++;

        if (migrated % 100 == 0) {
          LOG.info("Migrated {} tasks...", migrated);
        }
      } catch (Exception e) {
        failed++;
        LOG.error("Failed to migrate thread {}: {}", row.get("id"), e.getMessage());
      }
    }

    LOG.info("Task migration completed. Migrated: {}, Failed: {}", migrated, failed);
  }

  private static Task convertThreadToTask(Thread thread) {
    TaskDetails taskDetails = thread.getTask();
    long now = System.currentTimeMillis();

    Task task = new Task();
    task.setId(UUID.randomUUID());
    task.setName(generateTaskName(thread, taskDetails));
    task.setFullyQualifiedName(task.getName());
    task.setDescription(extractDescription(thread));
    task.setCategory(mapTaskCategory(taskDetails.getType()));
    task.setType(mapTaskType(taskDetails.getType()));
    task.setStatus(mapTaskStatus(taskDetails.getStatus()));
    task.setPriority(TaskPriority.Medium);
    task.setAssignees(taskDetails.getAssignees());

    // Set the entity this task is about (from the Thread's entity reference)
    if (thread.getEntityRef() != null) {
      task.setAbout(thread.getEntityRef());
      // Inherit domain from target entity if available
      // Note: Domain resolution happens at repository level during creation
    }

    // Create EntityReference for createdBy
    if (thread.getCreatedBy() != null) {
      EntityReference createdByRef = new EntityReference();
      createdByRef.setName(thread.getCreatedBy());
      createdByRef.setType("user");
      task.setCreatedBy(createdByRef);
    }

    task.setCreatedAt(thread.getThreadTs() != null ? thread.getThreadTs() : now);
    task.setUpdatedAt(thread.getUpdatedAt() != null ? thread.getUpdatedAt() : now);
    task.setUpdatedBy(
        thread.getUpdatedBy() != null ? thread.getUpdatedBy() : thread.getCreatedBy());
    task.setVersion(0.1);
    task.setDeleted(false);

    if (taskDetails.getStatus() == TaskStatus.Closed) {
      TaskResolution resolution = new TaskResolution();
      resolution.setType(TaskResolutionType.Completed);
      resolution.setResolvedAt(taskDetails.getClosedAt());
      if (taskDetails.getClosedBy() != null) {
        EntityReference resolvedBy = new EntityReference();
        resolvedBy.setName(taskDetails.getClosedBy());
        resolvedBy.setType("user");
        resolution.setResolvedBy(resolvedBy);
      }
      if (taskDetails.getNewValue() != null) {
        resolution.setNewValue(taskDetails.getNewValue());
      }
      task.setResolution(resolution);
    }

    // Store old value and suggestion in a generic payload map
    if (taskDetails.getOldValue() != null || taskDetails.getSuggestion() != null) {
      java.util.Map<String, Object> payload = new java.util.HashMap<>();
      if (taskDetails.getOldValue() != null) {
        payload.put("oldValue", taskDetails.getOldValue());
      }
      if (taskDetails.getSuggestion() != null) {
        payload.put("suggestion", taskDetails.getSuggestion());
      }
      task.setPayload(payload);
    }

    String taskId = generateTaskId(thread);
    task.setTaskId(taskId);

    return task;
  }

  private static String generateTaskName(Thread thread, TaskDetails taskDetails) {
    String prefix = taskDetails.getType() != null ? taskDetails.getType().name() : "Task";
    return prefix
        + "_"
        + (taskDetails.getId() != null
            ? taskDetails.getId()
            : UUID.randomUUID().toString().substring(0, 8));
  }

  private static String extractDescription(Thread thread) {
    if (thread.getMessage() != null && !thread.getMessage().isEmpty()) {
      return thread.getMessage();
    }
    return "Migrated from Thread task";
  }

  private static TaskCategory mapTaskCategory(TaskType threadTaskType) {
    if (threadTaskType == null) {
      return TaskCategory.Custom;
    }
    return switch (threadTaskType) {
      case RequestApproval -> TaskCategory.Approval;
      case RequestDescription, UpdateDescription -> TaskCategory.MetadataUpdate;
      case RequestTag, UpdateTag -> TaskCategory.MetadataUpdate;
      case RequestTestCaseFailureResolution -> TaskCategory.Incident;
      case Generic -> TaskCategory.Custom;
    };
  }

  private static TaskEntityType mapTaskType(TaskType threadTaskType) {
    if (threadTaskType == null) {
      return TaskEntityType.CustomTask;
    }
    return switch (threadTaskType) {
      case RequestApproval -> TaskEntityType.GlossaryApproval;
      case RequestDescription, UpdateDescription -> TaskEntityType.DescriptionUpdate;
      case RequestTag, UpdateTag -> TaskEntityType.TagUpdate;
      case RequestTestCaseFailureResolution -> TaskEntityType.TestCaseResolution;
      case Generic -> TaskEntityType.CustomTask;
    };
  }

  private static TaskEntityStatus mapTaskStatus(TaskStatus threadStatus) {
    if (threadStatus == null) {
      return TaskEntityStatus.Open;
    }
    return switch (threadStatus) {
      case Open -> TaskEntityStatus.Open;
      case Closed -> TaskEntityStatus.Completed;
    };
  }

  private static String generateTaskId(Thread thread) {
    if (thread.getTask() != null && thread.getTask().getId() != null) {
      return String.format("TASK-%05d", thread.getTask().getId());
    }
    return "TASK-" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
  }

  private static void insertTask(Handle handle, Task task, boolean isPostgres) {
    String fqnHash = FullyQualifiedName.buildHash(task.getFullyQualifiedName());
    String json = JsonUtils.pojoToJson(task);

    String insertQuery =
        isPostgres
            ? """
              INSERT INTO task_entity (id, json, fqnHash)
              VALUES (:id, :json::jsonb, :fqnHash)
              ON CONFLICT (id) DO UPDATE SET json = :json::jsonb
              """
            : """
              INSERT INTO task_entity (id, json, fqnHash)
              VALUES (:id, :json, :fqnHash)
              ON DUPLICATE KEY UPDATE json = :json
              """;

    handle
        .createUpdate(insertQuery)
        .bind("id", task.getId().toString())
        .bind("json", json)
        .bind("fqnHash", fqnHash)
        .execute();
  }

  private static void recordMigrationMapping(
      Handle handle, String oldThreadId, String newTaskId, boolean isPostgres) {
    String insertQuery =
        isPostgres
            ? """
              INSERT INTO task_migration_mapping (oldId, newTaskId, oldType, migratedAt)
              VALUES (:oldId, :newTaskId, 'thread', :migratedAt)
              ON CONFLICT (oldId) DO UPDATE SET newTaskId = :newTaskId
              """
            : """
              INSERT INTO task_migration_mapping (oldId, newTaskId, oldType, migratedAt)
              VALUES (:oldId, :newTaskId, 'thread', :migratedAt)
              ON DUPLICATE KEY UPDATE newTaskId = :newTaskId
              """;

    handle
        .createUpdate(insertQuery)
        .bind("oldId", oldThreadId)
        .bind("newTaskId", newTaskId)
        .bind("migratedAt", System.currentTimeMillis())
        .execute();
  }

  public static void updateTaskSequence(Handle handle, boolean isPostgres) {
    String query =
        isPostgres
            ? """
              UPDATE new_task_sequence
              SET id = (SELECT COALESCE(MAX(CAST(SUBSTRING(taskId, 6) AS INTEGER)), 0) FROM task_entity)
              """
            : """
              UPDATE new_task_sequence
              SET id = (SELECT COALESCE(MAX(CAST(SUBSTRING(taskId, 6) AS UNSIGNED)), 0) FROM task_entity)
              """;
    handle.createUpdate(query).execute();
    LOG.info("Updated task sequence to match migrated tasks");
  }

  private static EntityReference resolveDomainFromEntity(
      Handle handle, EntityReference entityRef, boolean isPostgres) {
    if (entityRef == null || entityRef.getId() == null) {
      return null;
    }

    try {
      // Find domain relationship for the entity
      String query =
          "SELECT fromId FROM entity_relationship "
              + "WHERE toId = :entityId AND toEntity = :entityType "
              + "AND fromEntity = 'domain' AND relation = :relation";

      List<Map<String, Object>> results =
          handle
              .createQuery(query)
              .bind("entityId", entityRef.getId().toString())
              .bind("entityType", entityRef.getType())
              .bind("relation", Relationship.HAS.ordinal())
              .mapToMap()
              .list();

      if (!results.isEmpty()) {
        String domainId = (String) results.get(0).get("fromId");
        if (domainId != null) {
          EntityReference domainRef = new EntityReference();
          domainRef.setId(UUID.fromString(domainId));
          domainRef.setType(Entity.DOMAIN);
          return domainRef;
        }
      }
    } catch (Exception e) {
      LOG.debug(
          "Could not resolve domain for entity {} {}: {}",
          entityRef.getType(),
          entityRef.getId(),
          e.getMessage());
    }
    return null;
  }

  private static void insertDomainRelationship(
      Handle handle, UUID domainId, UUID taskId, boolean isPostgres) {
    String insertQuery =
        isPostgres
            ? """
              INSERT INTO entity_relationship (fromId, toId, fromEntity, toEntity, relation)
              VALUES (:fromId, :toId, 'domain', 'task', :relation)
              ON CONFLICT (fromId, toId, relation) DO NOTHING
              """
            : """
              INSERT IGNORE INTO entity_relationship (fromId, toId, fromEntity, toEntity, relation)
              VALUES (:fromId, :toId, 'domain', 'task', :relation)
              """;

    handle
        .createUpdate(insertQuery)
        .bind("fromId", domainId.toString())
        .bind("toId", taskId.toString())
        .bind("relation", Relationship.HAS.ordinal())
        .execute();
  }
}
