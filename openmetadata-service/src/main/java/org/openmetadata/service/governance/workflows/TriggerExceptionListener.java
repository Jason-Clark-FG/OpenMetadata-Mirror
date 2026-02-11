package org.openmetadata.service.governance.workflows;

import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.WorkflowInstanceRepository;

@Slf4j
public class TriggerExceptionListener implements JavaDelegate {
  @Override
  public void execute(DelegateExecution execution) {
    String workflowName = getProcessDefinitionKeyFromId(execution.getProcessDefinitionId());
    String processInstanceId = execution.getProcessInstanceId();
    String eventName = execution.getEventName();

    LOG.debug(
        "[TRIGGER_EXCEPTION] Workflow: {}, ProcessInstance: {} - Trigger exception handler executing for event: {}",
        workflowName,
        processInstanceId,
        eventName);

    try {
      WorkflowInstanceRepository workflowInstanceRepository =
          (WorkflowInstanceRepository)
              Entity.getEntityTimeSeriesRepository(Entity.WORKFLOW_INSTANCE);

      // Only handle boundary events (exceptions)
      if (!"end".equals(eventName)) {
        LOG.debug(
            "[TRIGGER_EXCEPTION_SKIP] Workflow: {}, ProcessInstance: {} - Skipping non-end event: {}",
            workflowName,
            processInstanceId,
            eventName);
        return;
      }

      // Get business key for this trigger failure - FilterEntityImpl always sets this
      String businessKey = execution.getProcessInstanceBusinessKey();
      UUID workflowInstanceId = UUID.fromString(businessKey);
      LOG.debug(
          "[TRIGGER_EXCEPTION] Workflow: {}, ProcessInstance: {}, InstanceId: {} - Using business key for trigger exception",
          workflowName,
          processInstanceId,
          workflowInstanceId);

      // Get the main workflow name from trigger name
      String mainWorkflowDefinitionName = getMainWorkflowDefinitionNameFromTrigger(workflowName);

      // Create workflow instance record for the trigger exception
      Map<String, Object> variables = new HashMap<>(execution.getVariables());
      variables.put("status", "EXCEPTION");
      variables.put("error", "Trigger workflow failed");
      variables.put("triggerFailure", true);

      workflowInstanceRepository.addNewWorkflowInstance(
          mainWorkflowDefinitionName, workflowInstanceId, System.currentTimeMillis(), variables);

      LOG.warn(
          "[TRIGGER_EXCEPTION_RECORDED] Workflow: {}, InstanceId: {}, ProcessInstance: {} - Trigger exception recorded in database",
          mainWorkflowDefinitionName,
          workflowInstanceId,
          processInstanceId);

    } catch (Exception exc) {
      LOG.error(
          "[TRIGGER_EXCEPTION_HANDLER_ERROR] Workflow: {}, ProcessInstance: {} - Failed to record trigger exception. Error: {}",
          workflowName,
          processInstanceId,
          exc.getMessage(),
          exc);
    }
  }

  private String getMainWorkflowDefinitionNameFromTrigger(String triggerWorkflowDefinitionName) {
    // Handle PeriodicBatchEntityTrigger format: WorkflowNameTrigger-entityType
    // Remove both the "Trigger" suffix and any entity type suffix
    String withoutTrigger = triggerWorkflowDefinitionName.replaceFirst("Trigger(-.*)?$", "");

    // If that didn't work, try just removing "Trigger" at the end
    if (withoutTrigger.equals(triggerWorkflowDefinitionName)) {
      withoutTrigger = triggerWorkflowDefinitionName.replaceFirst("Trigger$", "");
    }

    return withoutTrigger;
  }
}
