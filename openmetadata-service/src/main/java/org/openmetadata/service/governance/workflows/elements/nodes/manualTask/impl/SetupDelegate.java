package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.RELATED_ENTITY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RESULT_VARIABLE;

import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver.ResolvedTemplate;
import org.openmetadata.service.governance.workflows.flowable.BaseDelegate;

/**
 * Creates an OM Task for the ManualTask node. Idempotent on re-entry: if the task was already
 * created (cycle re-entry), it skips creation and sets taskCreated = true.
 */
@Slf4j
public class SetupDelegate extends BaseDelegate {

  static final String OM_TASK_ID_VARIABLE = "omTaskId";
  private static final String TASK_CREATED_VARIABLE = "taskCreated";

  private Expression inputNamespaceMapExpr;
  private Expression configMapExpr;

  @Override
  protected void innerExecute(DelegateExecution execution) {
    Object existingTaskId = varHandler.getNodeVariable(OM_TASK_ID_VARIABLE);
    if (existingTaskId != null) {
      LOG.debug("[ManualTask.Setup] Task already exists ({}), skipping creation.", existingTaskId);
      execution.setVariableLocal(TASK_CREATED_VARIABLE, true);
      return;
    }

    Map<String, Object> configMap =
        JsonUtils.readOrConvertValue(configMapExpr.getValue(execution), Map.class);
    String templateName = (String) configMap.get("template");
    ResolvedTemplate template = ManualTaskTemplateResolver.resolve(templateName);

    Map<String, String> inputNamespaceMap =
        JsonUtils.readOrConvertValue(inputNamespaceMapExpr.getValue(execution), Map.class);
    String entityLinkStr =
        (String)
            varHandler.getNamespacedVariable(
                inputNamespaceMap.get(RELATED_ENTITY_VARIABLE), RELATED_ENTITY_VARIABLE);

    UUID workflowInstanceId = getWorkflowInstanceId(execution);
    if (workflowInstanceId == null) {
      throw new IllegalStateException(
          "[ManualTask.Setup] Cannot create ManualTask without a valid workflowInstanceId. "
              + "Business key must be a valid UUID. Got: '"
              + execution.getProcessInstanceBusinessKey()
              + "'");
    }

    UUID taskId =
        SetupImpl.createTask(
            entityLinkStr, template.taskCategory(), template.taskType(), workflowInstanceId);

    varHandler.setNodeVariable(OM_TASK_ID_VARIABLE, taskId.toString());
    varHandler.setNodeVariable(RESULT_VARIABLE, TaskEntityStatus.Open.value());
    execution.setVariableLocal(TASK_CREATED_VARIABLE, false);
  }

  private UUID getWorkflowInstanceId(DelegateExecution execution) {
    String businessKey = execution.getProcessInstanceBusinessKey();
    if (businessKey != null) {
      try {
        return UUID.fromString(businessKey);
      } catch (IllegalArgumentException e) {
        LOG.warn(
            "[ManualTask.Setup] Business key '{}' is not a valid UUID, cannot link task to workflow instance.",
            businessKey);
      }
    }
    return null;
  }
}
