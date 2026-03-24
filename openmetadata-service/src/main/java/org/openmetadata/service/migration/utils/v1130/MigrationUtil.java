package org.openmetadata.service.migration.utils.v1130;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.WorkflowDefinitionRepository;
import org.openmetadata.service.util.EntityUtil;

@Slf4j
public class MigrationUtil {
  private MigrationUtil() {}

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String ADMIN_USER_NAME = "admin";
  private static final String OLD_FIELD = "owners.name.keyword";
  private static final String NEW_FIELD = "ownerName";
  private static final Set<String> BATCH_NODE_SUBTYPES =
      Set.of(
          "checkEntityAttributesTask",
          "checkChangeDescriptionTask",
          "setEntityAttributeTask",
          "rollbackEntityTask",
          "sinkTask",
          "dataCompletenessTask");

  public static void updateOwnerChartFormulas() {
    DataInsightSystemChartRepository repository = new DataInsightSystemChartRepository();
    String[] chartNames = {
      "percentage_of_data_asset_with_owner",
      "percentage_of_service_with_owner",
      "data_assets_with_owner_summary_card",
      "percentage_of_data_asset_with_owner_kpi",
      "number_of_data_asset_with_owner_kpi",
      "assets_with_owners",
      "assets_with_owner_live"
    };

    for (String chartName : chartNames) {
      try {
        DataInsightCustomChart chart =
            repository.getByName(null, chartName, EntityUtil.Fields.EMPTY_FIELDS);
        String json = org.openmetadata.schema.utils.JsonUtils.pojoToJson(chart.getChartDetails());
        if (json.contains(OLD_FIELD)) {
          String updatedJson = json.replace(OLD_FIELD, NEW_FIELD);
          Object updatedDetails =
              org.openmetadata.schema.utils.JsonUtils.readValue(
                  updatedJson, chart.getChartDetails().getClass());
          chart.setChartDetails(updatedDetails);
          repository.prepareInternal(chart, false);
          repository.getDao().update(chart);
          LOG.info(
              "Updated chart formula for '{}': replaced '{}' with '{}'",
              chartName,
              OLD_FIELD,
              NEW_FIELD);
        }
      } catch (Exception ex) {
        LOG.warn("Could not update chart '{}': {}", chartName, ex.getMessage());
      }
    }
  }

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
    LOG.info("Starting v1130 migration: adding entityList to workflow node inputNamespaceMaps");

    WorkflowDefinitionRepository repository =
        (WorkflowDefinitionRepository) Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION);

    List<WorkflowDefinition> allWorkflows =
        repository.listAll(EntityUtil.Fields.EMPTY_FIELDS, new ListFilter());

    int totalRedeployed = 0;
    for (WorkflowDefinition workflow : allWorkflows) {
      try {
        String originalJson = JsonUtils.pojoToJson(workflow);
        JsonNode originalNode = MAPPER.readTree(originalJson);
        JsonNode migrated = migrateWorkflowJson(originalNode);

        WorkflowDefinition toSave =
            migrated != originalNode
                ? JsonUtils.readValue(MAPPER.writeValueAsString(migrated), WorkflowDefinition.class)
                : workflow;

        // Always call createOrUpdate to trigger BPMN redeployment with new loopCardinality
        repository.createOrUpdate(null, toSave, ADMIN_USER_NAME);
        totalRedeployed++;
        LOG.debug("Redeployed workflow: {}", workflow.getFullyQualifiedName());
      } catch (Exception e) {
        LOG.error(
            "Error migrating workflow '{}': {}",
            workflow.getFullyQualifiedName(),
            e.getMessage(),
            e);
      }
    }

    LOG.info(
        "Completed v1130 migration: {} workflow definitions redeployed with entityList support",
        totalRedeployed);
  }

  private static JsonNode migrateWorkflowJson(JsonNode root) {
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

  private static JsonNode addEntityListToNamespaceMap(JsonNode nodeObj) {
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
}
