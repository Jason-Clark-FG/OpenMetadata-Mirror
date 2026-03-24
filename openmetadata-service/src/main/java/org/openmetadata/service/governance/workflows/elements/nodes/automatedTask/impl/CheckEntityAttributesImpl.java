package org.openmetadata.service.governance.workflows.elements.nodes.automatedTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.ENTITY_LIST_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RESULT_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
import org.openmetadata.service.rules.RuleEngine;

@Slf4j
public class CheckEntityAttributesImpl implements JavaDelegate {
  private Expression rulesExpr;
  private Expression inputNamespaceMapExpr;

  @Override
  public void execute(DelegateExecution execution) {
    WorkflowVariableHandler varHandler = new WorkflowVariableHandler(execution);
    try {
      Map<String, String> inputNamespaceMap =
          JsonUtils.readOrConvertValue(inputNamespaceMapExpr.getValue(execution), Map.class);
      String rules = (String) rulesExpr.getValue(execution);

      List<String> entityList = getEntityList(inputNamespaceMap, varHandler);
      List<String> trueEntityList = new ArrayList<>();
      List<String> falseEntityList = new ArrayList<>();

      for (String entityLinkStr : entityList) {
        MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
        if (checkAttributes(entityLink, rules)) {
          trueEntityList.add(entityLinkStr);
        } else {
          falseEntityList.add(entityLinkStr);
        }
      }

      boolean result = !trueEntityList.isEmpty();
      varHandler.setNodeVariable("true_" + ENTITY_LIST_VARIABLE, trueEntityList);
      varHandler.setNodeVariable("false_" + ENTITY_LIST_VARIABLE, falseEntityList);
      varHandler.setNodeVariable(ENTITY_LIST_VARIABLE, result ? trueEntityList : falseEntityList);
      varHandler.setNodeVariable(RESULT_VARIABLE, result);
    } catch (Exception exc) {
      LOG.error(
          String.format(
              "[%s] Failure: ", getProcessDefinitionKeyFromId(execution.getProcessDefinitionId())),
          exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, ExceptionUtils.getStackTrace(exc));
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }

  private Boolean checkAttributes(MessageParser.EntityLink entityLink, String rules) {
    EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);
    try {
      return (boolean) RuleEngine.getInstance().apply(rules, JsonUtils.getMap(entity));
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @SuppressWarnings("unchecked")
  private List<String> getEntityList(
      Map<String, String> inputNamespaceMap, WorkflowVariableHandler varHandler) {
    String entityListNamespace = inputNamespaceMap.get(ENTITY_LIST_VARIABLE);
    if (entityListNamespace != null) {
      Object entityListObj =
          varHandler.getNamespacedVariable(entityListNamespace, ENTITY_LIST_VARIABLE);
      if (entityListObj instanceof List) {
        return (List<String>) entityListObj;
      }
    }
    return List.of();
  }
}
