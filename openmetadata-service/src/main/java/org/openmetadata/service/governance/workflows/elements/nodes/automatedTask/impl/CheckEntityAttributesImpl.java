package org.openmetadata.service.governance.workflows.elements.nodes.automatedTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.FALSE_ENTITY_LIST_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RESULT_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.TRUE_ENTITY_LIST_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import java.time.Duration;
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

      List<String> entityList =
          WorkflowVariableHandler.getEntityList(inputNamespaceMap, varHandler);
      List<String> trueEntityList = new ArrayList<>();
      List<String> falseEntityList = new ArrayList<>();

      Retry retry =
          Retry.of(
              "check-entity-attributes",
              RetryConfig.custom()
                  .maxAttempts(3)
                  .waitDuration(Duration.ofMillis(500))
                  .retryExceptions(Exception.class)
                  .build());

      for (String entityLinkStr : entityList) {
        try {
          MessageParser.EntityLink entityLink = MessageParser.EntityLink.parse(entityLinkStr);
          boolean passes =
              Retry.decorateSupplier(retry, () -> checkAttributes(entityLink, rules)).get();
          if (passes) {
            trueEntityList.add(entityLinkStr);
          } else {
            falseEntityList.add(entityLinkStr);
          }
        } catch (Exception e) {
          falseEntityList.add(entityLinkStr);
          LOG.error(
              "[{}] Failed entity '{}' after retries: {}",
              getProcessDefinitionKeyFromId(execution.getProcessDefinitionId()),
              entityLinkStr,
              e.getMessage(),
              e);
        }
      }

      boolean result = !trueEntityList.isEmpty();
      varHandler.setNodeVariable(TRUE_ENTITY_LIST_VARIABLE, trueEntityList);
      varHandler.setNodeVariable(FALSE_ENTITY_LIST_VARIABLE, falseEntityList);
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
}
