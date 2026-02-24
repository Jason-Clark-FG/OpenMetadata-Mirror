package org.openmetadata.service.migration.utils.v1122;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.WorkflowDefinitionRepository;
import org.openmetadata.service.util.EntityUtil;

/**
 * Migrates workflow definitions that use the deprecated {@code addReviewers: true} assignees
 * config to the new {@code assigneeSources: ["reviewers"]} format.
 *
 * <p>For each workflow definition node whose assignees config contains {@code addReviewers: true}
 * (and does not yet have an {@code assigneeSources} field), the migration:
 *
 * <ol>
 *   <li>Removes the {@code addReviewers} flag.
 *   <li>Adds {@code assigneeSources: ["reviewers"]}.
 * </ol>
 *
 * Uses {@link WorkflowDefinitionRepository#createOrUpdate} so that Flowable also receives the
 * updated workflow definition. The migration is idempotent – running it more than once is safe.
 */
@Slf4j
public class MigrationUtil {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String ADMIN_USER_NAME = "admin";

  public static void migrateWorkflowAssigneeSources() {
    LOG.info("Starting v1122 migration: converting addReviewers to assigneeSources");

    WorkflowDefinitionRepository repository =
        (WorkflowDefinitionRepository) Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION);

    List<WorkflowDefinition> allWorkflows =
        repository.listAll(EntityUtil.Fields.EMPTY_FIELDS, new ListFilter());

    int totalUpdated = 0;
    for (WorkflowDefinition workflow : allWorkflows) {
      try {
        String originalJson = JsonUtils.pojoToJson(workflow);
        JsonNode originalNode = MAPPER.readTree(originalJson);
        JsonNode migratedNode = migrateNodes(originalNode);

        if (migratedNode != originalNode) {
          WorkflowDefinition updated =
              JsonUtils.readValue(
                  MAPPER.writeValueAsString(migratedNode), WorkflowDefinition.class);
          repository.createOrUpdate(null, updated, ADMIN_USER_NAME);
          totalUpdated++;
          LOG.debug("Migrated workflow definition: {}", workflow.getFullyQualifiedName());
        }
      } catch (Exception e) {
        LOG.error(
            "Error migrating workflow definition '{}': {}",
            workflow.getFullyQualifiedName(),
            e.getMessage(),
            e);
      }
    }

    LOG.info("Completed v1122 migration: {} workflow definitions updated", totalUpdated);
  }

  /**
   * Recursively walks the workflow JSON and rewrites any {@code assignees} object that has {@code
   * addReviewers: true} but no {@code assigneeSources} field.
   */
  private static JsonNode migrateNodes(JsonNode node) {
    if (node == null || node.isNull()) {
      return node;
    }

    if (node.isObject()) {
      ObjectNode obj = (ObjectNode) node;
      if (needsMigration(obj)) {
        return migrateAssigneesNode(obj);
      }
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

  private static boolean needsMigration(ObjectNode obj) {
    JsonNode addReviewers = obj.get("addReviewers");
    JsonNode assigneeSources = obj.get("assigneeSources");
    return addReviewers != null
        && addReviewers.isBoolean()
        && addReviewers.asBoolean()
        && assigneeSources == null;
  }

  private static ObjectNode migrateAssigneesNode(ObjectNode assigneesObj) {
    ObjectNode result = assigneesObj.deepCopy();
    result.remove("addReviewers");
    ArrayNode sources = MAPPER.createArrayNode();
    sources.add("reviewers");
    result.set("assigneeSources", sources);
    return result;
  }
}
