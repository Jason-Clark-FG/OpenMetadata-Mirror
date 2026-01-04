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

package org.openmetadata.service.jdbi3;

import static org.openmetadata.common.utils.CommonUtil.listOrEmpty;
import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;
import static org.openmetadata.service.Entity.DOMAIN;
import static org.openmetadata.service.Entity.TEAM;
import static org.openmetadata.service.Entity.USER;

import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.type.TaskResolution;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.FullyQualifiedName;
import org.openmetadata.service.util.EntityUtil;
import org.openmetadata.service.util.EntityUtil.Fields;

@Slf4j
public class TaskRepository extends EntityRepository<Task> {

  public static final String COLLECTION_PATH = "/v1/tasks";
  public static final String FIELD_ASSIGNEES = "assignees";
  public static final String FIELD_REVIEWERS = "reviewers";
  public static final String FIELD_WATCHERS = "watchers";
  public static final String FIELD_ABOUT = "about";
  public static final String FIELD_COMMENTS = "comments";
  public static final String FIELD_RESOLUTION = "resolution";
  public static final String FIELD_DOMAIN = "domain";

  public TaskRepository() {
    super(COLLECTION_PATH, Entity.TASK, Task.class, Entity.getCollectionDAO().taskDAO(), "", "");
    supportsSearch = true;
    quoteFqn = false;
    this.allowedFields.add(FIELD_ASSIGNEES);
    this.allowedFields.add(FIELD_REVIEWERS);
    this.allowedFields.add(FIELD_WATCHERS);
    this.allowedFields.add(FIELD_ABOUT);
    this.allowedFields.add(FIELD_COMMENTS);
    this.allowedFields.add(FIELD_RESOLUTION);
    this.allowedFields.add(FIELD_DOMAIN);
  }

  @Override
  public void setFields(Task task, Fields fields) {
    task.setAssignees(fields.contains(FIELD_ASSIGNEES) ? getAssignees(task) : task.getAssignees());
    task.setReviewers(
        fields.contains(FIELD_REVIEWERS) ? getTaskReviewers(task) : task.getReviewers());
    task.setWatchers(fields.contains(FIELD_WATCHERS) ? getWatchers(task) : task.getWatchers());
    task.setAbout(fields.contains(FIELD_ABOUT) ? getAboutEntity(task) : task.getAbout());
    task.setDomain(fields.contains(FIELD_DOMAIN) ? getDomain(task) : task.getDomain());
    task.setComments(fields.contains(FIELD_COMMENTS) ? getComments(task) : task.getComments());
  }

  @Override
  public void clearFields(Task task, Fields fields) {
    task.setAssignees(fields.contains(FIELD_ASSIGNEES) ? task.getAssignees() : null);
    task.setReviewers(fields.contains(FIELD_REVIEWERS) ? task.getReviewers() : null);
    task.setWatchers(fields.contains(FIELD_WATCHERS) ? task.getWatchers() : null);
    task.setAbout(fields.contains(FIELD_ABOUT) ? task.getAbout() : null);
    task.setDomain(fields.contains(FIELD_DOMAIN) ? task.getDomain() : null);
    task.setComments(fields.contains(FIELD_COMMENTS) ? task.getComments() : null);
  }

  @Override
  public void setFullyQualifiedName(Task task) {
    // FQN is based on taskId (TASK-XXXXX) since that's the unique identifier for lookup via API
    // The name field is a display name that can be customized by users
    task.setFullyQualifiedName(FullyQualifiedName.quoteName(task.getTaskId()));
  }

  @Override
  public void prepare(Task task, boolean update) {
    if (task.getTaskId() == null) {
      task.setTaskId(generateTaskId());
    }
    if (task.getName() == null) {
      task.setName(task.getTaskId());
    }
    if (task.getStatus() == null) {
      task.setStatus(TaskEntityStatus.Open);
    }
    if (task.getPriority() == null) {
      task.setPriority(TaskPriority.Medium);
    }

    validateAssignees(task.getAssignees());
    validateTaskReviewers(task.getReviewers());

    if (task.getDomain() != null && task.getDomain().getId() != null) {
      task.setDomain(Entity.getEntityReferenceById(DOMAIN, task.getDomain().getId(), Include.ALL));
    }
  }

  @Override
  public void storeEntity(Task task, boolean update) {
    EntityReference domain = task.getDomain();
    EntityReference about = task.getAbout();
    EntityReference createdBy = task.getCreatedBy();
    List<EntityReference> assignees = task.getAssignees();
    List<EntityReference> reviewers = task.getReviewers();
    List<EntityReference> watchers = task.getWatchers();

    task.withDomain(null)
        .withAbout(null)
        .withCreatedBy(null)
        .withAssignees(null)
        .withReviewers(null)
        .withWatchers(null);

    if (update) {
      daoCollection
          .taskDAO()
          .update(task.getId(), task.getFullyQualifiedName(), JsonUtils.pojoToJson(task));
    } else {
      daoCollection
          .taskDAO()
          .insertTask(
              task.getId().toString(), JsonUtils.pojoToJson(task), task.getFullyQualifiedName());
    }

    task.withDomain(domain)
        .withAbout(about)
        .withCreatedBy(createdBy)
        .withAssignees(assignees)
        .withReviewers(reviewers)
        .withWatchers(watchers);
  }

  @Override
  public void storeRelationships(Task task) {
    if (task.getDomain() != null) {
      addRelationship(
          task.getDomain().getId(), task.getId(), DOMAIN, Entity.TASK, Relationship.HAS);
    }

    storeAssignees(task);
    storeReviewers(task);
    storeWatchers(task);

    if (task.getCreatedBy() != null) {
      addRelationship(
          task.getCreatedBy().getId(),
          task.getId(),
          Entity.USER,
          Entity.TASK,
          Relationship.CREATED);
    }

    if (task.getAbout() != null) {
      addRelationship(
          task.getAbout().getId(),
          task.getId(),
          task.getAbout().getType(),
          Entity.TASK,
          Relationship.MENTIONED_IN);
    }
  }

  private void storeAssignees(Task task) {
    for (EntityReference assignee : listOrEmpty(task.getAssignees())) {
      addRelationship(
          assignee.getId(),
          task.getId(),
          assignee.getType(),
          Entity.TASK,
          Relationship.ASSIGNED_TO);
    }
  }

  private void storeReviewers(Task task) {
    for (EntityReference reviewer : listOrEmpty(task.getReviewers())) {
      addRelationship(
          reviewer.getId(), task.getId(), reviewer.getType(), Entity.TASK, Relationship.REVIEWS);
    }
  }

  private void storeWatchers(Task task) {
    for (EntityReference watcher : listOrEmpty(task.getWatchers())) {
      addRelationship(
          watcher.getId(), task.getId(), watcher.getType(), Entity.TASK, Relationship.FOLLOWS);
    }
  }

  private List<EntityReference> getAssignees(Task task) {
    return findFromRecordsByRelationship(task.getId(), Entity.TASK, Relationship.ASSIGNED_TO);
  }

  private List<EntityReference> getTaskReviewers(Task task) {
    return findFromRecordsByRelationship(task.getId(), Entity.TASK, Relationship.REVIEWS);
  }

  private List<EntityReference> getWatchers(Task task) {
    return findFromRecordsByRelationship(task.getId(), Entity.TASK, Relationship.FOLLOWS);
  }

  private EntityReference getAboutEntity(Task task) {
    List<EntityReference> refs =
        findFromRecordsByRelationship(task.getId(), Entity.TASK, Relationship.MENTIONED_IN);
    return nullOrEmpty(refs) ? null : refs.get(0);
  }

  private EntityReference getDomain(Task task) {
    return getFromEntityRef(task.getId(), Relationship.HAS, DOMAIN, false);
  }

  private List<org.openmetadata.schema.type.TaskComment> getComments(Task task) {
    return List.of();
  }

  private String generateTaskId() {
    long nextId = getNextSequenceId();
    return String.format("TASK-%05d", nextId);
  }

  private long getNextSequenceId() {
    Boolean isMySQL =
        org.openmetadata.service.resources.databases.DatasourceConfig.getInstance().isMySQL();
    if (Boolean.TRUE.equals(isMySQL)) {
      return Entity.getJdbi()
          .withHandle(
              handle -> {
                handle
                    .createUpdate("UPDATE new_task_sequence SET id = LAST_INSERT_ID(id + 1)")
                    .execute();
                return handle.createQuery("SELECT LAST_INSERT_ID()").mapTo(Long.class).one();
              });
    } else {
      return daoCollection.taskDAO().getNextTaskIdPostgres();
    }
  }

  private void validateAssignees(List<EntityReference> assignees) {
    for (EntityReference assignee : listOrEmpty(assignees)) {
      String type = assignee.getType();
      if (!USER.equals(type) && !TEAM.equals(type)) {
        throw new IllegalArgumentException(
            "Task can only be assigned to users or teams. Found: " + type);
      }
    }
  }

  private void validateTaskReviewers(List<EntityReference> reviewers) {
    for (EntityReference reviewer : listOrEmpty(reviewers)) {
      String type = reviewer.getType();
      if (!USER.equals(type) && !TEAM.equals(type)) {
        throw new IllegalArgumentException("Task reviewers must be users or teams. Found: " + type);
      }
    }
  }

  public Task resolveTask(Task task, TaskResolution resolution, String updatedBy) {
    if (resolution == null) {
      throw new IllegalArgumentException("Resolution cannot be null");
    }

    TaskEntityStatus newStatus = mapResolutionToStatus(resolution.getType());
    task.setStatus(newStatus);
    task.setResolution(resolution);
    task.setUpdatedBy(updatedBy);
    task.setUpdatedAt(System.currentTimeMillis());

    storeEntity(task, true);
    return task;
  }

  private TaskEntityStatus mapResolutionToStatus(TaskResolutionType resolutionType) {
    return switch (resolutionType) {
      case Approved, AutoApproved -> TaskEntityStatus.Approved;
      case Rejected, AutoRejected -> TaskEntityStatus.Rejected;
      case Completed -> TaskEntityStatus.Completed;
      case Cancelled -> TaskEntityStatus.Cancelled;
      case TimedOut -> TaskEntityStatus.Failed;
    };
  }

  public List<EntityReference> findFromRecordsByRelationship(
      UUID toId, String toEntity, Relationship relationship) {
    return EntityUtil.getEntityReferences(
        daoCollection.relationshipDAO().findFrom(toId, toEntity, relationship.ordinal(), null));
  }

  @Override
  public TaskUpdater getUpdater(
      Task original,
      Task updated,
      Operation operation,
      org.openmetadata.schema.type.change.ChangeSource changeSource) {
    return new TaskUpdater(original, updated, operation, changeSource);
  }

  @Override
  protected void postCreate(Task entity) {
    super.postCreate(entity);
  }

  @Override
  protected void postUpdate(Task original, Task updated) {
    super.postUpdate(original, updated);
  }

  public class TaskUpdater extends EntityUpdater {
    public TaskUpdater(
        Task original,
        Task updated,
        Operation operation,
        org.openmetadata.schema.type.change.ChangeSource changeSource) {
      super(original, updated, operation, changeSource);
    }

    @Override
    public void entitySpecificUpdate(boolean consolidatingChanges) {
      updateAssignees();
      updateTaskReviewers();
      updateStatus();
      updatePriority();
      updateResolution();
    }

    private void updateAssignees() {
      List<EntityReference> origAssignees = listOrEmpty(original.getAssignees());
      List<EntityReference> updatedAssignees = listOrEmpty(updated.getAssignees());

      origAssignees.sort(EntityUtil.compareEntityReference);
      updatedAssignees.sort(EntityUtil.compareEntityReference);

      List<EntityReference> added = new java.util.ArrayList<>(updatedAssignees);
      List<EntityReference> removed = new java.util.ArrayList<>(origAssignees);
      added.removeAll(origAssignees);
      removed.removeAll(updatedAssignees);

      if (!added.isEmpty() || !removed.isEmpty()) {
        for (EntityReference assignee : added) {
          addRelationship(
              assignee.getId(),
              updated.getId(),
              assignee.getType(),
              Entity.TASK,
              Relationship.ASSIGNED_TO);
        }
        for (EntityReference assignee : removed) {
          deleteRelationship(
              assignee.getId(),
              assignee.getType(),
              updated.getId(),
              Entity.TASK,
              Relationship.ASSIGNED_TO);
        }
        recordChange(FIELD_ASSIGNEES, origAssignees, updatedAssignees);
      }
    }

    private void updateTaskReviewers() {
      List<EntityReference> origReviewers = listOrEmpty(original.getReviewers());
      List<EntityReference> updatedReviewers = listOrEmpty(updated.getReviewers());

      origReviewers.sort(EntityUtil.compareEntityReference);
      updatedReviewers.sort(EntityUtil.compareEntityReference);

      List<EntityReference> added = new java.util.ArrayList<>(updatedReviewers);
      List<EntityReference> removed = new java.util.ArrayList<>(origReviewers);
      added.removeAll(origReviewers);
      removed.removeAll(updatedReviewers);

      if (!added.isEmpty() || !removed.isEmpty()) {
        for (EntityReference reviewer : added) {
          addRelationship(
              reviewer.getId(),
              updated.getId(),
              reviewer.getType(),
              Entity.TASK,
              Relationship.REVIEWS);
        }
        for (EntityReference reviewer : removed) {
          deleteRelationship(
              reviewer.getId(),
              reviewer.getType(),
              updated.getId(),
              Entity.TASK,
              Relationship.REVIEWS);
        }
        recordChange(FIELD_REVIEWERS, origReviewers, updatedReviewers);
      }
    }

    private void updateStatus() {
      if (recordChange("status", original.getStatus(), updated.getStatus())) {
        if (updated.getStatus() != TaskEntityStatus.Open
            && updated.getStatus() != TaskEntityStatus.InProgress
            && updated.getStatus() != TaskEntityStatus.Pending) {
          updated.setResolution(
              updated.getResolution() != null
                  ? updated.getResolution()
                  : new TaskResolution()
                      .withType(TaskResolutionType.Completed)
                      .withResolvedAt(System.currentTimeMillis()));
        }
      }
    }

    private void updatePriority() {
      recordChange("priority", original.getPriority(), updated.getPriority());
    }

    private void updateResolution() {
      recordChange(FIELD_RESOLUTION, original.getResolution(), updated.getResolution());
    }
  }
}
