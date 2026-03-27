package org.openmetadata.service.governance.workflows.elements.nodes.automatedTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.UPDATED_BY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

      final String resolvedFieldValue = fieldValue;

      List<String> entityList =
          WorkflowVariableHandler.getEntityList(inputNamespaceMap, varHandler);

      Retry retry =
          Retry.of(
              "set-entity-attribute",
              RetryConfig.custom()
                  .maxAttempts(3)
                  .waitDuration(Duration.ofMillis(500))
                  .retryExceptions(Exception.class)
                  .build());

      List<String> failedEntities = new ArrayList<>();
      Map<String, String> entityErrors = new LinkedHashMap<>();

      for (String entityLinkStr : entityList) {
        try {
          Retry.decorateRunnable(
                  retry,
                  () -> {
                    MessageParser.EntityLink entityLink =
                        MessageParser.EntityLink.parse(entityLinkStr);
                    String entityType = entityLink.getEntityType();
                    EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);
                    if (actualUser != null && !actualUser.isEmpty()) {
                      EntityFieldUtils.setEntityField(
                          entity,
                          entityType,
                          actualUser,
                          fieldName,
                          resolvedFieldValue,
                          true,
                          "governance-bot");
                    } else {
                      EntityFieldUtils.setEntityField(
                          entity,
                          entityType,
                          "governance-bot",
                          fieldName,
                          resolvedFieldValue,
                          true,
                          null);
                    }
                  })
              .run();
        } catch (Exception e) {
          failedEntities.add(entityLinkStr);
          entityErrors.put(entityLinkStr, e.getMessage());
          LOG.error(
              "[{}] Failed entity '{}' after retries: {}",
              getProcessDefinitionKeyFromId(execution.getProcessDefinitionId()),
              entityLinkStr,
              e.getMessage(),
              e);
        }
      }

      if (!failedEntities.isEmpty()) {
        varHandler.setNodeVariable("failedEntities", failedEntities);
        varHandler.setNodeVariable("entityErrors", entityErrors);
        int total = entityList.size();
        int failed = failedEntities.size();
        String processingStatus = (failed == total) ? "failure" : "partial_success";
        varHandler.setNodeVariable("processingStatus", processingStatus);
        LOG.warn(
            "[{}] {}: {}/{} entities failed",
            getProcessDefinitionKeyFromId(execution.getProcessDefinitionId()),
            processingStatus,
            failed,
            total);
        varHandler.setGlobalVariable(
            EXCEPTION_VARIABLE, String.format("%d/%d entities failed", failed, total));
      }

    } catch (Exception exc) {
      LOG.error(
          "[{}] Failure: ", getProcessDefinitionKeyFromId(execution.getProcessDefinitionId()), exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, ExceptionUtils.getStackTrace(exc));
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }
}
