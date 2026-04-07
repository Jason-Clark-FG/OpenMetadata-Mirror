package org.openmetadata.sdk.services.tasks;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.openmetadata.schema.api.tasks.CreateTask;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.OpenMetadataHttpClient;

class TaskServiceTest {

  @Mock private OpenMetadataHttpClient mockHttpClient;

  private TaskService taskService;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    taskService = new TaskService(mockHttpClient);
  }

  @Test
  void testCreateStoresSnapshotForImmediateUpdate() {
    String taskId = "550e8400-e29b-41d4-a716-446655440001";
    EntityReference originalAssignee =
        new EntityReference()
            .withId(UUID.fromString("550e8400-e29b-41d4-a716-446655440002"))
            .withType("user")
            .withName("shared_user1")
            .withFullyQualifiedName("shared_user1");
    EntityReference updatedAssignee =
        new EntityReference()
            .withId(UUID.fromString("550e8400-e29b-41d4-a716-446655440003"))
            .withType("user")
            .withName("shared_user2")
            .withFullyQualifiedName("shared_user2");

    Task created =
        new Task()
            .withId(UUID.fromString(taskId))
            .withName("task")
            .withAssignees(List.of(originalAssignee));

    Task updated =
        new Task().withId(UUID.fromString(taskId)).withAssignees(List.of(updatedAssignee));

    when(mockHttpClient.execute(
            eq(HttpMethod.POST), eq("/v1/tasks"), any(CreateTask.class), eq(Task.class)))
        .thenReturn(created);
    when(mockHttpClient.execute(
            eq(HttpMethod.PATCH),
            eq("/v1/tasks/" + taskId),
            any(JsonNode.class),
            eq(Task.class),
            isNull()))
        .thenReturn(updated);

    Task createdTask =
        taskService.create(
            new CreateTask()
                .withName("task")
                .withCategory(TaskCategory.MetadataUpdate)
                .withType(TaskEntityType.DescriptionUpdate));
    createdTask.setAssignees(List.of(updatedAssignee));

    Task result = taskService.update(taskId, createdTask);

    assertNotNull(result);
    ArgumentCaptor<JsonNode> patchCaptor = ArgumentCaptor.forClass(JsonNode.class);
    verify(mockHttpClient, never())
        .execute(eq(HttpMethod.GET), eq("/v1/tasks/" + taskId), isNull(), eq(Task.class));
    verify(mockHttpClient)
        .execute(
            eq(HttpMethod.PATCH),
            eq("/v1/tasks/" + taskId),
            patchCaptor.capture(),
            eq(Task.class),
            isNull());

    JsonNode patch = patchCaptor.getValue();
    assertTrue(
        patch.isArray()
            && patch.toString().contains("\"path\":\"/assignees\"")
            && patch.toString().contains("\"fullyQualifiedName\":\"shared_user2\""),
        "Reference list updates should replace the full assignees field");
  }
}
