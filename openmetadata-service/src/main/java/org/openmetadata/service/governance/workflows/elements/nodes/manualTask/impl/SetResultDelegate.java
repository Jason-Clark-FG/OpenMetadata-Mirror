package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.RESULT_VARIABLE;

import org.flowable.engine.delegate.DelegateExecution;
import org.openmetadata.service.governance.workflows.flowable.BaseDelegate;

/**
 * Sets the node's result variable to the received status. Parent edges route on {@code
 * ${nodeId_result == 'statusValue'}}.
 */
public class SetResultDelegate extends BaseDelegate {

  private static final String STATUS_VARIABLE = "status";

  @Override
  protected void innerExecute(DelegateExecution execution) {
    String status = (String) execution.getVariable(STATUS_VARIABLE);
    varHandler.setNodeVariable(RESULT_VARIABLE, status);
  }
}
