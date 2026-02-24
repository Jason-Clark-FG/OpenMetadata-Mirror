package org.openmetadata.service.governance.workflows.elements.nodes.userTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RELATED_ENTITY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.exception.ExceptionUtils;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.BpmnError;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.governance.workflows.WorkflowVariableHandler;
import org.openmetadata.service.resources.feeds.MessageParser;

@Slf4j
public class SetApprovalAssigneesImpl implements JavaDelegate {
  private Expression assigneesExpr;
  private Expression assigneesVarNameExpr;
  private Expression inputNamespaceMapExpr;

  @Override
  public void execute(DelegateExecution execution) {
    WorkflowVariableHandler varHandler = new WorkflowVariableHandler(execution);
    try {
      Map<String, String> inputNamespaceMap =
          JsonUtils.readOrConvertValue(inputNamespaceMapExpr.getValue(execution), Map.class);
      Map<String, Object> assigneesConfig =
          JsonUtils.readOrConvertValue(assigneesExpr.getValue(execution), Map.class);

      // Resolve the list of sources to use. Precedence:
      //   1. assigneeSources (new, supports multiple sources and specific user entity links)
      //   2. assigneeSource  (single-value legacy field)
      //   3. addReviewers=true (oldest legacy field)
      List<String> sources = resolveSources(assigneesConfig);

      // Use a set to deduplicate assignee entity-link strings across sources.
      Set<String> assignees = new LinkedHashSet<>();

      if (!sources.isEmpty()) {
        MessageParser.EntityLink entityLink =
            MessageParser.EntityLink.parse(
                (String)
                    varHandler.getNamespacedVariable(
                        inputNamespaceMap.get(RELATED_ENTITY_VARIABLE), RELATED_ENTITY_VARIABLE));
        EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);

        for (String source : sources) {
          switch (source) {
            case "reviewers" -> {
              boolean entitySupportsReviewers =
                  Entity.getEntityRepository(entityLink.getEntityType()).isSupportsReviewers();
              if (entitySupportsReviewers) {
                // Entity has the reviewers field: use reviewers as-is (even if empty).
                // An empty reviewers list means auto-approve; do NOT fall back to owners.
                List<EntityReference> reviewers = entity.getReviewers();
                if (reviewers != null && !reviewers.isEmpty()) {
                  assignees.addAll(getEntityLinkStringFromEntityReference(reviewers));
                }
              } else {
                // Entity has no reviewers field: fall back to owners.
                // If owners are also empty the task will be auto-approved.
                List<EntityReference> owners = entity.getOwners();
                if (owners != null && !owners.isEmpty()) {
                  assignees.addAll(getEntityLinkStringFromEntityReference(owners));
                }
              }
            }
            case "owners" -> {
              List<EntityReference> owners = entity.getOwners();
              if (owners != null && !owners.isEmpty()) {
                assignees.addAll(getEntityLinkStringFromEntityReference(owners));
              }
            }
            default -> {
              // Treat as a specific entity link (e.g. <#E::user::john.doe>).
              // Log a warning for invalid links and skip them rather than failing the whole task.
              try {
                assignees.add(MessageParser.EntityLink.parse(source).getLinkString());
              } catch (Exception e) {
                LOG.warn(
                    "[Process: {}] Skipping invalid assignee entity link '{}': {}",
                    execution.getProcessInstanceId(),
                    source,
                    e.getMessage());
              }
            }
          }
        }
      }

      List<String> assigneeList = new ArrayList<>(assignees);

      // Persist the list as JSON array so TaskListener can read it.
      // Using setVariable instead of setVariableLocal to ensure visibility across subprocess.
      execution.setVariable(
          assigneesVarNameExpr.getValue(execution).toString(), JsonUtils.pojoToJson(assigneeList));

      boolean hasAssignees = !assigneeList.isEmpty();
      execution.setVariable("hasAssignees", hasAssignees);

      LOG.debug(
          "[Process: {}] ✓ Set hasAssignees={}, assignees count: {}, flow will {}",
          execution.getProcessInstanceId(),
          hasAssignees,
          assigneeList.size(),
          hasAssignees ? "create USER TASK" : "AUTO-APPROVE");
    } catch (Exception exc) {
      LOG.error(
          String.format(
              "[%s] Failure: ", getProcessDefinitionKeyFromId(execution.getProcessDefinitionId())),
          exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, ExceptionUtils.getStackTrace(exc));
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }

  /**
   * Resolves the list of sources from the assignees config, handling all three generations of the
   * configuration format (assigneeSources → assigneeSource → addReviewers).
   */
  @SuppressWarnings("unchecked")
  private List<String> resolveSources(Map<String, Object> assigneesConfig) {
    List<String> assigneeSources = (List<String>) assigneesConfig.get("assigneeSources");
    if (assigneeSources != null) {
      return assigneeSources;
    }

    // Legacy: single-value assigneeSource
    String assigneeSource = (String) assigneesConfig.get("assigneeSource");
    if (assigneeSource != null) {
      return List.of(assigneeSource);
    }

    // Oldest legacy: addReviewers boolean
    boolean addReviewers = (boolean) assigneesConfig.getOrDefault("addReviewers", false);
    if (addReviewers) {
      return List.of("reviewers");
    }

    // No recognised source found: return empty list, which causes the task to be auto-approved.
    return List.of();
  }

  private List<String> getEntityLinkStringFromEntityReference(List<EntityReference> assignees) {
    return assignees.stream()
        .map(
            reviewer ->
                new MessageParser.EntityLink(reviewer.getType(), reviewer.getFullyQualifiedName())
                    .getLinkString())
        .toList();
  }
}
