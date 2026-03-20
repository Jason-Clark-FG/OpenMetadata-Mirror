package org.openmetadata.service.governance.workflows.outbox;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.flowable.common.engine.api.FlowableObjectNotFoundException;
import org.flowable.common.engine.api.FlowableOptimisticLockingException;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.runtime.Execution;
import org.openmetadata.service.Entity;
import org.openmetadata.service.governance.workflows.Workflow;
import org.openmetadata.service.jdbi3.CollectionDAO;

@Slf4j
public class TaskWorkflowOutboxDrainer {

  static final long POLL_INTERVAL_SECONDS = 30;
  private static final int WARN_AFTER_ATTEMPTS = 10;

  private final RuntimeService runtimeService;
  private final ScheduledExecutorService scheduler;

  public TaskWorkflowOutboxDrainer(RuntimeService runtimeService) {
    this.runtimeService = runtimeService;
    this.scheduler =
        Executors.newSingleThreadScheduledExecutor(
            r -> Thread.ofPlatform().name("OutboxDrainer").daemon(true).unstarted(r));
  }

  public void start() {
    scheduler.scheduleWithFixedDelay(
        this::drainAll, POLL_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS, TimeUnit.SECONDS);
    LOG.info("TaskWorkflowOutboxDrainer started (interval={}s)", POLL_INTERVAL_SECONDS);
  }

  public void shutdown() {
    scheduler.shutdown();
    try {
      if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
        scheduler.shutdownNow();
      }
    } catch (InterruptedException e) {
      scheduler.shutdownNow();
      Thread.currentThread().interrupt();
    }
    LOG.info("TaskWorkflowOutboxDrainer stopped");
  }

  void drainAll() {
    try {
      Entity.getJdbi()
          .useTransaction(
              handle -> {
                CollectionDAO.TaskWorkflowOutboxDAO dao =
                    handle.attach(CollectionDAO.TaskWorkflowOutboxDAO.class);

                List<OutboxEntry> entries = dao.findAndLockAllOldestPending();
                if (entries.isEmpty()) {
                  return;
                }

                LOG.debug("Outbox drainer locked {} messages for delivery", entries.size());

                for (OutboxEntry entry : entries) {
                  processEntry(dao, entry);
                }
              });
    } catch (Exception e) {
      LOG.error("Outbox drainer cycle failed", e);
    }
  }

  private void processEntry(CollectionDAO.TaskWorkflowOutboxDAO dao, OutboxEntry entry) {
    try {
      boolean success = tryDeliver(entry);
      long now = System.currentTimeMillis();

      if (success) {
        dao.markDelivered(entry.getId(), now);
      } else {
        int newAttempts = entry.getAttempts() + 1;
        dao.recordFailedAttempt(entry.getId(), newAttempts, now);

        if (newAttempts >= WARN_AFTER_ATTEMPTS) {
          LOG.warn(
              "Outbox message '{}' for task '{}' (status='{}') has failed {} delivery attempts",
              entry.getId(),
              entry.getTaskId(),
              entry.getStatus(),
              newAttempts);
        }
      }
    } catch (Exception e) {
      LOG.error("Failed to process outbox entry for task '{}'", entry.getTaskId(), e);
    }
  }

  boolean tryDeliver(OutboxEntry entry) {
    try {
      Execution execution =
          runtimeService
              .createExecutionQuery()
              .messageEventSubscriptionName(entry.getTaskId())
              .singleResult();

      if (execution == null) {
        LOG.debug(
            "No message subscription for task '{}', subprocess may be between cycles",
            entry.getTaskId());
        return false;
      }

      Map<String, Object> variables = new HashMap<>();
      variables.put("status", entry.getStatus());
      if (entry.getUpdatedBy() != null) {
        variables.put(Workflow.UPDATED_BY_VARIABLE, entry.getUpdatedBy());
      }

      runtimeService.messageEventReceived(entry.getTaskId(), execution.getId(), variables);

      LOG.debug(
          "Delivered outbox message to task '{}' (status='{}')",
          entry.getTaskId(),
          entry.getStatus());
      return true;
    } catch (FlowableObjectNotFoundException e) {
      LOG.debug(
          "Subscription for task '{}' gone (consumed or process ended): {}",
          entry.getTaskId(),
          e.getMessage());
      return false;
    } catch (FlowableOptimisticLockingException e) {
      LOG.debug(
          "Optimistic lock conflict delivering to task '{}', will retry: {}",
          entry.getTaskId(),
          e.getMessage());
      return false;
    } catch (Exception e) {
      LOG.error("Unexpected error delivering outbox message to task '{}'", entry.getTaskId(), e);
      return false;
    }
  }
}
