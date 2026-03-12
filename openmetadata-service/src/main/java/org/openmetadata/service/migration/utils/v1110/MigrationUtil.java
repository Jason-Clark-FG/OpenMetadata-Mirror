package org.openmetadata.service.migration.utils.v1110;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;
import static org.openmetadata.service.Entity.CLASSIFICATION;
import static org.openmetadata.service.util.EntityUtil.hash;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.Handle;
import org.openmetadata.schema.api.classification.CreateTag;
import org.openmetadata.schema.api.classification.LoadTags;
import org.openmetadata.schema.entity.data.DataContract;
import org.openmetadata.schema.tests.TestCase;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Recognizer;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.jdbi3.MigrationDAO;
import org.openmetadata.service.jdbi3.locator.ConnectionType;
import org.openmetadata.service.migration.QueryStatus;
import org.openmetadata.service.migration.utils.MigrationFile;

@Slf4j
public class MigrationUtil {
  private static final Map<String, String> PATH_BY_TAG =
      Map.of(
          "PII.Sensitive", "data/tags/Sensitive.json",
          "PII.NonSensitive", "data/tags/NonSensitive.json");
  private final MigrationFile migrationFile;

  private final ConnectionType connectionType;
  public static final String FLYWAY_TABLE_NAME = "DATABASE_CHANGE_LOG";

  public MigrationUtil(ConnectionType connectionType, MigrationFile migrationFile) {
    this.connectionType = connectionType;
    this.migrationFile = migrationFile;
  }

  public static void migrateTestCaseDataContractReferences(CollectionDAO collectionDAO) {
    LOG.info("===== STARTING TEST CASE DATA CONTRACT MIGRATION =====");

    int totalTestCasesMigrated = 0;
    int dataContractsProcessed = 0;
    int pageSize = 1000;
    int offset = 0;

    try {
      // Step 1: Paginate through all data contracts using DAO
      while (true) {
        List<String> dataContractJsons =
            collectionDAO.dataContractDAO().listAfterWithOffset(pageSize, offset);
        if (dataContractJsons.isEmpty()) {
          break;
        }
        offset += pageSize;

        LOG.info(
            "Processing {} data contracts in batch (offset: {})",
            dataContractJsons.size(),
            offset - pageSize);

        for (String dataContractJson : dataContractJsons) {
          try {
            DataContract dataContract = JsonUtils.readValue(dataContractJson, DataContract.class);

            // Step 2: Filter - only process contracts with quality expectations
            if (nullOrEmpty(dataContract.getQualityExpectations())) {
              LOG.debug(
                  "Data contract {} has no quality expectations, skipping",
                  dataContract.getFullyQualifiedName());
              continue;
            }

            LOG.debug(
                "Processing data contract: {} (ID: {}) with {} quality expectations",
                dataContract.getFullyQualifiedName(),
                dataContract.getId(),
                dataContract.getQualityExpectations().size());
            dataContractsProcessed++;

            // Step 3: Process each test case in quality expectations
            int testCasesUpdated = 0;
            for (EntityReference testCaseRef : dataContract.getQualityExpectations()) {
              try {
                // Get test case using DAO
                TestCase testCase = collectionDAO.testCaseDAO().findEntityById(testCaseRef.getId());
                if (testCase == null) {
                  LOG.debug("Test case not found: {}", testCaseRef.getId());
                  continue;
                }

                // Check if test case already has dataContract reference
                if (testCase.getDataContract() != null) {
                  LOG.debug(
                      "Test case {} already has dataContract reference",
                      testCase.getFullyQualifiedName());
                  continue;
                }

                // Step 4: Update test case with dataContract reference using DAO
                testCase.setDataContract(
                    new EntityReference()
                        .withId(dataContract.getId())
                        .withType(Entity.DATA_CONTRACT)
                        .withFullyQualifiedName(dataContract.getFullyQualifiedName()));

                // Update the test case using DAO
                collectionDAO.testCaseDAO().update(testCase);
                testCasesUpdated++;

                LOG.debug(
                    "Updated test case {} with dataContract reference to {}",
                    testCase.getFullyQualifiedName(),
                    dataContract.getFullyQualifiedName());

              } catch (Exception e) {
                LOG.warn("Failed to update test case {}: {}", testCaseRef.getId(), e.getMessage());
              }
            }

            totalTestCasesMigrated += testCasesUpdated;

            if (testCasesUpdated > 0) {
              LOG.info(
                  "Updated {} test cases for data contract: {}",
                  testCasesUpdated,
                  dataContract.getFullyQualifiedName());
            }

          } catch (Exception e) {
            LOG.error("Failed to process data contract: {}", e.getMessage(), e);
          }
        }
      }

    } catch (Exception e) {
      LOG.error("Error during test case dataContract migration: {}", e.getMessage(), e);
      throw new RuntimeException("Migration failed", e);
    }

    LOG.info("===== TEST CASE DATA CONTRACT MIGRATION SUMMARY =====");
    LOG.info("Data contracts processed: {}", dataContractsProcessed);
    LOG.info("Total test cases updated with dataContract reference: {}", totalTestCasesMigrated);
    LOG.info("===== MIGRATION COMPLETE =====");
  }

  public Map<String, QueryStatus> setRecognizersForSensitiveTags(
      String queryTemplate, Handle handle, MigrationDAO migrationDAO, boolean isForceMigration) {
    Map<String, QueryStatus> result = new HashMap<>();
    List<LoadTags> loadTagsList;
    try {
      loadTagsList =
          EntityRepository.getEntitiesFromSeedData(
              CLASSIFICATION, ".*json/data/tags/piiTagsWithRecognizers.json$", LoadTags.class);
    } catch (IOException e) {
      LOG.error("Failed to load tag data");
      return result;
    }

    Map<String, List<Recognizer>> recognizersByTag = new HashMap<>();
    for (LoadTags loadTags : loadTagsList) {
      String classification = loadTags.getCreateClassification().getName();
      for (CreateTag createTag : loadTags.getCreateTags()) {
        if (createTag.getAutoClassificationEnabled())
          recognizersByTag.put(
              classification + "." + createTag.getName(), createTag.getRecognizers());
      }
    }

    recognizersByTag.forEach(
        (tagFqn, recognizers) -> {
          try {
            updateTagRecognizers(
                handle, migrationDAO, tagFqn, recognizers, result, queryTemplate, isForceMigration);
          } catch (Exception e) {
            LOG.error("Failed to update recognizers for tag: {}", tagFqn, e);
          }
        });

    return result;
  }

  private void updateTagRecognizers(
      Handle handle,
      MigrationDAO migrationDAO,
      String tagFqn,
      List<Recognizer> recognizers,
      Map<String, QueryStatus> results,
      String queryTemplate,
      Boolean isForceMigration) {
    String jsonContent = JsonUtils.pojoToJson(recognizers);

    String updateQuery = String.format(queryTemplate, jsonContent, tagFqn);

    String truncatedQuery =
        String.format(
            queryTemplate, String.format("[ ... data truncated for %s ... ]", tagFqn), tagFqn);

    try {
      handle.execute(queryTemplate, jsonContent, tagFqn);
      migrationDAO.upsertServerMigrationSQL(
          migrationFile.version, truncatedQuery, hash(truncatedQuery));
      results.put(
          updateQuery, new QueryStatus(QueryStatus.Status.SUCCESS, "Successfully Executed Query"));
    } catch (Exception e) {
      String message = String.format("Failed to run sql: [%s] due to [%s]", truncatedQuery, e);
      results.put(truncatedQuery, new QueryStatus(QueryStatus.Status.FAILURE, message));
      if (!isForceMigration) {
        throw new RuntimeException(message, e);
      }
    }
  }

  public boolean checkTableExists(Handle handle, String tableName) {
    String query =
        switch (connectionType) {
          case MYSQL -> "SELECT COUNT(*) FROM information_schema.tables "
              + "WHERE table_schema = DATABASE() AND table_name = ?";
          case POSTGRES -> "SELECT COUNT(*) FROM information_schema.tables "
              + "WHERE table_schema = current_schema() AND table_name = ?";
        };

    Integer count = handle.createQuery(query).bind(0, tableName).mapTo(Integer.class).one();

    return count > 0;
  }
}
