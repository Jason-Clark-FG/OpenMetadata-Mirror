package org.openmetadata.service.governance.workflows.flowable;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import lombok.extern.slf4j.Slf4j;
import org.flowable.engine.delegate.BpmnError;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.service.governance.workflows.WorkflowVariableHandler;

/**
 * Base class for governance workflow delegates. Provides unified error handling, structured logging,
 * and WorkflowVariableHandler initialization. Subclasses declare their own Expression fields and
 * implement {@link #innerExecute(DelegateExecution)}.
 */
@Slf4j
public abstract class BaseDelegate implements JavaDelegate {

  protected WorkflowVariableHandler varHandler;

  protected abstract void innerExecute(DelegateExecution execution);

  @Override
  public void execute(DelegateExecution execution) {
    String workflowName = getProcessDefinitionKeyFromId(execution.getProcessDefinitionId());
    String processInstanceId = execution.getProcessInstanceId();
    String activityId = execution.getCurrentActivityId();
    String delegateClass = this.getClass().getSimpleName();

    varHandler = new WorkflowVariableHandler(execution);
    try {
      LOG.debug(
          "[DELEGATE_EXECUTE] Workflow: {}, ProcessInstance: {}, Activity: {}, Delegate: {}",
          workflowName,
          processInstanceId,
          activityId,
          delegateClass);

      innerExecute(execution);

      LOG.debug(
          "[DELEGATE_SUCCESS] Workflow: {}, ProcessInstance: {}, Activity: {}, Delegate: {}",
          workflowName,
          processInstanceId,
          activityId,
          delegateClass);
    } catch (Exception exc) {
      LOG.error(
          "[DELEGATE_ERROR] Workflow: {}, ProcessInstance: {}, Activity: {}, Delegate: {} - {}",
          workflowName,
          processInstanceId,
          activityId,
          delegateClass,
          exc.getMessage(),
          exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, exc.toString());
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }
}
