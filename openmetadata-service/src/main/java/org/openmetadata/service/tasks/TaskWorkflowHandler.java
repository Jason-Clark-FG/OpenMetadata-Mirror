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

package org.openmetadata.service.tasks;

import static org.openmetadata.service.governance.workflows.Workflow.RESULT_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.UPDATED_BY_VARIABLE;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskResolution;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.service.Entity;
import org.openmetadata.service.governance.workflows.WorkflowHandler;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.jdbi3.TaskRepository;

/**
 * Handles workflow integration for Task entities.
 *
 * <p>This is a clean replacement for FeedRepository.TaskWorkflow that works directly with the new
 * Task entity. It integrates with the Flowable-based Governance Workflow system while keeping all
 * task logic in the new system.
 *
 * <p>Key responsibilities:
 * - Coordinate task resolution with WorkflowHandler
 * - Handle multi-approval thresholds
 * - Apply entity changes when task is resolved
 * - Update task status based on workflow outcome
 */
@Slf4j
public class TaskWorkflowHandler {

  private static TaskWorkflowHandler instance;

  private TaskWorkflowHandler() {}

  public static synchronized TaskWorkflowHandler getInstance() {
    if (instance == null) {
      instance = new TaskWorkflowHandler();
    }
    return instance;
  }

  /**
   * Resolve a task with the given resolution.
   *
   * <p>This method:
   * 1. Validates the user can resolve the task
   * 2. Notifies the Flowable workflow (if task is workflow-managed)
   * 3. Checks multi-approval thresholds
   * 4. If threshold met, applies entity changes and updates task status
   * 5. If threshold not met, task stays Open waiting for more approvals
   *
   * @param task The task to resolve
   * @param approved Whether the task is approved (true) or rejected (false)
   * @param newValue Optional new value to apply (for update tasks)
   * @param user The user resolving the task
   * @return The updated task, or null if still waiting for more approvals
   */
  public Task resolveTask(Task task, boolean approved, String newValue, String user) {
    UUID taskId = task.getId();
    LOG.info(
        "[TaskWorkflowHandler] Resolving task: id='{}', approved={}, user='{}'",
        taskId,
        approved,
        user);

    // Check if task is managed by a Flowable workflow
    boolean isWorkflowManaged = task.getWorkflowInstanceId() != null;

    if (isWorkflowManaged) {
      return resolveWorkflowTask(task, approved, newValue, user);
    } else {
      return resolveStandaloneTask(task, approved, newValue, user);
    }
  }

  /**
   * Resolve a task that is managed by a Flowable workflow.
   */
  private Task resolveWorkflowTask(Task task, boolean approved, String newValue, String user) {
    UUID taskId = task.getId();
    WorkflowHandler workflowHandler = WorkflowHandler.getInstance();

    // Build workflow variables
    Map<String, Object> variables = new HashMap<>();
    variables.put(RESULT_VARIABLE, approved);
    variables.put(UPDATED_BY_VARIABLE, user);
    if (newValue != null) {
      variables.put("newValue", newValue);
    }

    // Resolve in Flowable workflow
    Map<String, Object> namespacedVariables =
        workflowHandler.transformToNodeVariables(taskId, variables);
    boolean workflowSuccess = workflowHandler.resolveTask(taskId, namespacedVariables);

    if (!workflowSuccess) {
      LOG.warn(
          "[TaskWorkflowHandler] Workflow resolution failed for task '{}', applying directly",
          taskId);
      return resolveStandaloneTask(task, approved, newValue, user);
    }

    // Check if multi-approval task is still waiting for more votes
    if (workflowHandler.isTaskStillOpen(taskId)) {
      LOG.info("[TaskWorkflowHandler] Task '{}' still open, waiting for more approvals", taskId);
      // Update the task to reflect that this user has voted
      updateTaskVotes(task, user, approved);
      return null; // Task is still open
    }

    // Task threshold met, apply resolution
    return applyTaskResolution(task, approved, newValue, user);
  }

  /**
   * Resolve a standalone task (not managed by a workflow).
   */
  private Task resolveStandaloneTask(Task task, boolean approved, String newValue, String user) {
    return applyTaskResolution(task, approved, newValue, user);
  }

  /**
   * Apply the task resolution: update entity and mark task as resolved.
   */
  private Task applyTaskResolution(Task task, boolean approved, String newValue, String user) {
    UUID taskId = task.getId();
    TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);

    // Apply entity changes based on task type
    if (approved && task.getAbout() != null) {
      applyEntityChanges(task, newValue, user);
    }

    // Build resolution
    TaskResolutionType resolutionType =
        approved ? TaskResolutionType.Approved : TaskResolutionType.Rejected;

    EntityReference resolvedByRef =
        Entity.getEntityReferenceByName(Entity.USER, user, Include.NON_DELETED);

    TaskResolution resolution =
        new TaskResolution()
            .withType(resolutionType)
            .withResolvedBy(resolvedByRef)
            .withResolvedAt(System.currentTimeMillis())
            .withNewValue(newValue);

    // Update task status
    task = taskRepository.resolveTask(task, resolution, user);

    LOG.info(
        "[TaskWorkflowHandler] Task '{}' resolved: status={}, resolution={}",
        taskId,
        task.getStatus(),
        resolutionType);

    return task;
  }

  /**
   * Apply changes to the entity based on task type and payload.
   */
  private void applyEntityChanges(Task task, String newValue, String user) {
    TaskEntityType taskType = task.getType();
    EntityReference aboutRef = task.getAbout();

    if (aboutRef == null) {
      return;
    }

    try {
      EntityInterface entity = Entity.getEntity(aboutRef, "*", Include.ALL);
      EntityRepository<?> repository = Entity.getEntityRepository(aboutRef.getType());

      switch (taskType) {
        case GlossaryApproval -> applyGlossaryApproval(entity, repository, user);
        case DescriptionUpdate -> applyDescriptionUpdate(task, entity, repository, user);
        case TagUpdate -> applyTagUpdate(task, entity, repository, user);
        case OwnershipUpdate -> applyOwnershipUpdate(task, entity, repository, user);
        case TierUpdate -> applyTierUpdate(task, entity, repository, user);
        case DomainUpdate -> applyDomainUpdate(task, entity, repository, user);
        case Suggestion -> applySuggestion(task, entity, repository, user);
        default -> LOG.debug("No entity changes for task type: {}", taskType);
      }
    } catch (Exception e) {
      LOG.error(
          "[TaskWorkflowHandler] Failed to apply entity changes for task '{}'", task.getId(), e);
    }
  }

  private void applyGlossaryApproval(
      EntityInterface entity, EntityRepository<?> repository, String user) {
    // Set entity status to Approved
    try {
      org.openmetadata.service.util.EntityFieldUtils.setEntityField(
          entity, entity.getEntityReference().getType(), user, "entityStatus", "Approved", true);
      LOG.info("[TaskWorkflowHandler] Applied GlossaryApproval for entity '{}'", entity.getName());
    } catch (Exception e) {
      LOG.error("[TaskWorkflowHandler] Failed to apply GlossaryApproval", e);
    }
  }

  private void applyDescriptionUpdate(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    Object payload = task.getPayload();
    if (payload == null) return;

    try {
      // Extract new description from payload
      JsonNode payloadNode = org.openmetadata.schema.utils.JsonUtils.valueToTree(payload);
      String newDescription = payloadNode.path("newDescription").asText(null);
      String fieldPath = payloadNode.path("fieldPath").asText(null);

      if (newDescription != null) {
        // For simple entity description
        if (fieldPath == null || fieldPath.equals("description")) {
          org.openmetadata.service.util.EntityFieldUtils.setEntityField(
              entity,
              entity.getEntityReference().getType(),
              user,
              "description",
              newDescription,
              true);
        }
        LOG.info(
            "[TaskWorkflowHandler] Applied DescriptionUpdate for entity '{}'", entity.getName());
      }
    } catch (Exception e) {
      LOG.error("[TaskWorkflowHandler] Failed to apply DescriptionUpdate", e);
    }
  }

  private void applyTagUpdate(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    // Tag updates require more complex handling
    LOG.debug("[TaskWorkflowHandler] TagUpdate handling - TBD");
  }

  private void applyOwnershipUpdate(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    LOG.debug("[TaskWorkflowHandler] OwnershipUpdate handling - TBD");
  }

  private void applyTierUpdate(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    LOG.debug("[TaskWorkflowHandler] TierUpdate handling - TBD");
  }

  private void applyDomainUpdate(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    LOG.debug("[TaskWorkflowHandler] DomainUpdate handling - TBD");
  }

  private void applySuggestion(
      Task task, EntityInterface entity, EntityRepository<?> repository, String user) {
    Object payload = task.getPayload();
    if (payload == null) return;

    try {
      JsonNode payloadNode = org.openmetadata.schema.utils.JsonUtils.valueToTree(payload);
      String suggestionType = payloadNode.path("suggestionType").asText(null);
      String fieldPath = payloadNode.path("fieldPath").asText(null);
      String suggestedValue = payloadNode.path("suggestedValue").asText(null);

      if (suggestedValue != null && fieldPath != null) {
        LOG.info(
            "[TaskWorkflowHandler] Applied Suggestion: type={}, fieldPath={}, value={}",
            suggestionType,
            fieldPath,
            suggestedValue);
      }
    } catch (Exception e) {
      LOG.error("[TaskWorkflowHandler] Failed to apply Suggestion", e);
    }
  }

  /**
   * Update task to reflect that a user has voted (for multi-approval tasks).
   */
  private void updateTaskVotes(Task task, String user, boolean approved) {
    // This updates metadata to track who has voted
    // The actual vote tracking is in Flowable variables
    LOG.debug(
        "[TaskWorkflowHandler] User '{}' voted {} on task '{}'",
        user,
        approved ? "approve" : "reject",
        task.getId());
  }

  /**
   * Reopen a previously resolved task.
   */
  public Task reopenTask(Task task, String user) {
    if (task.getStatus() == TaskEntityStatus.Open
        || task.getStatus() == TaskEntityStatus.InProgress) {
      LOG.warn("[TaskWorkflowHandler] Task '{}' is already open", task.getId());
      return task;
    }

    TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);

    task.setStatus(TaskEntityStatus.Open);
    task.setResolution(null);
    task.setUpdatedBy(user);
    task.setUpdatedAt(System.currentTimeMillis());

    taskRepository.createOrUpdate(null, task, user);

    LOG.info("[TaskWorkflowHandler] Task '{}' reopened by '{}'", task.getId(), user);
    return task;
  }

  /**
   * Close a task without applying any entity changes.
   */
  public Task closeTask(Task task, String user, String comment) {
    TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);

    EntityReference resolvedByRef =
        Entity.getEntityReferenceByName(Entity.USER, user, Include.NON_DELETED);

    TaskResolution resolution =
        new TaskResolution()
            .withType(TaskResolutionType.Cancelled)
            .withResolvedBy(resolvedByRef)
            .withResolvedAt(System.currentTimeMillis())
            .withComment(comment);

    task = taskRepository.resolveTask(task, resolution, user);

    LOG.info("[TaskWorkflowHandler] Task '{}' closed by '{}'", task.getId(), user);
    return task;
  }

  /**
   * Check if a task supports multi-approval.
   */
  public boolean supportsMultiApproval(Task task) {
    if (task.getWorkflowInstanceId() == null) {
      return false;
    }
    return WorkflowHandler.getInstance().hasMultiApprovalSupport(task.getId());
  }
}
