package org.openmetadata.service.migration.utils.v1126;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.Handle;
import org.openmetadata.schema.entity.data.Chart;
import org.openmetadata.schema.entity.services.DashboardService;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.util.FullyQualifiedName;

/**
 * Migration to fix FQN collisions in Superset ingestion.
 *
 * <p>Superset uses independent auto-incrementing integer IDs for Dashboards and Charts. Before this
 * fix, both entity types used the raw ID as their name (e.g., name="1"), causing Dashboard ID 1
 * and Chart ID 1 to collide on FQN "superset.1". This migration renames existing chart entities
 * from the old numeric name (e.g., "1") to a prefixed name (e.g., "chart_1").
 */
@Slf4j
public class MigrationUtil {

  private static final int BATCH_SIZE = 100;

  private MigrationUtil() {}

  public static void fixSupersetFqnCollision(Handle handle, CollectionDAO collectionDAO) {
    LOG.info("Starting migration to fix Superset FQN collisions (dashboard/chart ID ambiguity)");

    List<DashboardService> supersetServices = findSupersetServices(collectionDAO);
    if (supersetServices.isEmpty()) {
      LOG.info("No Superset services found. Skipping.");
      return;
    }
    LOG.info("Found {} Superset service(s) to process", supersetServices.size());

    int fixedCount = 0;
    for (DashboardService service : supersetServices) {
      fixedCount += fixChartFqns(collectionDAO, service);
    }

    LOG.info("Fixed {} Superset chart entities with FQN collisions", fixedCount);
  }

  private static List<DashboardService> findSupersetServices(CollectionDAO collectionDAO) {
    List<DashboardService> supersetServices = new ArrayList<>();
    int offset = 0;

    while (true) {
      List<String> jsons =
          collectionDAO
              .dashboardServiceDAO()
              .listAfterWithOffset("dashboard_service_entity", BATCH_SIZE, offset);
      if (jsons.isEmpty()) {
        break;
      }
      for (String json : jsons) {
        DashboardService service = JsonUtils.readValue(json, DashboardService.class);
        if (service != null && "Superset".equals(service.getServiceType().value())) {
          supersetServices.add(service);
        }
      }
      if (jsons.size() < BATCH_SIZE) {
        break;
      }
      offset += BATCH_SIZE;
    }

    return supersetServices;
  }

  private static int fixChartFqns(CollectionDAO collectionDAO, DashboardService service) {
    int fixedCount = 0;
    String serviceFqn = service.getFullyQualifiedName();

    Set<UUID> chartIds =
        findChildEntityIds(collectionDAO, service.getId(), Entity.DASHBOARD_SERVICE, Entity.CHART);

    for (UUID chartId : chartIds) {
      try {
        Chart chart = collectionDAO.chartDAO().findEntityById(chartId);
        if (chart == null) {
          continue;
        }
        String name = chart.getName();
        if (!isPurelyNumeric(name)) {
          continue;
        }
        String newName = "chart_" + name;
        String newFqn = FullyQualifiedName.add(serviceFqn, newName);
        LOG.debug("Fixing Chart FQN: {} -> {}", chart.getFullyQualifiedName(), newFqn);
        chart.setName(newName);
        chart.setFullyQualifiedName(newFqn);
        collectionDAO.chartDAO().update(chart);
        fixedCount++;
      } catch (Exception e) {
        LOG.warn("Error processing Chart entity {}: {}", chartId, e.getMessage());
      }
    }

    return fixedCount;
  }

  private static Set<UUID> findChildEntityIds(
      CollectionDAO collectionDAO, UUID parentId, String fromType, String toType) {
    List<CollectionDAO.EntityRelationshipRecord> records =
        collectionDAO
            .relationshipDAO()
            .findTo(parentId, fromType, Relationship.CONTAINS.ordinal(), toType);
    return records.stream()
        .map(CollectionDAO.EntityRelationshipRecord::getId)
        .collect(java.util.stream.Collectors.toSet());
  }

  private static boolean isPurelyNumeric(String name) {
    return name != null && name.matches("\\d+");
  }
}
