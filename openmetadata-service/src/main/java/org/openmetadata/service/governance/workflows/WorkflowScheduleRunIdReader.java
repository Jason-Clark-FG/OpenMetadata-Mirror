package org.openmetadata.service.governance.workflows;

import static org.openmetadata.service.governance.workflows.Workflow.GLOBAL_NAMESPACE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_SCHEDULE_RUN_ID_VARIABLE;
import static org.openmetadata.service.governance.workflows.WorkflowVariableHandler.getNamespacedVariableName;

import java.util.UUID;
import org.flowable.engine.delegate.DelegateExecution;

public final class WorkflowScheduleRunIdReader {
  private WorkflowScheduleRunIdReader() {}

  public static UUID readFrom(DelegateExecution execution) {
    Object plain = execution.getVariable(WORKFLOW_SCHEDULE_RUN_ID_VARIABLE);
    if (plain != null) {
      return toUuid(plain);
    }
    Object namespaced =
        execution.getVariable(
            getNamespacedVariableName(GLOBAL_NAMESPACE, WORKFLOW_SCHEDULE_RUN_ID_VARIABLE));
    return namespaced != null ? toUuid(namespaced) : null;
  }

  private static UUID toUuid(Object value) {
    return value instanceof UUID uuid ? uuid : UUID.fromString(value.toString());
  }
}
