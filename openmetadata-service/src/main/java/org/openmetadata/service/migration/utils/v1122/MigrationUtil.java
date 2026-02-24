package org.openmetadata.service.migration.utils.v1122;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.ListFilter;

/**
 * Migrates workflow definitions that use the deprecated {@code addReviewers: true} assignees
 * config to the new {@code assigneeSources: ["reviewers"]} format.
 *
 * <p>For each workflow definition node whose assignees config contains {@code addReviewers: true}
 * (and does not yet have an {@code assigneeSources} field), the migration:
 * <ol>
 *   <li>Removes the {@code addReviewers} flag.</li>
 *   <li>Adds {@code assigneeSources: ["reviewers"]}.</li>
 * </ol>
 * The migration is idempotent – running it more than once is safe.
 */
@Slf4j
public class MigrationUtil {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final int BATCH_SIZE = 100;

  private final CollectionDAO collectionDAO;

  public MigrationUtil(CollectionDAO collectionDAO) {
    this.collectionDAO = collectionDAO;
  }

  public void migrateWorkflowAssigneeSources() {
    LOG.info("Starting v1122 migration: converting addReviewers to assigneeSources");

    int totalUpdated = 0;
    String afterName = "";
    String afterId = "";
    boolean hasMore = true;

    while (hasMore) {
      List<String> workflowJsonList =
          collectionDAO
              .workflowDefinitionDAO()
              .listAfter(new ListFilter(Include.ALL), BATCH_SIZE, afterName, afterId);

      if (workflowJsonList.isEmpty()) {
        hasMore = false;
        break;
      }

      for (String workflowJson : workflowJsonList) {
        try {
          JsonNode workflowNode = MAPPER.readTree(workflowJson);
          JsonNode updatedNode = migrateNodes(workflowNode);

          // Update pagination cursor to this item (last processed item)
          afterName = workflowNode.path("name").asText(afterName);
          afterId = workflowNode.path("id").asText(afterId);

          if (updatedNode != workflowNode) {
            WorkflowDefinition workflow =
                JsonUtils.readValue(
                    MAPPER.writeValueAsString(updatedNode), WorkflowDefinition.class);
            collectionDAO.workflowDefinitionDAO().update(workflow);
            totalUpdated++;
            LOG.debug("Migrated workflow definition: {}", workflow.getFullyQualifiedName());
          }
        } catch (Exception e) {
          LOG.error("Error migrating workflow definition: {}", workflowJson, e);
        }
      }

      if (workflowJsonList.size() < BATCH_SIZE) {
        hasMore = false;
      }
    }

    LOG.info("Completed v1122 migration: {} workflow definitions updated", totalUpdated);
  }

  /**
   * Recursively walks the workflow JSON and rewrites any {@code assignees} object that has
   * {@code addReviewers: true} but no {@code assigneeSources} field.
   */
  private JsonNode migrateNodes(JsonNode node) {
    if (node == null || node.isNull()) {
      return node;
    }

    if (node.isObject()) {
      ObjectNode obj = (ObjectNode) node;
      // Check if this node is an "assignees" config object
      if (needsMigration(obj)) {
        return migrateAssigneesNode(obj);
      }
      // Recurse into children
      boolean changed = false;
      ObjectNode result = MAPPER.createObjectNode();
      for (java.util.Iterator<java.util.Map.Entry<String, JsonNode>> it = obj.fields();
          it.hasNext(); ) {
        java.util.Map.Entry<String, JsonNode> entry = it.next();
        JsonNode migratedChild = migrateNodes(entry.getValue());
        result.set(entry.getKey(), migratedChild);
        if (migratedChild != entry.getValue()) {
          changed = true;
        }
      }
      return changed ? result : node;
    }

    if (node.isArray()) {
      ArrayNode arr = (ArrayNode) node;
      boolean changed = false;
      ArrayNode result = MAPPER.createArrayNode();
      for (JsonNode element : arr) {
        JsonNode migratedElement = migrateNodes(element);
        result.add(migratedElement);
        if (migratedElement != element) {
          changed = true;
        }
      }
      return changed ? result : node;
    }

    return node;
  }

  private boolean needsMigration(ObjectNode obj) {
    JsonNode addReviewers = obj.get("addReviewers");
    JsonNode assigneeSources = obj.get("assigneeSources");
    return addReviewers != null
        && addReviewers.isBoolean()
        && addReviewers.asBoolean()
        && assigneeSources == null;
  }

  private ObjectNode migrateAssigneesNode(ObjectNode assigneesObj) {
    ObjectNode result = assigneesObj.deepCopy();
    result.remove("addReviewers");
    ArrayNode sources = MAPPER.createArrayNode();
    sources.add("reviewers");
    result.set("assigneeSources", sources);
    return result;
  }
}
