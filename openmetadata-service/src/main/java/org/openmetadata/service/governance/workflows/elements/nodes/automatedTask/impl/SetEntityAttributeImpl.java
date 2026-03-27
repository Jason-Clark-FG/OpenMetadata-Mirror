package org.openmetadata.service.governance.workflows.elements.nodes.automatedTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.UPDATED_BY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.exception.ExceptionUtils;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.BpmnError;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.governance.workflows.WorkflowVariableHandler;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.EntityFieldUtils;

@Slf4j
public class SetEntityAttributeImpl implements JavaDelegate {
  private Expression fieldNameExpr;
  private Expression fieldValueExpr;
  private Expression inputNamespaceMapExpr;

  @Override
  public void execute(DelegateExecution execution) {
    WorkflowVariableHandler varHandler = new WorkflowVariableHandler(execution);
    try {
      Map<String, Object> inputNamespaceMap =
          JsonUtils.readOrConvertValue(inputNamespaceMapExpr.getValue(execution), Map.class);

      String fieldName = fieldNameExpr != null ? (String) fieldNameExpr.getValue(execution) : "";

      String fieldValue = null;
      if (fieldValueExpr != null) {
        Object value = fieldValueExpr.getValue(execution);
        if (value != null && !value.toString().isEmpty()) {
          fieldValue = value.toString();
        }
      }

      String updatedByNamespace = (String) inputNamespaceMap.get(UPDATED_BY_VARIABLE);
      String actualUser =
          Optional.ofNullable(updatedByNamespace)
              .map(ns -> (String) varHandler.getNamespacedVariable(ns, UPDATED_BY_VARIABLE))
              .orElse(null);

      List<String> entityList =
          WorkflowVariableHandler.getEntityList(inputNamespaceMap, varHandler);
      for (String entityLinkStr : entityList) {
        MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
        String entityType = entityLink.getEntityType();
        EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);

        if (actualUser != null && !actualUser.isEmpty()) {
          EntityFieldUtils.setEntityField(
              entity, entityType, actualUser, fieldName, fieldValue, true, "governance-bot");
        } else {
          EntityFieldUtils.setEntityField(
              entity, entityType, "governance-bot", fieldName, fieldValue, true, null);
        }
      }

    } catch (Exception exc) {
      LOG.error(
          "[{}] Failure: ", getProcessDefinitionKeyFromId(execution.getProcessDefinitionId()), exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, ExceptionUtils.getStackTrace(exc));
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }
}
