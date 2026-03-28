package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.ChangeEvent;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.EventType;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.TaskRepository;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.WebsocketNotificationHandler;

/** Creates an OM Task entity for a ManualTask workflow node. No Flowable dependencies. */
@Slf4j
public class SetupImpl {

  public static UUID createTask(
      String entityLinkStr,
      TaskCategory category,
      TaskEntityType taskType,
      UUID workflowInstanceId,
      Map<String, Object> assigneesConfig) {

    TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);

    MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
    EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);

    EntityReference aboutRef =
        new EntityReference()
            .withId(entity.getId())
            .withType(Entity.getEntityTypeFromObject(entity))
            .withName(entity.getName())
            .withFullyQualifiedName(entity.getFullyQualifiedName());

    String updatedBy = entity.getUpdatedBy();
    EntityReference createdByRef =
        Entity.getEntityReferenceByName(Entity.USER, updatedBy, Include.NON_DELETED);

    List<EntityReference> assignees = resolveAssignees(entity, assigneesConfig);

    Task task =
        new Task()
            .withId(UUID.randomUUID())
            .withType(taskType)
            .withCategory(category)
            .withStatus(TaskEntityStatus.Open)
            .withPriority(TaskPriority.Medium)
            .withAbout(aboutRef)
            .withAssignees(assignees)
            .withCreatedBy(createdByRef)
            .withWorkflowInstanceId(workflowInstanceId)
            .withDescription(buildDescription(entity, taskType))
            .withCreatedAt(System.currentTimeMillis())
            .withUpdatedAt(System.currentTimeMillis())
            .withUpdatedBy(updatedBy);

    task = taskRepository.create(null, task);

    publishChangeEvent(task, updatedBy);

    LOG.info(
        "[ManualTask.SetupImpl] Created Task: id='{}', taskId='{}', type='{}', about='{}'",
        task.getId(),
        task.getTaskId(),
        taskType,
        entity.getFullyQualifiedName());

    return task.getId();
  }

  @SuppressWarnings("unchecked")
  private static List<EntityReference> resolveAssignees(
      EntityInterface entity, Map<String, Object> assigneesConfig) {
    boolean addOwners = true;
    boolean addReviewers = false;
    List<String> specificAssignees = List.of();

    if (assigneesConfig != null) {
      addOwners = Boolean.TRUE.equals(assigneesConfig.getOrDefault("addOwners", true));
      addReviewers = Boolean.TRUE.equals(assigneesConfig.getOrDefault("addReviewers", false));
      Object specific = assigneesConfig.get("specificAssignees");
      if (specific instanceof List<?> list) {
        specificAssignees = (List<String>) list;
      }
    }

    Set<UUID> seen = new LinkedHashSet<>();
    List<EntityReference> assignees = new ArrayList<>();

    if (addOwners && entity.getOwners() != null) {
      for (EntityReference ref : entity.getOwners()) {
        if (seen.add(ref.getId())) {
          assignees.add(ref);
        }
      }
    }

    if (addReviewers && entity.getReviewers() != null) {
      for (EntityReference ref : entity.getReviewers()) {
        if (seen.add(ref.getId())) {
          assignees.add(ref);
        }
      }
    }

    for (String entityLinkStr : specificAssignees) {
      try {
        MessageParser.EntityLink link = MessageParser.EntityLink.parse(entityLinkStr);
        EntityReference ref =
            Entity.getEntityReferenceByName(
                link.getEntityType(), link.getEntityFQN(), Include.NON_DELETED);
        if (seen.add(ref.getId())) {
          assignees.add(ref);
        }
      } catch (Exception e) {
        LOG.warn(
            "[ManualTask.SetupImpl] Could not resolve specific assignee '{}': {}",
            entityLinkStr,
            e.getMessage());
      }
    }

    return assignees;
  }

  private static String buildDescription(EntityInterface entity, TaskEntityType taskType) {
    return String.format(
        "%s task for %s: %s",
        taskType.value(), entity.getEntityReference().getType(), entity.getName());
  }

  private static void publishChangeEvent(Task task, String userName) {
    ChangeEvent changeEvent =
        new ChangeEvent()
            .withId(UUID.randomUUID())
            .withEventType(EventType.ENTITY_CREATED)
            .withEntityId(task.getId())
            .withEntityType(Entity.TASK)
            .withEntityFullyQualifiedName(task.getFullyQualifiedName())
            .withUserName(userName)
            .withTimestamp(task.getUpdatedAt())
            .withEntity(task);

    Entity.getCollectionDAO().changeEventDAO().insert(JsonUtils.pojoToMaskedJson(changeEvent));
    WebsocketNotificationHandler.handleTaskNotification(task);
  }
}
