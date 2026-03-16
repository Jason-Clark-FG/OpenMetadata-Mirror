package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.UPDATED_BY_VARIABLE;

import java.util.List;
import java.util.UUID;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.governance.workflows.flowable.BaseDelegate;

/** Closes the OM Task when a terminal status is reached. Reads the task ID from node variables. */
public class CloseTaskDelegate extends BaseDelegate {

  private Expression terminalStatusesExpr;

  @Override
  protected void innerExecute(DelegateExecution execution) {
    String taskIdStr = (String) varHandler.getNodeVariable(SetupDelegate.OM_TASK_ID_VARIABLE);
    UUID taskId = UUID.fromString(taskIdStr);

    List<String> terminalStatuses =
        JsonUtils.readOrConvertValue(terminalStatusesExpr.getValue(execution), List.class);

    String updatedBy = (String) execution.getVariable(UPDATED_BY_VARIABLE);

    CloseTaskImpl.closeTask(taskId, terminalStatuses, updatedBy);
  }
}
