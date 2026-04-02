package org.openmetadata.service.migration.utils.v1130;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.entity.data.Container;
import org.openmetadata.schema.entity.data.DashboardDataModel;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.tests.TestCase;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.ColumnUtil;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.ColumnNameHash;
import org.openmetadata.service.util.EntityUtil;

@Slf4j
public class MigrationUtil {
  private MigrationUtil() {}

  private static final String OLD_FIELD = "owners.name.keyword";
  private static final String NEW_FIELD = "ownerName";
  private static final int BATCH_SIZE = 1000;

  public static void migrateColumnFQNsToHashed(CollectionDAO collectionDAO) {
    migrateTableColumnFQNs(collectionDAO);
    migrateDashboardDataModelColumnFQNs(collectionDAO);
    migrateContainerColumnFQNs(collectionDAO);
    migrateTestCaseEntityLinks(collectionDAO);
  }

  private static void migrateTableColumnFQNs(CollectionDAO collectionDAO) {
    LOG.info("Starting migration of Table column FQNs to hashed format");
    int totalFixed = 0;
    int offset = 0;

    while (true) {
      List<String> jsonList = collectionDAO.tableDAO().listAfterWithOffset(BATCH_SIZE, offset);
      if (nullOrEmpty(jsonList)) {
        break;
      }

      for (String json : jsonList) {
        try {
          Table table = JsonUtils.readValue(json, Table.class);
          if (table == null || nullOrEmpty(table.getColumns())) {
            continue;
          }
          ColumnUtil.setColumnFQN(table.getFullyQualifiedName(), table.getColumns());
          collectionDAO.tableDAO().update(table);
          totalFixed++;
        } catch (Exception e) {
          LOG.warn("Error migrating Table column FQNs: {}", e.getMessage());
        }
      }

      offset += jsonList.size();
      if (jsonList.size() < BATCH_SIZE) {
        break;
      }
    }

    LOG.info("Migrated column FQNs to hashed format for {} Table entities", totalFixed);
  }

  private static void migrateDashboardDataModelColumnFQNs(CollectionDAO collectionDAO) {
    LOG.info("Starting migration of DashboardDataModel column FQNs to hashed format");
    int totalFixed = 0;
    int offset = 0;

    while (true) {
      List<String> jsonList =
          collectionDAO.dashboardDataModelDAO().listAfterWithOffset(BATCH_SIZE, offset);
      if (nullOrEmpty(jsonList)) {
        break;
      }

      for (String json : jsonList) {
        try {
          DashboardDataModel dataModel = JsonUtils.readValue(json, DashboardDataModel.class);
          if (dataModel == null || nullOrEmpty(dataModel.getColumns())) {
            continue;
          }
          ColumnUtil.setColumnFQN(dataModel.getFullyQualifiedName(), dataModel.getColumns());
          collectionDAO.dashboardDataModelDAO().update(dataModel);
          totalFixed++;
        } catch (Exception e) {
          LOG.warn("Error migrating DashboardDataModel column FQNs: {}", e.getMessage());
        }
      }

      offset += jsonList.size();
      if (jsonList.size() < BATCH_SIZE) {
        break;
      }
    }

    LOG.info(
        "Migrated column FQNs to hashed format for {} DashboardDataModel entities", totalFixed);
  }

  private static void migrateContainerColumnFQNs(CollectionDAO collectionDAO) {
    LOG.info("Starting migration of Container column FQNs to hashed format");
    int totalFixed = 0;
    int offset = 0;

    while (true) {
      List<String> jsonList = collectionDAO.containerDAO().listAfterWithOffset(BATCH_SIZE, offset);
      if (nullOrEmpty(jsonList)) {
        break;
      }

      for (String json : jsonList) {
        try {
          Container container = JsonUtils.readValue(json, Container.class);
          if (container == null
              || container.getDataModel() == null
              || nullOrEmpty(container.getDataModel().getColumns())) {
            continue;
          }
          ColumnUtil.setColumnFQN(
              container.getFullyQualifiedName(), container.getDataModel().getColumns());
          collectionDAO.containerDAO().update(container);
          totalFixed++;
        } catch (Exception e) {
          LOG.warn("Error migrating Container column FQNs: {}", e.getMessage());
        }
      }

      offset += jsonList.size();
      if (jsonList.size() < BATCH_SIZE) {
        break;
      }
    }

    LOG.info("Migrated column FQNs to hashed format for {} Container entities", totalFixed);
  }

  private static void migrateTestCaseEntityLinks(CollectionDAO collectionDAO) {
    LOG.info("Starting migration of TestCase entity links to use hashed column names");
    int totalFixed = 0;
    int offset = 0;

    while (true) {
      List<String> jsonList = collectionDAO.testCaseDAO().listAfterWithOffset(BATCH_SIZE, offset);
      if (nullOrEmpty(jsonList)) {
        break;
      }

      for (String json : jsonList) {
        try {
          TestCase testCase = JsonUtils.readValue(json, TestCase.class);
          if (testCase == null || testCase.getEntityLink() == null) {
            continue;
          }

          MessageParser.EntityLink entityLink =
              MessageParser.EntityLink.parse(testCase.getEntityLink());
          String arrayFieldName = entityLink.getArrayFieldName();
          if (arrayFieldName == null) {
            continue;
          }
          if (ColumnNameHash.isHashedColumnFQNSegment(arrayFieldName)) {
            continue;
          }
          String hashedFieldName = ColumnNameHash.hashColumnName(arrayFieldName);
          MessageParser.EntityLink updatedLink =
              new MessageParser.EntityLink(
                  entityLink.getEntityType(),
                  entityLink.getEntityFQN(),
                  entityLink.getFieldName(),
                  hashedFieldName,
                  entityLink.getArrayFieldValue());
          testCase.setEntityLink(updatedLink.getLinkString());
          collectionDAO.testCaseDAO().update(testCase);
          totalFixed++;
        } catch (Exception e) {
          LOG.warn("Error migrating TestCase entity link: {}", e.getMessage());
        }
      }

      offset += jsonList.size();
      if (jsonList.size() < BATCH_SIZE) {
        break;
      }
    }

    LOG.info("Migrated entity links to hashed column names for {} TestCase entities", totalFixed);
  }

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
}
