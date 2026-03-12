package org.openmetadata.service.migration.utils.v1130;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.entity.data.DataContract;
import org.openmetadata.schema.tests.TestCase;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;
import org.openmetadata.service.util.EntityUtil;

@Slf4j
public class MigrationUtil {
  private MigrationUtil() {}

  private static final String OLD_FIELD = "owners.name.keyword";
  private static final String NEW_FIELD = "ownerName";

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

  public static void migrateTestCaseDataContractReferences(CollectionDAO collectionDAO) {
    LOG.info("===== STARTING TEST CASE DATA CONTRACT MIGRATION =====");

    int totalTestCasesMigrated = 0;
    int dataContractsProcessed = 0;
    int pageSize = 1000;
    int offset = 0;

    try {
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

            int testCasesUpdated = 0;
            for (EntityReference testCaseRef : dataContract.getQualityExpectations()) {
              try {
                TestCase testCase =
                    collectionDAO.testCaseDAO().findEntityById(testCaseRef.getId());
                if (testCase == null) {
                  LOG.debug("Test case not found: {}", testCaseRef.getId());
                  continue;
                }

                if (testCase.getDataContract() != null) {
                  LOG.debug(
                      "Test case {} already has dataContract reference",
                      testCase.getFullyQualifiedName());
                  continue;
                }

                testCase.setDataContract(
                    new EntityReference()
                        .withId(dataContract.getId())
                        .withType(Entity.DATA_CONTRACT)
                        .withFullyQualifiedName(dataContract.getFullyQualifiedName()));

                collectionDAO.testCaseDAO().update(testCase);
                testCasesUpdated++;

                LOG.debug(
                    "Updated test case {} with dataContract reference to {}",
                    testCase.getFullyQualifiedName(),
                    dataContract.getFullyQualifiedName());

              } catch (Exception e) {
                LOG.warn(
                    "Failed to update test case {}: {}", testCaseRef.getId(), e.getMessage());
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
}
