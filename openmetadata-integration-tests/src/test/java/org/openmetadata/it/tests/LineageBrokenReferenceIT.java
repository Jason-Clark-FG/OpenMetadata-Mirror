package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.factories.DatabaseSchemaTestFactory;
import org.openmetadata.it.factories.DatabaseServiceTestFactory;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.api.data.CreateTable;
import org.openmetadata.schema.api.lineage.AddLineage;
import org.openmetadata.schema.entity.data.DatabaseSchema;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.type.EntitiesEdge;
import org.openmetadata.schema.type.EntityLineage;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.fluent.builders.ColumnBuilder;
import org.openmetadata.service.Entity;

/**
 * Integration tests verifying that search index reindexing handles broken (orphaned) entity
 * references gracefully.
 *
 * <p>A "broken reference" means entity_relationship or tag_usage contains a row pointing to an
 * entity that no longer exists in its entity table. For example, a table→databaseSchema relationship
 * exists but the databaseSchema row was deleted, or a lineage edge references a table that was
 * removed.
 *
 * <p>When reindexing via POST /v1/search/reindexEntities, buildSearchIndexDoc() resolves these
 * references. Without the fix, a missing entity throws EntityNotFoundException and the entire search
 * doc fails — making the entity invisible in search. With the fix, broken references are skipped
 * gracefully and the entity remains searchable.
 */
@ExtendWith(TestNamespaceExtension.class)
@Execution(ExecutionMode.CONCURRENT)
public class LineageBrokenReferenceIT {

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  @BeforeAll
  static void setup() {
    SdkClients.adminClient();
  }

  /**
   * Table A has lineage to Table B. Delete Table B directly from the entity table via DAO, leaving
   * an orphaned lineage relationship. Reindex Table A — buildSearchIndexDoc should handle the
   * missing upstream/downstream entity gracefully.
   */
  @Test
  void testReindexTableWithBrokenLineageReference(TestNamespace ns) throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    Table tableA = createTable(client, ns, "brk_lineage_src");
    Table tableB = createTable(client, ns, "brk_lineage_tgt");

    try {
      addLineage(client, tableA, tableB);

      EntityLineage lineageBefore =
          getLineage(client, "table", tableA.getId().toString(), "0", "1");
      assertNotNull(lineageBefore);
      assertFalse(lineageBefore.getDownstreamEdges().isEmpty());

      // Delete Table B directly from the entity table via DAO.
      // This leaves the lineage relationship row (entity_relationship) intact,
      // creating an orphaned reference — exactly the broken reference scenario.
      Entity.getCollectionDAO().tableDAO().delete(tableB.getId());

      // Reindex Table A via reindexEntities endpoint.
      // buildSearchIndexDoc() will call getLineageData() which queries entity_relationship
      // and tries to resolve Table B. Without the fix, this throws EntityNotFoundException.
      EntityReference tableARef = tableA.getEntityReference();
      String reindexResponse =
          assertDoesNotThrow(
              () -> client.search().reindexEntities(List.of(tableARef)),
              "Reindexing Table A should not fail when downstream Table B has an orphaned reference");

      assertNotNull(reindexResponse);

      // Verify Table A is still searchable in ES after reindex
      assertEntitySearchable(client, tableA);

    } finally {
      hardDeleteQuietly(client, tableA);
      hardDeleteQuietly(client, tableB);
    }
  }

  /**
   * Table A has lineage to Table B and Table C. Both B and C are deleted directly from the entity
   * table. Reindex Table A — should still succeed with all downstream references broken.
   */
  @Test
  void testReindexTableWithMultipleBrokenLineageReferences(TestNamespace ns) throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    Table tableA = createTable(client, ns, "brk_multi_src");
    Table tableB = createTable(client, ns, "brk_multi_tgt1");
    Table tableC = createTable(client, ns, "brk_multi_tgt2");

    try {
      addLineage(client, tableA, tableB);
      addLineage(client, tableA, tableC);

      // Delete both downstream tables directly via DAO
      Entity.getCollectionDAO().tableDAO().delete(tableB.getId());
      Entity.getCollectionDAO().tableDAO().delete(tableC.getId());

      // Reindex Table A — should succeed despite all broken downstream references
      EntityReference tableARef = tableA.getEntityReference();
      String reindexResponse =
          assertDoesNotThrow(
              () -> client.search().reindexEntities(List.of(tableARef)),
              "Reindexing should succeed even when all downstream entities are orphaned");

      assertNotNull(reindexResponse);
      assertEntitySearchable(client, tableA);

    } finally {
      hardDeleteQuietly(client, tableA);
      hardDeleteQuietly(client, tableB);
      hardDeleteQuietly(client, tableC);
    }
  }

  /**
   * Table B has upstream lineage from Table A. Delete Table A directly from the entity table.
   * Reindex Table B — the upstream lineage resolution should handle the missing entity gracefully.
   */
  @Test
  void testReindexTableWithBrokenUpstreamLineageReference(TestNamespace ns) throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    Table tableA = createTable(client, ns, "brk_up_src");
    Table tableB = createTable(client, ns, "brk_up_tgt");

    try {
      addLineage(client, tableA, tableB);

      // Delete upstream Table A directly via DAO
      Entity.getCollectionDAO().tableDAO().delete(tableA.getId());

      // Reindex Table B — upstream lineage to deleted Table A should be skipped gracefully
      EntityReference tableBRef = tableB.getEntityReference();
      String reindexResponse =
          assertDoesNotThrow(
              () -> client.search().reindexEntities(List.of(tableBRef)),
              "Reindexing Table B should not fail when upstream Table A is orphaned");

      assertNotNull(reindexResponse);
      assertEntitySearchable(client, tableB);

    } finally {
      hardDeleteQuietly(client, tableA);
      hardDeleteQuietly(client, tableB);
    }
  }

  /**
   * After reindexing a table with broken lineage, verify that search lineage API also handles the
   * broken reference without returning "Issue in Search Entity By Key".
   */
  @Test
  void testSearchLineageWithBrokenReference(TestNamespace ns) throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    Table tableA = createTable(client, ns, "brk_search_src");
    Table tableB = createTable(client, ns, "brk_search_tgt");

    try {
      addLineage(client, tableA, tableB);

      // Delete Table B directly via DAO, creating orphaned lineage
      Entity.getCollectionDAO().tableDAO().delete(tableB.getId());

      // Reindex Table A so ES has the updated doc
      client.search().reindexEntities(List.of(tableA.getEntityReference()));

      // Search lineage on Table A looking downstream — should not throw
      // "Issue in Search Entity By Key" from EsUtils
      String searchResult =
          assertDoesNotThrow(
              () ->
                  client
                      .lineage()
                      .searchLineage(tableA.getFullyQualifiedName(), "table", 0, 2, false),
              "Search lineage should not throw when downstream entity is orphaned");

      assertNotNull(searchResult);
      JsonNode node = OBJECT_MAPPER.readTree(searchResult);
      assertNotNull(node);

    } finally {
      hardDeleteQuietly(client, tableA);
      hardDeleteQuietly(client, tableB);
    }
  }

  private Table createTable(OpenMetadataClient client, TestNamespace ns, String tableName)
      throws Exception {
    DatabaseService service = DatabaseServiceTestFactory.createPostgres(ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimple(ns, service);

    CreateTable createTable = new CreateTable();
    createTable.setName(ns.prefix(tableName));
    createTable.setDatabaseSchema(schema.getFullyQualifiedName());
    createTable.setColumns(
        List.of(
            ColumnBuilder.of("id", "BIGINT").primaryKey().notNull().build(),
            ColumnBuilder.of("name", "VARCHAR").dataLength(255).build()));

    return client.tables().create(createTable);
  }

  private void addLineage(OpenMetadataClient client, Table from, Table to) {
    AddLineage addLineage =
        new AddLineage()
            .withEdge(
                new EntitiesEdge()
                    .withFromEntity(from.getEntityReference())
                    .withToEntity(to.getEntityReference()));
    Awaitility.await("Add lineage edge")
        .atMost(Duration.ofSeconds(30))
        .pollDelay(Duration.ofMillis(100))
        .pollInterval(Duration.ofSeconds(1))
        .ignoreExceptions()
        .until(
            () -> {
              client.lineage().addLineage(addLineage);
              return true;
            });
  }

  private EntityLineage getLineage(
      OpenMetadataClient client,
      String entityType,
      String entityId,
      String upstreamDepth,
      String downstreamDepth)
      throws Exception {
    String response =
        client.lineage().getEntityLineage(entityType, entityId, upstreamDepth, downstreamDepth);
    return OBJECT_MAPPER.readValue(response, EntityLineage.class);
  }

  private void assertEntitySearchable(OpenMetadataClient client, Table table) {
    Awaitility.await("Entity should be searchable after reindex")
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofSeconds(2))
        .ignoreExceptions()
        .until(
            () -> {
              String searchResult =
                  client
                      .search()
                      .query(table.getFullyQualifiedName())
                      .index("table_search_index")
                      .size(10)
                      .execute();
              JsonNode resultNode = OBJECT_MAPPER.readTree(searchResult);
              JsonNode hits = resultNode.path("hits").path("hits");
              return hits.isArray() && !hits.isEmpty();
            });
  }

  private void hardDeleteQuietly(OpenMetadataClient client, Table table) {
    try {
      client
          .tables()
          .delete(table.getId().toString(), Map.of("hardDelete", "true", "recursive", "true"));
    } catch (Exception ignored) {
    }
  }
}
