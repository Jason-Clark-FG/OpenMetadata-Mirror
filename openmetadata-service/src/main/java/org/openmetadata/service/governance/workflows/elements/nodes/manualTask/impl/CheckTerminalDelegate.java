package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import java.util.List;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.governance.workflows.flowable.BaseDelegate;

/**
 * Validates the received status against the allowed statuses and checks whether it is terminal.
 * Sets {@code isTerminal} local variable for the gateway to route accordingly. Throws if the
 * status is not in the allowed set.
 */
public class CheckTerminalDelegate extends BaseDelegate {

  private static final String STATUS_VARIABLE = "status";
  private static final String IS_TERMINAL_VARIABLE = "isTerminal";

  private Expression statusesExpr;
  private Expression terminalStatusesExpr;

  @Override
  protected void innerExecute(DelegateExecution execution) {
    String status = (String) execution.getVariable(STATUS_VARIABLE);
    List<String> statuses =
        JsonUtils.readOrConvertValue(statusesExpr.getValue(execution), List.class);
    List<String> terminalStatuses =
        JsonUtils.readOrConvertValue(terminalStatusesExpr.getValue(execution), List.class);

    if (!statuses.contains(status)) {
      throw new IllegalArgumentException(
          String.format("Received invalid status '%s'. Allowed statuses: %s", status, statuses));
    }

    boolean isTerminal = terminalStatuses.contains(status);
    execution.setVariableLocal(IS_TERMINAL_VARIABLE, isTerminal);
  }
}
