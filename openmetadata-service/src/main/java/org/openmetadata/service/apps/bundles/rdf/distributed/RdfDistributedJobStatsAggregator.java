package org.openmetadata.service.apps.bundles.rdf.distributed;

import org.openmetadata.schema.system.EntityStats;
import org.openmetadata.schema.system.Stats;
import org.openmetadata.schema.system.StepStats;

public class RdfDistributedJobStatsAggregator {
  public Stats toStats(RdfIndexJob job) {
    Stats stats = new Stats();
    stats.setEntityStats(new EntityStats());

    StepStats jobStats =
        new StepStats()
            .withTotalRecords(safeToInt(job.getTotalRecords()))
            .withSuccessRecords(safeToInt(job.getSuccessRecords()))
            .withFailedRecords(safeToInt(job.getFailedRecords()));
    stats.setJobStats(jobStats);

    if (job.getEntityStats() != null) {
      job.getEntityStats()
          .forEach(
              (entityType, entityStats) ->
                  stats
                      .getEntityStats()
                      .setAdditionalProperty(
                          entityType,
                          new StepStats()
                              .withTotalRecords(safeToInt(entityStats.getTotalRecords()))
                              .withSuccessRecords(safeToInt(entityStats.getSuccessRecords()))
                              .withFailedRecords(safeToInt(entityStats.getFailedRecords()))));
    }

    return stats;
  }

  private int safeToInt(long value) {
    if (value > Integer.MAX_VALUE) {
      return Integer.MAX_VALUE;
    }
    if (value < Integer.MIN_VALUE) {
      return Integer.MIN_VALUE;
    }
    return (int) value;
  }
}
