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

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.bootstrap.SharedEntities;
import org.openmetadata.it.factories.DatabaseSchemaTestFactory;
import org.openmetadata.it.factories.DatabaseServiceTestFactory;
import org.openmetadata.it.factories.TableTestFactory;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.schema.api.tasks.CreateTask;
import org.openmetadata.schema.api.tasks.ResolveTask;
import org.openmetadata.schema.api.tasks.TaskCount;
import org.openmetadata.schema.entity.data.DatabaseSchema;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityHistory;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.type.TaskResolutionType;
import org.openmetadata.sdk.exceptions.ForbiddenException;
import org.openmetadata.sdk.models.ListParams;
import org.openmetadata.sdk.models.ListResponse;

/**
 * Integration tests for Task entity operations.
 *
 * <p>Tests the new Task entity system that provides first-class task management for governance
 * workflows including approvals, metadata updates, and suggestions.
 */
@Execution(ExecutionMode.CONCURRENT)
public class TaskResourceIT extends BaseEntityIT<Task, CreateTask> {

  public TaskResourceIT() {
    supportsFollowers = false;
    supportsTags = true;
    supportsDomains = true;
    supportsDataProducts = false;
    supportsSoftDelete = true;
    supportsPatch = true;
    supportsOwners = false;
    supportsSearchIndex = true;
  }

  @Override
  protected CreateTask createMinimalRequest(TestNamespace ns) {
    return new CreateTask()
        .withName(ns.prefix("task"))
        .withDescription("Test task created by integration test")
        .withCategory(TaskCategory.Approval)
        .withType(TaskEntityType.GlossaryApproval);
  }

  @Override
  protected CreateTask createRequest(String name, TestNamespace ns) {
    return new CreateTask()
        .withName(name)
        .withDescription("Test task")
        .withCategory(TaskCategory.Approval)
        .withType(TaskEntityType.GlossaryApproval);
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
    SdkClients.adminClient()
        .tasks()
        .delete(id, java.util.Map.of("hardDelete", "true", "recursive", "true"));
  }

  @Override
  protected String getEntityType() {
    return "task";
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
    return SdkClients.adminClient().tasks().get(id, null, "deleted");
  }

  @Override
  protected EntityHistory getVersionHistory(UUID id) {
    return SdkClients.adminClient().tasks().getVersionList(id);
  }

  @Override
  protected Task getVersion(UUID id, Double version) {
    return SdkClients.adminClient().tasks().getVersion(id.toString(), version);
  }

  @Override
  protected void validateCreatedEntity(Task created, CreateTask request) {
    assertEquals(request.getName(), created.getName());
    assertEquals(request.getDescription(), created.getDescription());
    assertEquals(request.getCategory(), created.getCategory());
    assertEquals(request.getType(), created.getType());
    assertEquals(TaskEntityStatus.Open, created.getStatus());
    assertNotNull(created.getTaskId());
    assertTrue(created.getTaskId().startsWith("TASK-"));
  }

  // ==================== Task-Specific Tests ====================

  @Test
  void testCreateTaskWithPriority(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("priority-task"))
            .withDescription("High priority task")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withPriority(TaskPriority.High);

    Task task = createEntity(request);

    assertNotNull(task);
    assertEquals(TaskPriority.High, task.getPriority());
  }

  @Test
  void testCreateMetadataUpdateTask(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("metadata-task"))
            .withDescription("Metadata update task")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate);

    Task task = createEntity(request);

    assertEquals(TaskCategory.MetadataUpdate, task.getCategory());
    assertEquals(TaskEntityType.DescriptionUpdate, task.getType());
  }

  @Test
  void testResolveTaskWithApproval(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("resolve-approve-task"))
            .withDescription("Task to be approved")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = createEntity(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved by integration test");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());
    assertNotNull(resolvedTask.getResolution());
    assertEquals(TaskResolutionType.Approved, resolvedTask.getResolution().getType());
  }

  @Test
  void testResolveTaskWithRejection(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("resolve-reject-task"))
            .withDescription("Task to be rejected")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = createEntity(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Rejected)
            .withComment("Rejected by integration test");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Rejected, resolvedTask.getStatus());
    assertEquals(TaskResolutionType.Rejected, resolvedTask.getResolution().getType());
  }

  @Test
  void testListTasksByStatus(TestNamespace ns) {
    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("status-task-1"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("status-task-2"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    createEntity(request1);
    createEntity(request2);

    ListResponse<Task> openTasks =
        SdkClients.adminClient().tasks().listByStatus(TaskEntityStatus.Open);

    assertNotNull(openTasks);
    assertFalse(openTasks.getData().isEmpty());
    for (Task task : openTasks.getData()) {
      assertEquals(TaskEntityStatus.Open, task.getStatus());
    }
  }

  @Test
  void testTaskIdAutoGeneration(TestNamespace ns) {
    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("autogen-task-1"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("autogen-task-2"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task1 = createEntity(request1);
    Task task2 = createEntity(request2);

    assertNotEquals(task1.getTaskId(), task2.getTaskId());
    assertTrue(task1.getTaskId().matches("TASK-\\d{5}"));
    assertTrue(task2.getTaskId().matches("TASK-\\d{5}"));
  }

  @Test
  void testGetTaskByTaskId(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("get-by-taskid"))
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.OwnershipUpdate);

    Task createdTask = createEntity(request);
    Task fetchedTask = getEntityByName(createdTask.getTaskId());

    assertEquals(createdTask.getId(), fetchedTask.getId());
    assertEquals(createdTask.getTaskId(), fetchedTask.getTaskId());
  }

  // ==================== Permission Tests ====================

  @Test
  void testAssigneeCanResolveTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("assignee-resolve"))
            .withDescription("Task assigned to user1")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.adminClient().tasks().create(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved by assignee");

    Task resolvedTask =
        SdkClients.user1Client().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());
  }

  @Test
  void testTeamMemberCanResolveTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("team-resolve"))
            .withDescription("Task assigned to team")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.TEAM1.getFullyQualifiedName()));

    Task task = SdkClients.adminClient().tasks().create(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved by team member");

    Task resolvedTask =
        SdkClients.user1Client().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());
  }

  @Test
  void testCreatorCanCloseTask(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("creator-close"))
            .withDescription("Task to be closed by creator")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = SdkClients.user1Client().tasks().create(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    Task closedTask = SdkClients.user1Client().tasks().close(task.getId().toString());

    assertEquals(TaskEntityStatus.Cancelled, closedTask.getStatus());
  }

  @Test
  void testNonAssigneeCannotResolveTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("non-assignee-resolve"))
            .withDescription("Task assigned to user1 only")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.adminClient().tasks().create(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Attempting to approve without permission");

    assertThrows(
        ForbiddenException.class,
        () -> SdkClients.user2Client().tasks().resolve(task.getId().toString(), resolveRequest));
  }

  @Test
  void testNonAssigneeCannotCloseTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("non-assignee-close"))
            .withDescription("Task assigned to user1, created by admin")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.adminClient().tasks().create(request);

    assertThrows(
        ForbiddenException.class,
        () -> SdkClients.user2Client().tasks().close(task.getId().toString()));
  }

  @Test
  void testAssignedEndpointReturnsUserTasks(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("assigned-test-1"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("assigned-test-2"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER2.getFullyQualifiedName()));

    Task task1 = SdkClients.adminClient().tasks().create(request1);
    SdkClients.adminClient().tasks().create(request2);

    ListResponse<Task> user1Tasks = SdkClients.user1Client().tasks().listAssigned();

    assertNotNull(user1Tasks);
    assertTrue(
        user1Tasks.getData().stream().anyMatch(t -> t.getId().equals(task1.getId())),
        "User1's assigned tasks should include task1");
  }

  @Test
  void testCreatedEndpointReturnsUserTasks(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("created-test"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task createdTask = SdkClients.user1Client().tasks().create(request);

    ListResponse<Task> user1CreatedTasks = SdkClients.user1Client().tasks().listCreated();

    assertNotNull(user1CreatedTasks);
    assertTrue(
        user1CreatedTasks.getData().stream().anyMatch(t -> t.getId().equals(createdTask.getId())),
        "User1's created tasks should include the task they created");
  }

  @Test
  void testCloseEndpointWithComment(TestNamespace ns) {
    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("close-with-comment"))
            .withDescription("Task to close with comment")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    Task task = SdkClients.adminClient().tasks().create(request);

    Task closedTask =
        SdkClients.adminClient().tasks().close(task.getId().toString(), "Closing this task");

    assertEquals(TaskEntityStatus.Cancelled, closedTask.getStatus());
  }

  @Test
  void testDefaultAssigneeFromEntityOwners(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("default-assignee"))
            .withDescription("Task with about entity that has owners")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withAbout(shared.GLOSSARY1.getFullyQualifiedName())
            .withAboutType("glossary");

    Task task = SdkClients.adminClient().tasks().create(request);

    assertNotNull(task.getAssignees(), "Task should have assignees from entity owners");
    assertFalse(task.getAssignees().isEmpty(), "Assignees should not be empty");
  }

  @Test
  void testAssigneeCanCloseTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("assignee-close"))
            .withDescription("Task that assignee can close")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.adminClient().tasks().create(request);

    Task closedTask = SdkClients.user1Client().tasks().close(task.getId().toString());

    assertEquals(TaskEntityStatus.Cancelled, closedTask.getStatus());
  }

  @Test
  void testAdminCanResolveAnyTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("admin-resolve"))
            .withDescription("Task assigned to user1, admin should resolve")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.user1Client().tasks().create(request);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Admin approving task");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());
  }

  @Test
  void testAdminCanCloseAnyTask(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("admin-close"))
            .withDescription("Task assigned to user1, admin should close")
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER1.getFullyQualifiedName()));

    Task task = SdkClients.user1Client().tasks().create(request);

    Task closedTask = SdkClients.adminClient().tasks().close(task.getId().toString());

    assertEquals(TaskEntityStatus.Cancelled, closedTask.getStatus());
  }

  // ==================== Count API Tests ====================

  @Test
  void testGetCountReturnsCorrectTotals(TestNamespace ns) {
    TaskCount initialCount = SdkClients.adminClient().tasks().getCount();
    int initialTotal = initialCount.getTotal();
    int initialOpen = initialCount.getOpen();

    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("count-test-1"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("count-test-2"))
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate);

    createEntity(request1);
    createEntity(request2);

    TaskCount afterCount = SdkClients.adminClient().tasks().getCount();

    assertEquals(initialTotal + 2, afterCount.getTotal(), "Total count should increase by 2");
    assertEquals(initialOpen + 2, afterCount.getOpen(), "Open count should increase by 2");
  }

  @Test
  void testGetCountByAboutEntity(TestNamespace ns) {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);
    Table table = TableTestFactory.createSimple(ns, schema.getFullyQualifiedName());

    TaskCount initialCount =
        SdkClients.adminClient().tasks().getCountByAboutEntity(table.getFullyQualifiedName());
    assertEquals(0, initialCount.getTotal(), "Initially there should be no tasks about the table");

    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("about-entity-task-1"))
            .withDescription("Task about table")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table");

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("about-entity-task-2"))
            .withDescription("Another task about table")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.OwnershipUpdate)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table");

    Task task1 = createEntity(request1);
    Task task2 = createEntity(request2);

    assertNotNull(task1.getAbout(), "Task should have about reference set");
    assertEquals(
        table.getFullyQualifiedName(),
        task1.getAbout().getFullyQualifiedName(),
        "About FQN should match table FQN");

    TaskCount countByAbout =
        SdkClients.adminClient().tasks().getCountByAboutEntity(table.getFullyQualifiedName());

    assertEquals(2, countByAbout.getTotal(), "Should have 2 tasks about the table");
    assertEquals(2, countByAbout.getOpen(), "Both tasks should be open");
    assertEquals(0, countByAbout.getCompleted(), "No tasks should be completed yet");
  }

  @Test
  void testGetCountByAboutEntityWithResolvedTasks(TestNamespace ns) {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);
    Table table = TableTestFactory.createSimple(ns, schema.getFullyQualifiedName());

    CreateTask request1 =
        new CreateTask()
            .withName(ns.prefix("resolved-count-1"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table");

    CreateTask request2 =
        new CreateTask()
            .withName(ns.prefix("resolved-count-2"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table");

    Task task1 = createEntity(request1);
    Task task2 = createEntity(request2);

    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved for count test");

    SdkClients.adminClient().tasks().resolve(task1.getId().toString(), resolveRequest);

    TaskCount countByAbout =
        SdkClients.adminClient().tasks().getCountByAboutEntity(table.getFullyQualifiedName());

    assertEquals(2, countByAbout.getTotal(), "Should have 2 tasks about the table");
    assertEquals(1, countByAbout.getOpen(), "One task should still be open");
  }

  @Test
  void testTaskAboutFqnHashIsStoredCorrectly(TestNamespace ns) {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);
    Table table = TableTestFactory.createSimple(ns, schema.getFullyQualifiedName());

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("fqn-hash-test"))
            .withDescription("Test aboutFqnHash storage")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.DescriptionUpdate)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table");

    Task created = createEntity(request);

    assertNotNull(created.getAbout(), "Created task should have about reference");
    assertEquals(
        table.getFullyQualifiedName(),
        created.getAbout().getFullyQualifiedName(),
        "About FQN should match");

    Task fetched = SdkClients.adminClient().tasks().get(created.getId().toString(), "about");
    assertNotNull(fetched.getAbout(), "Fetched task should have about reference");
    assertEquals(
        table.getFullyQualifiedName(),
        fetched.getAbout().getFullyQualifiedName(),
        "Fetched about FQN should match");

    ListParams params = new ListParams();
    params.addFilter("aboutEntity", table.getFullyQualifiedName());
    ListResponse<Task> filtered = SdkClients.adminClient().tasks().list(params);

    assertNotNull(filtered.getData(), "Filter results should not be null");
    assertTrue(
        filtered.getData().stream().anyMatch(t -> t.getId().equals(created.getId())),
        "Filtered tasks should include the task about the table");
  }

  @Test
  void testGetCountByCreatedBy(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("createdby-count"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval);

    SdkClients.user1Client().tasks().create(request);

    TaskCount count =
        SdkClients.adminClient().tasks().getCount(null, shared.USER1.getFullyQualifiedName(), null);

    assertTrue(count.getTotal() >= 1, "Should have at least 1 task created by user1");
  }

  @Test
  void testGetCountByAssignee(TestNamespace ns) {
    SharedEntities shared = SharedEntities.get();

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("assignee-count"))
            .withCategory(TaskCategory.Approval)
            .withType(TaskEntityType.GlossaryApproval)
            .withAssignees(List.of(shared.USER2.getFullyQualifiedName()));

    SdkClients.adminClient().tasks().create(request);

    TaskCount count =
        SdkClients.adminClient().tasks().getCount(shared.USER2.getFullyQualifiedName(), null, null);

    assertTrue(count.getTotal() >= 1, "Should have at least 1 task assigned to user2");
  }

  // ==================== Entity Change Application Tests ====================

  @Test
  void testResolveTagUpdateTaskAppliesTags(TestNamespace ns) {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);
    Table table = TableTestFactory.createSimple(ns, schema.getFullyQualifiedName());

    // Verify table has no tags initially
    Table initialTable =
        SdkClients.adminClient().tables().getByName(table.getFullyQualifiedName(), "tags");
    assertTrue(
        initialTable.getTags() == null || initialTable.getTags().isEmpty(),
        "Table should have no tags initially");

    // Create a TagUpdate task with tags to add
    List<TagLabel> tagsToAdd =
        List.of(
            new TagLabel()
                .withTagFQN("PersonalData.Personal")
                .withSource(TagLabel.TagSource.CLASSIFICATION)
                .withName("Personal"));

    Map<String, Object> payload =
        Map.of("tagsToAdd", tagsToAdd, "operation", "Add", "currentTags", List.of());

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("tag-update-apply"))
            .withDescription("Add PersonalData.Personal tag to table")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.TagUpdate)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table")
            .withPayload(payload);

    Task task = SdkClients.adminClient().tasks().create(request);
    assertEquals(TaskEntityStatus.Open, task.getStatus());

    // Resolve the task with approval
    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Approved)
            .withComment("Approved - apply tags");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Approved, resolvedTask.getStatus());

    // Verify tags were applied to the table
    Table updatedTable =
        SdkClients.adminClient().tables().getByName(table.getFullyQualifiedName(), "tags");

    assertNotNull(updatedTable.getTags(), "Table should have tags after task resolution");
    assertTrue(
        updatedTable.getTags().stream()
            .anyMatch(tag -> "PersonalData.Personal".equals(tag.getTagFQN())),
        "Table should have PersonalData.Personal tag");
  }

  @Test
  void testRejectingTaskDoesNotApplyChanges(TestNamespace ns) {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);
    Table table = TableTestFactory.createSimple(ns, schema.getFullyQualifiedName());

    // Create a TagUpdate task
    List<TagLabel> tagsToAdd =
        List.of(
            new TagLabel()
                .withTagFQN("PersonalData.Personal")
                .withSource(TagLabel.TagSource.CLASSIFICATION)
                .withName("Personal"));

    Map<String, Object> payload =
        Map.of("tagsToAdd", tagsToAdd, "operation", "Add", "currentTags", List.of());

    CreateTask request =
        new CreateTask()
            .withName(ns.prefix("tag-update-reject"))
            .withDescription("Tag update to be rejected")
            .withCategory(TaskCategory.MetadataUpdate)
            .withType(TaskEntityType.TagUpdate)
            .withAbout(table.getFullyQualifiedName())
            .withAboutType("table")
            .withPayload(payload);

    Task task = SdkClients.adminClient().tasks().create(request);

    // Reject the task
    ResolveTask resolveRequest =
        new ResolveTask()
            .withResolutionType(TaskResolutionType.Rejected)
            .withComment("Rejected - do not apply");

    Task resolvedTask =
        SdkClients.adminClient().tasks().resolve(task.getId().toString(), resolveRequest);

    assertEquals(TaskEntityStatus.Rejected, resolvedTask.getStatus());

    // Verify tags were NOT applied
    Table updatedTable =
        SdkClients.adminClient().tables().getByName(table.getFullyQualifiedName(), "tags");

    assertTrue(
        updatedTable.getTags() == null || updatedTable.getTags().isEmpty(),
        "Table should have no tags after task rejection");
  }
}
