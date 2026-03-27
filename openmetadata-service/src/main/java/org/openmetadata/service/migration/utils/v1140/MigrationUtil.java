package org.openmetadata.service.migration.utils.v1140;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.WorkflowDefinitionRepository;
import org.openmetadata.service.util.EntityUtil;

@Slf4j
public class MigrationUtil {
  private MigrationUtil() {}

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String ADMIN_USER_NAME = "admin";
  private static final Set<String> BATCH_NODE_SUBTYPES =
      Set.of(
          "checkEntityAttributesTask",
          "checkChangeDescriptionTask",
          "setEntityAttributeTask",
          "rollbackEntityTask",
          "sinkTask",
          "dataCompletenessTask");

  /**
   * Migrates all workflow definitions to support batch entity processing:
   *
   * <ol>
   *   <li>Adds {@code entityList} to the trigger's output so validation passes.
   *   <li>Adds {@code entityList} to each batch-capable automated task node's
   *       {@code inputNamespaceMap}, using the same namespace as {@code relatedEntity} (or
   *       {@code "global"} if absent).
   * </ol>
   *
   * <p>Always calls {@link WorkflowDefinitionRepository#createOrUpdate} for every workflow,
   * triggering BPMN redeployment with the new {@code loopCardinality("1")} structure even when no
   * JSON changes were needed.
   *
   * <p>The migration is idempotent — safe to run multiple times.
   */
  public static void migrateWorkflowInputNamespaceMap() {
    LOG.info("Starting v1140 migration: adding entityList to workflow node inputNamespaceMaps");

    WorkflowDefinitionRepository repository =
        (WorkflowDefinitionRepository) Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION);

    // Phase 1: Fix raw JSON in the DB without going through POJO deserialization.
    // Stored workflows may contain fields (e.g. "relatedEntity" in setEntityAttributeTask
    // inputNamespaceMap) that now fail schema validation, preventing listAll() from working.
    // Reading and writing raw JSON strings bypasses that issue entirely.
    int fixedCount = 0;
    int offset = 0;
    final int PAGE_SIZE = 100;
    List<String> rawPage;
    do {
      rawPage = repository.getDao().listAfterWithOffset(PAGE_SIZE, offset);
      for (String rawJson : rawPage) {
        try {
          JsonNode originalNode = MAPPER.readTree(rawJson);
          JsonNode migrated = migrateWorkflowJson(originalNode);
          if (migrated != originalNode) {
            UUID id = UUID.fromString(originalNode.get("id").asText());
            String fqn = originalNode.get("fullyQualifiedName").asText();
            repository.getDao().update(id, fqn, MAPPER.writeValueAsString(migrated));
            fixedCount++;
            LOG.info("Fixed workflow JSON for '{}'", fqn);
          }
        } catch (Exception e) {
          LOG.error("Error fixing raw workflow JSON: {}", e.getMessage(), e);
        }
      }
      offset += PAGE_SIZE;
    } while (rawPage.size() == PAGE_SIZE);

    LOG.info("Phase 1 complete: {} workflow JSON records updated", fixedCount);

    // Phase 2: Reload all workflows (now safe to deserialize) and redeploy BPMN processes.
    List<WorkflowDefinition> allWorkflows =
        repository.listAll(EntityUtil.Fields.EMPTY_FIELDS, new ListFilter());

    int totalRedeployed = 0;
    for (WorkflowDefinition workflow : allWorkflows) {
      try {
        repository.createOrUpdate(null, workflow, ADMIN_USER_NAME);
        totalRedeployed++;
        LOG.debug("Redeployed workflow: {}", workflow.getFullyQualifiedName());
      } catch (Exception e) {
        LOG.error(
            "Error redeploying workflow '{}': {}",
            workflow.getFullyQualifiedName(),
            e.getMessage(),
            e);
      }
    }

    LOG.info(
        "Completed v1140 migration: {} workflow definitions redeployed with entityList support",
        totalRedeployed);
  }

  static JsonNode migrateWorkflowJson(JsonNode root) {
    if (root == null || !root.isObject()) {
      return root;
    }

    boolean changed = false;
    ObjectNode result = ((ObjectNode) root).deepCopy();

    JsonNode triggerNode = result.get("trigger");
    if (triggerNode != null && triggerNode.isObject()) {
      JsonNode outputNode = triggerNode.get("output");
      if (outputNode != null && outputNode.isArray()) {
        boolean hasEntityList = false;
        for (JsonNode item : outputNode) {
          if ("entityList".equals(item.asText())) {
            hasEntityList = true;
            break;
          }
        }
        if (!hasEntityList) {
          ObjectNode newTrigger = ((ObjectNode) triggerNode).deepCopy();
          ArrayNode newOutput = MAPPER.createArrayNode();
          newOutput.add("entityList");
          for (JsonNode item : outputNode) {
            newOutput.add(item);
          }
          newTrigger.set("output", newOutput);
          result.set("trigger", newTrigger);
          changed = true;
        }
      }
    }

    JsonNode nodesNode = result.get("nodes");
    if (nodesNode != null && nodesNode.isArray()) {
      ArrayNode newNodes = MAPPER.createArrayNode();
      boolean nodesChanged = false;
      for (JsonNode nodeElement : nodesNode) {
        if (nodeElement.isObject()) {
          JsonNode subTypeNode = nodeElement.get("subType");
          String subType = subTypeNode != null ? subTypeNode.asText() : "";
          if (BATCH_NODE_SUBTYPES.contains(subType)) {
            JsonNode migratedNode = addEntityListToNamespaceMap(nodeElement);
            migratedNode = migrateInputArray(migratedNode);
            newNodes.add(migratedNode);
            if (migratedNode != nodeElement) {
              nodesChanged = true;
            }
          } else {
            newNodes.add(nodeElement);
          }
        } else {
          newNodes.add(nodeElement);
        }
      }
      if (nodesChanged) {
        result.set("nodes", newNodes);
        changed = true;
      }
    }

    return changed ? result : root;
  }

  static JsonNode addEntityListToNamespaceMap(JsonNode nodeObj) {
    JsonNode inputNamespaceMapNode = nodeObj.get("inputNamespaceMap");
    if (inputNamespaceMapNode == null || !inputNamespaceMapNode.isObject()) {
      return nodeObj;
    }
    ObjectNode inputNamespaceMap = (ObjectNode) inputNamespaceMapNode;

    boolean hasEntityList = inputNamespaceMap.has("entityList");
    boolean hasRelatedEntity = inputNamespaceMap.has("relatedEntity");

    if (hasEntityList && !hasRelatedEntity) {
      return nodeObj;
    }

    ObjectNode newInputNamespaceMap = inputNamespaceMap.deepCopy();
    if (!hasEntityList) {
      String namespace =
          hasRelatedEntity ? inputNamespaceMap.get("relatedEntity").asText() : "global";
      newInputNamespaceMap.put("entityList", namespace);
    }
    newInputNamespaceMap.remove("relatedEntity");

    ObjectNode result = ((ObjectNode) nodeObj).deepCopy();
    result.set("inputNamespaceMap", newInputNamespaceMap);
    return result;
  }

  static JsonNode migrateInputArray(JsonNode nodeObj) {
    JsonNode inputNode = nodeObj.get("input");
    if (inputNode == null || !inputNode.isArray()) {
      return nodeObj;
    }

    boolean needsChange = false;
    for (JsonNode item : inputNode) {
      if ("relatedEntity".equals(item.asText())) {
        needsChange = true;
        break;
      }
    }
    if (!needsChange) {
      return nodeObj;
    }

    ArrayNode newInput = MAPPER.createArrayNode();
    boolean addedEntityList = false;
    for (JsonNode item : inputNode) {
      if ("relatedEntity".equals(item.asText())) {
        if (!addedEntityList) {
          newInput.add("entityList");
          addedEntityList = true;
        }
      } else {
        newInput.add(item);
      }
    }

    ObjectNode result = ((ObjectNode) nodeObj).deepCopy();
    result.set("input", newInput);
    return result;
  }
}
