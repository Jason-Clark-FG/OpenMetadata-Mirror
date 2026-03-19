package org.openmetadata.service.governance.workflows.outbox;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.flowable.common.engine.api.FlowableObjectNotFoundException;
import org.flowable.common.engine.api.FlowableOptimisticLockingException;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.runtime.Execution;
import org.flowable.engine.runtime.ExecutionQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaskWorkflowOutboxDrainerTest {

  @Mock private RuntimeService runtimeService;
  @Mock private ExecutionQuery executionQuery;
  @Mock private Execution execution;

  private TaskWorkflowOutboxDrainer drainer;

  @BeforeEach
  void setUp() {
    drainer = new TaskWorkflowOutboxDrainer(runtimeService);
  }

  @Test
  void tryDeliver_succeeds_when_subscription_exists() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("InProgress")
            .updatedBy("user1")
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(execution);
    when(execution.getId()).thenReturn("exec-1");

    boolean result = drainer.tryDeliver(entry);

    assertTrue(result);
    verify(runtimeService).messageEventReceived(eq("task-uuid-1"), eq("exec-1"), any(Map.class));
  }

  @Test
  void tryDeliver_returns_false_when_no_subscription() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("InProgress")
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(null);

    boolean result = drainer.tryDeliver(entry);

    assertFalse(result);
    verify(runtimeService, never()).messageEventReceived(anyString(), anyString(), any(Map.class));
  }

  @Test
  void tryDeliver_returns_false_on_FlowableObjectNotFoundException() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("Completed")
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(execution);
    when(execution.getId()).thenReturn("exec-1");
    doThrow(new FlowableObjectNotFoundException("gone"))
        .when(runtimeService)
        .messageEventReceived(eq("task-uuid-1"), eq("exec-1"), any(Map.class));

    boolean result = drainer.tryDeliver(entry);

    assertFalse(result);
  }

  @Test
  void tryDeliver_returns_false_on_optimistic_locking() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("InProgress")
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(execution);
    when(execution.getId()).thenReturn("exec-1");
    doThrow(new FlowableOptimisticLockingException("conflict"))
        .when(runtimeService)
        .messageEventReceived(eq("task-uuid-1"), eq("exec-1"), any(Map.class));

    boolean result = drainer.tryDeliver(entry);

    assertFalse(result);
  }

  @Test
  void tryDeliver_passes_updatedBy_variable_when_present() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("InProgress")
            .updatedBy("admin")
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(execution);
    when(execution.getId()).thenReturn("exec-1");

    drainer.tryDeliver(entry);

    verify(runtimeService)
        .messageEventReceived(
            eq("task-uuid-1"),
            eq("exec-1"),
            ArgumentMatchers.argThat(
                map -> map.containsKey("status") && map.containsKey("updatedBy")));
  }

  @Test
  void tryDeliver_omits_updatedBy_variable_when_null() {
    OutboxEntry entry =
        OutboxEntry.builder()
            .id("entry-1")
            .taskId("task-uuid-1")
            .status("InProgress")
            .updatedBy(null)
            .createdAt(1000L)
            .build();

    when(runtimeService.createExecutionQuery()).thenReturn(executionQuery);
    when(executionQuery.messageEventSubscriptionName("task-uuid-1")).thenReturn(executionQuery);
    when(executionQuery.singleResult()).thenReturn(execution);
    when(execution.getId()).thenReturn("exec-1");

    drainer.tryDeliver(entry);

    verify(runtimeService)
        .messageEventReceived(
            eq("task-uuid-1"),
            eq("exec-1"),
            ArgumentMatchers.argThat(
                map -> map.containsKey("status") && !map.containsKey("updatedBy")));
  }
}
