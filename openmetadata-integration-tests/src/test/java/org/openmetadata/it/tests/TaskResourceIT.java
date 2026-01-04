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

package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.schema.api.tasks.CreateTask;
import org.openmetadata.schema.api.tasks.ResolveTask;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityHistory;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.sdk.models.ListParams;
import org.openmetadata.sdk.models.ListResponse;

/**
 * Integration tests for Task entity operations.
 *
 * <p>Tests the new Task entity API for data governance workflows including
 * task creation, assignment, resolution, and querying.
 *
 * <p>Tasks support:
 * - Multiple categories (Approval, DataAccess, MetadataUpdate, etc.)
 * - Multiple types (GlossaryApproval, DataAccessRequest, etc.)
 * - Assignment to users and teams
 * - Status workflow (Open -> InProgress -> Resolved)
 * - Domain scoping for visibility
 */
@Execution(ExecutionMode.CONCURRENT)
public class TaskResourceIT extends BaseEntityIT<Task, CreateTask> {

  {
    supportsFollowers = false;
    supportsOwners = false;
    supportsTags = true;
    supportsDomains = false;
    supportsDataProducts = false;
    // Search index is configured but test infrastructure may not create it during test setup
    // TODO: Enable once search index integration is verified in test environment
    supportsSearchIndex = false;
    supportsImportExport = false;
    supportsSoftDelete = false;
  }

  /**
   * Override: Tasks allow duplicate names because FQN is based on auto-generated taskId.
   * Two tasks with the same name get different taskIds, so no conflict occurs.
   */
  @Override
  @Test
  public void post_duplicateEntity_409(TestNamespace ns) {
    // Tasks allow duplicate names - each task gets a unique auto-generated taskId
    // which is used for FQN, so no conflict occurs
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("duplicate_name_task"))
            .withDescription("First task with this name")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task1 = createEntity(request);
    assertNotNull(task1);

    // Creating another task with the same name should succeed
    Task task2 = createEntity(request);
    assertNotNull(task2);

    // They should have different taskIds
    assertTrue(!task1.getTaskId().equals(task2.getTaskId()), "TaskIds must be unique");
    assertTrue(!task1.getId().equals(task2.getId()), "Entity IDs must be unique");
  }

  /**
   * Override: Tasks allow duplicate names because FQN is based on auto-generated taskId.
   */
  @Override
  @Test
  public void post_entityAlreadyExists_409_conflict(TestNamespace ns) {
    // Tasks allow duplicate names - each task gets a unique auto-generated taskId
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("conflict_name_task"))
            .withDescription("First task")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task1 = createEntity(request);
    assertNotNull(task1);

    // Creating another task with the same name should succeed (no conflict)
    Task task2 = createEntity(request);
    assertNotNull(task2);

    // Both tasks exist with unique taskIds
    assertTrue(!task1.getTaskId().equals(task2.getTaskId()));
  }

  /**
   * Override: Task FQN is based on taskId (TASK-XXXXX format) which never contains dots.
   * The FQN quoting behavior for dots doesn't apply to Task entity.
   */
  @Override
  @Test
  public void post_entityWithDots_200(TestNamespace ns) {
    // Task FQN is based on auto-generated taskId (e.g., TASK-00001) which never has dots.
    // This test verifies that a task with dots in the name still works correctly.
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("task.with.dots"))
            .withDescription("Task with dots in name")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertNotNull(task);

    // The taskId (and thus FQN) should be TASK-XXXXX format without dots
    assertTrue(task.getTaskId().startsWith("TASK-"), "TaskId must start with TASK-");
    assertTrue(!task.getTaskId().contains("."), "TaskId should not contain dots");
  }

  @Override
  protected CreateTask createMinimalRequest(TestNamespace ns) {
    return new CreateTask()
        .withName(ns.prefix("task"))
        .withDescription("Test task created by integration test")
        .withCategory(TaskCategory.MetadataUpdate)
        .withType(TaskEntityType.DescriptionUpdate);
  }

  @Override
  protected CreateTask createRequest(String name, TestNamespace ns) {
    return new CreateTask()
        .withName(name)
        .withDescription("Test task")
        .withCategory(TaskCategory.MetadataUpdate)
        .withType(TaskEntityType.DescriptionUpdate);
  }

  @Override
  protected Task createEntity(CreateTask createRequest) {
    return SdkClients.adminClient().tasks().create(createRequest);
  }

  @Override
  protected Task getEntity(String id) {
    return SdkClients.adminClient().tasks().get(id);
  }

  @Override
  protected Task getEntityByName(String fqn) {
    return SdkClients.adminClient().tasks().getByName(fqn);
  }

  @Override
  protected Task patchEntity(String id, Task entity) {
    return SdkClients.adminClient().tasks().update(id, entity);
  }

  @Override
  protected void deleteEntity(String id) {
    SdkClients.adminClient().tasks().delete(id);
  }

  @Override
  protected void restoreEntity(String id) {
    SdkClients.adminClient().tasks().restore(id);
  }

  @Override
  protected void hardDeleteEntity(String id) {
    java.util.Map<String, String> params = new java.util.HashMap<>();
    params.put("hardDelete", "true");
    SdkClients.adminClient().tasks().delete(id, params);
  }

  @Override
  protected String getEntityType() {
    return "task";
  }

  @Override
  protected void validateCreatedEntity(Task entity, CreateTask createRequest) {
    assertEquals(createRequest.getName(), entity.getName());
    assertEquals(createRequest.getCategory(), entity.getCategory());
    assertEquals(createRequest.getType(), entity.getType());
    assertEquals(TaskEntityStatus.Open, entity.getStatus());

    if (createRequest.getDescription() != null) {
      assertEquals(createRequest.getDescription(), entity.getDescription());
    }

    assertNotNull(entity.getTaskId(), "Task must have a human-readable taskId");
    assertTrue(entity.getTaskId().startsWith("TASK-"), "TaskId must start with TASK-");
  }

  @Override
  protected ListResponse<Task> listEntities(ListParams params) {
    return SdkClients.adminClient().tasks().list(params);
  }

  @Override
  protected Task getEntityWithFields(String id, String fields) {
    return SdkClients.adminClient().tasks().get(id, fields);
  }

  @Override
  protected Task getEntityByNameWithFields(String fqn, String fields) {
    return SdkClients.adminClient().tasks().getByName(fqn, fields);
  }

  @Override
  protected Task getEntityIncludeDeleted(String id) {
    return SdkClients.adminClient().tasks().get(id, "assignees,about", "deleted");
  }

  @Override
  protected EntityHistory getVersionHistory(UUID id) {
    return SdkClients.adminClient().tasks().getVersionList(id);
  }

  @Override
  protected Task getVersion(UUID id, Double version) {
    return SdkClients.adminClient().tasks().getVersion(id.toString(), version);
  }

  @Test
  void post_taskWithCategory_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("category_task"))
            .withDescription("Task with category")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = createEntity(request);
    assertNotNull(task);
    assertEquals(TaskCategory.Approval, task.getCategory());
    assertEquals(TaskEntityType.GlossaryApproval, task.getType());
  }

  @Test
  void post_taskWithPriority_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("priority_task"))
            .withDescription("High priority task")
            .withCategory(TaskCategory.Incident)
            .withType(TaskEntityType.IncidentResolution)
            .withPriority(TaskPriority.Critical);

    Task task = createEntity(request);
    assertNotNull(task);
    assertEquals(TaskPriority.Critical, task.getPriority());
  }

  @Test
  void post_taskWithAssignees_200_OK(TestNamespace ns) {
    String assigneeFqn = testUser1().getFullyQualifiedName();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("assigned_task"))
            .withDescription("Task with assignee")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withAssignees(List.of(assigneeFqn));

    Task task = createEntity(request);
    assertNotNull(task);
  }

  @Test
  void put_resolveTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("resolve_task"))
            .withDescription("Task to be resolved")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved after review");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(resolvedTask);
    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());
  }

  @Test
  void put_rejectTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("reject_task"))
            .withDescription("Task to be rejected")
            .withCategory(TaskCategory.DataAccess)
            .withType(TaskEntityType.DataAccessRequest);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Rejected)
            .withComment("Rejected - insufficient justification");

    Task rejectedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(rejectedTask);
    assertEquals(TaskEntityStatus.Rejected, rejectedTask.getStatus());
  }

  @Test
  void get_taskByTaskId_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("find_by_taskid"))
            .withDescription("Task findable by taskId")
            .withCategory(TaskCategory.Review)
            .withType(TaskEntityType.DataQualityReview);

    Task task = createEntity(request);
    assertNotNull(task.getTaskId());

    Task found = getEntityByName(task.getTaskId());
    assertNotNull(found);
    assertEquals(task.getId(), found.getId());
  }

  @Test
  void get_listTasksByStatus_200_OK(TestNamespace ns) {
    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("list_status_1"))
            .withDescription("Open task")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("list_status_2"))
            .withDescription("Another open task")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    createEntity(request1);
    createEntity(request2);

    ListResponse<Task> openTasks =
        SdkClients.adminClient().tasks().listByStatus(TaskEntityStatus.Open);

    assertNotNull(openTasks);
    assertNotNull(openTasks.getData());
    assertTrue(openTasks.getData().size() >= 2);
  }

  @Test
  void put_updateTaskDescription_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("update_desc_task"))
            .withDescription("Initial description")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.TagUpdate);

    Task task = createEntity(request);
    assertEquals("Initial description", task.getDescription());

    task.setDescription("Updated description with more details");
    Task updated = patchEntity(task.getId().toString(), task);
    assertEquals("Updated description with more details", updated.getDescription());
  }

  @Test
  void put_updateTaskPriority_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("update_priority_task"))
            .withDescription("Task with changeable priority")
            .withCategory(TaskCategory.Incident)
            .withType(TaskEntityType.IncidentResolution)
            .withPriority(TaskPriority.Low);

    Task task = createEntity(request);
    assertEquals(TaskPriority.Low, task.getPriority());

    task.setPriority(TaskPriority.High);
    Task updated = patchEntity(task.getId().toString(), task);
    assertEquals(TaskPriority.High, updated.getPriority());
  }

  @Test
  void test_taskIdSequence_unique(TestNamespace ns) {
    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("seq_task_1"))
            .withDescription("First task")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("seq_task_2"))
            .withDescription("Second task")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task1 = createEntity(request1);
    Task task2 = createEntity(request2);

    assertNotNull(task1.getTaskId());
    assertNotNull(task2.getTaskId());
    assertTrue(!task1.getTaskId().equals(task2.getTaskId()), "Task IDs must be unique");
  }

  @Test
  void test_allTaskCategories(TestNamespace ns) {
    for (TaskCategory category : TaskCategory.values()) {
      TaskEntityType type = getDefaultTypeForCategory(category);
      CreateTask request =
          new CreateTask()
              .withName(ns.prefix("cat_" + category.name().toLowerCase()))
              .withDescription("Task with category " + category.name())
              .withCategory(category)
              .withType(type);

      Task task = createEntity(request);
      assertNotNull(task);
      assertEquals(category, task.getCategory());
    }
  }

  @Test
  void test_allTaskTypes(TestNamespace ns) {
    for (TaskEntityType type : TaskEntityType.values()) {
      TaskCategory category = getCategoryForType(type);
      CreateTask request =
          new CreateTask()
              .withName(ns.prefix("type_" + type.name().toLowerCase()))
              .withDescription("Task with type " + type.name())
              .withCategory(category)
              .withType(type);

      Task task = createEntity(request);
      assertNotNull(task);
      assertEquals(type, task.getType());
    }
  }

  @Test
  void test_allPriorities(TestNamespace ns) {
    for (TaskPriority priority : TaskPriority.values()) {
      CreateTask request =
          new CreateTask()
              .withName(ns.prefix("priority_" + priority.name().toLowerCase()))
              .withDescription("Task with priority " + priority.name())
              .withCategory(TaskCategory.Custom)
              .withType(TaskEntityType.CustomTask)
              .withPriority(priority);

      Task task = createEntity(request);
      assertNotNull(task);
      assertEquals(priority, task.getPriority());
    }
  }

  @Test
  void test_allResolutionTypes(TestNamespace ns) {
    for (TaskResolutionType resType : TaskResolutionType.values()) {
      CreateTask request =
          new CreateTask()
              .withName(ns.prefix("res_" + resType.name().toLowerCase()))
              .withDescription("Task to be resolved as " + resType.name())
              .withCategory(TaskCategory.Custom)
              .withType(TaskEntityType.CustomTask);

      Task task = createEntity(request);

      ResolveTask resolveRequest =
          new ResolveTask()
              .withResolutionType(resType)
              .withComment("Resolved as " + resType.name());

      Task resolvedTask =
          SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

      assertNotNull(resolvedTask);
      assertNotNull(resolvedTask.getResolution());
      assertEquals(resType, resolvedTask.getResolution().getType());
    }
  }

  @Test
  void post_taskWithMultipleAssignees_200_OK(TestNamespace ns) {
    String assignee1 = testUser1().getFullyQualifiedName();
    String assignee2 = testUser2().getFullyQualifiedName();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("multi_assignee_task"))
            .withDescription("Task with multiple assignees")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(assignee1, assignee2));

    Task task = createEntity(request);
    assertNotNull(task);
  }

  @Test
  void post_taskWithReviewers_200_OK(TestNamespace ns) {
    String reviewer = testUser1().getFullyQualifiedName();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("reviewer_task"))
            .withDescription("Task with reviewer")
            .withCategory(TaskCategory.Review)
            .withType(TaskEntityType.DataQualityReview)
            .withReviewers(List.of(reviewer));

    Task task = createEntity(request);
    assertNotNull(task);
  }

  @Test
  void post_taskWithDueDate_200_OK(TestNamespace ns) {
    long dueDate = System.currentTimeMillis() + 86400000L;

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("due_date_task"))
            .withDescription("Task with due date")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withDueDate(dueDate);

    Task task = createEntity(request);
    assertNotNull(task);
    assertEquals(dueDate, task.getDueDate());
  }

  @Test
  void put_completeTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("complete_task"))
            .withDescription("Task to be completed")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Completed)
            .withComment("Task completed")
            .withNewValue("New description value");

    Task completedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(completedTask);
    assertEquals(TaskEntityStatus.Completed, completedTask.getStatus());
    assertEquals("New description value", completedTask.getResolution().getNewValue());
  }

  @Test
  void put_cancelTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("cancel_task"))
            .withDescription("Task to be cancelled")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Cancelled)
            .withComment("Task cancelled - no longer needed");

    Task cancelledTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(cancelledTask);
    assertEquals(TaskEntityStatus.Cancelled, cancelledTask.getStatus());
  }

  @Test
  void put_autoApproveTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("auto_approve_task"))
            .withDescription("Task to be auto approved")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = createEntity(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.AutoApproved)
            .withComment("Auto approved by policy");

    Task autoApprovedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(autoApprovedTask);
    assertEquals(TaskEntityStatus.Approved, autoApprovedTask.getStatus());
    assertEquals(TaskResolutionType.AutoApproved, autoApprovedTask.getResolution().getType());
  }

  @Test
  void put_autoRejectTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("auto_reject_task"))
            .withDescription("Task to be auto rejected")
            .withCategory(TaskCategory.DataAccess)
            .withType(TaskEntityType.DataAccessRequest);

    Task task = createEntity(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.AutoRejected)
            .withComment("Auto rejected by policy");

    Task autoRejectedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(autoRejectedTask);
    assertEquals(TaskEntityStatus.Rejected, autoRejectedTask.getStatus());
    assertEquals(TaskResolutionType.AutoRejected, autoRejectedTask.getResolution().getType());
  }

  @Test
  void put_timeoutTask_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("timeout_task"))
            .withDescription("Task that will timeout")
            .withCategory(TaskCategory.Review)
            .withType(TaskEntityType.PipelineReview);

    Task task = createEntity(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.TimedOut)
            .withComment("Task timed out - no response");

    Task timedOutTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertNotNull(timedOutTask);
    assertEquals(TaskEntityStatus.Failed, timedOutTask.getStatus());
    assertEquals(TaskResolutionType.TimedOut, timedOutTask.getResolution().getType());
  }

  @Test
  void put_updateTaskStatus_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("update_status_task"))
            .withDescription("Task with status change")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    task.setStatus(TaskEntityStatus.InProgress);
    Task updated = patchEntity(task.getId().toString(), task);
    assertEquals(TaskEntityStatus.InProgress, updated.getStatus());
  }

  @Test
  void get_taskVersionHistory_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("version_history_task"))
            .withDescription("Initial version")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);

    task.setDescription("Version 2");
    patchEntity(task.getId().toString(), task);

    EntityHistory history = getVersionHistory(task.getId());
    assertNotNull(history);
    assertTrue(history.getVersions().size() >= 2);
  }

  @Test
  void get_specificTaskVersion_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("specific_version_task"))
            .withDescription("Version 1")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);

    Task version = getVersion(task.getId(), task.getVersion());
    assertNotNull(version);
    assertEquals(task.getVersion(), version.getVersion());
  }

  @Test
  void test_taskIdFormat_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("id_format_task"))
            .withDescription("Test task ID format")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertNotNull(task.getTaskId());
    assertTrue(task.getTaskId().matches("^TASK-[0-9]+$"), "TaskId must match TASK-NNNNN format");
  }

  @Test
  void test_defaultPriorityIsMedium(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("default_priority_task"))
            .withDescription("Task without explicit priority")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertEquals(TaskPriority.Medium, task.getPriority());
  }

  @Test
  void test_defaultStatusIsOpen(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("default_status_task"))
            .withDescription("Task without explicit status")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());
  }

  @Test
  void get_taskWithFields_200_OK(TestNamespace ns) {
    String assigneeFqn = testUser1().getFullyQualifiedName();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("fields_task"))
            .withDescription("Task to test fields parameter")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withAssignees(List.of(assigneeFqn));

    Task task = createEntity(request);

    Task withAssignees = getEntityWithFields(task.getId().toString(), "assignees");
    assertNotNull(withAssignees);
  }

  @Test
  void put_updateTaskDisplayName_200_OK(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("display_name_task"))
            .withDisplayName("Original Display Name")
            .withDescription("Task with display name")
            .withCategory(TaskCategory.Custom)
            .withType(TaskEntityType.CustomTask);

    Task task = createEntity(request);
    assertEquals("Original Display Name", task.getDisplayName());

    task.setDisplayName("Updated Display Name");
    Task updated = patchEntity(task.getId().toString(), task);
    assertEquals("Updated Display Name", updated.getDisplayName());
  }

  private TaskEntityType getDefaultTypeForCategory(TaskCategory category) {
    return switch (category) {
      case Approval -> TaskEntityType.GlossaryApproval;
      case DataAccess -> TaskEntityType.DataAccessRequest;
      case MetadataUpdate -> TaskEntityType.DescriptionUpdate;
      case Incident -> TaskEntityType.IncidentResolution;
      case Review -> TaskEntityType.DataQualityReview;
      case Custom -> TaskEntityType.CustomTask;
    };
  }

  private TaskCategory getCategoryForType(TaskEntityType type) {
    return switch (type) {
      case GlossaryApproval -> TaskCategory.Approval;
      case DataAccessRequest -> TaskCategory.DataAccess;
      case DescriptionUpdate,
          TagUpdate,
          OwnershipUpdate,
          TierUpdate,
          DomainUpdate,
          Suggestion -> TaskCategory.MetadataUpdate;
      case IncidentResolution, TestCaseResolution -> TaskCategory.Incident;
      case PipelineReview, DataQualityReview -> TaskCategory.Review;
      case CustomTask -> TaskCategory.Custom;
    };
  }
}
