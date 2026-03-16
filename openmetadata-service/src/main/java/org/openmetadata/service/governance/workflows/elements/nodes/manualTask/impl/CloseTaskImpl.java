package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TaskResolution;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.TaskRepository;

/** Closes an OM Task entity when a ManualTask reaches a terminal status. No Flowable dependencies. */
@Slf4j
public class CloseTaskImpl {

  private static final String FALLBACK_USER = "governance-bot";

  public static void closeTask(UUID taskId, String closedByUser) {
    TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);
    Task task = taskRepository.get(null, taskId, taskRepository.getFields("*"));

    if (isAlreadyClosed(task)) {
      LOG.debug("[ManualTask.CloseTaskImpl] Task '{}' already closed, skipping.", taskId);
      return;
    }

    String resolvedUser =
        (closedByUser != null && !closedByUser.isBlank()) ? closedByUser : FALLBACK_USER;

    EntityReference resolvedByRef =
        Entity.getEntityReferenceByName(Entity.USER, resolvedUser, Include.NON_DELETED);

    TaskResolution resolution =
        new TaskResolution()
            .withType(TaskResolutionType.Completed)
            .withResolvedBy(resolvedByRef)
            .withResolvedAt(System.currentTimeMillis());

    taskRepository.resolveTask(task, resolution, resolvedUser);

    LOG.info(
        "[ManualTask.CloseTaskImpl] Closed Task: id='{}', closedBy='{}'", taskId, resolvedUser);
  }

  private static boolean isAlreadyClosed(Task task) {
    return task.getResolution() != null;
  }
}
