package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.UPDATED_BY_VARIABLE;

import java.util.UUID;
import org.flowable.engine.delegate.DelegateExecution;
import org.openmetadata.service.governance.workflows.flowable.BaseDelegate;

/** Closes the OM Task when a terminal status is reached. Reads the task ID from node variables. */
public class CloseTaskDelegate extends BaseDelegate {

  @Override
  protected void innerExecute(DelegateExecution execution) {
    String taskIdStr = (String) varHandler.getNodeVariable(SetupDelegate.OM_TASK_ID_VARIABLE);
    UUID taskId = UUID.fromString(taskIdStr);

    String updatedBy = (String) execution.getVariable(UPDATED_BY_VARIABLE);

    CloseTaskImpl.closeTask(taskId, updatedBy);
  }
}
