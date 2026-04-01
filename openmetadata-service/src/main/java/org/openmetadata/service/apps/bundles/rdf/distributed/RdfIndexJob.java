package org.openmetadata.service.apps.bundles.rdf.distributed;

import java.util.Map;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.With;
import org.openmetadata.schema.system.EventPublisherJob;
import org.openmetadata.service.apps.bundles.searchIndex.distributed.IndexJobStatus;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@With
public class RdfIndexJob {
  private UUID id;
  private IndexJobStatus status;
  private EventPublisherJob jobConfiguration;
  private long totalRecords;
  private long processedRecords;
  private long successRecords;
  private long failedRecords;
  private Map<String, EntityTypeStats> entityStats;
  private Map<String, ServerStats> serverStats;
  private String createdBy;
  private long createdAt;
  private Long startedAt;
  private Long completedAt;
  private long updatedAt;
  private String errorMessage;

  public boolean isTerminal() {
    return status == IndexJobStatus.COMPLETED
        || status == IndexJobStatus.COMPLETED_WITH_ERRORS
        || status == IndexJobStatus.FAILED
        || status == IndexJobStatus.STOPPED;
  }

  @Data
  @Builder(toBuilder = true)
  @NoArgsConstructor
  @AllArgsConstructor
  public static class EntityTypeStats {
    private String entityType;
    private long totalRecords;
    private long processedRecords;
    private long successRecords;
    private long failedRecords;
    private int totalPartitions;
    private int completedPartitions;
    private int failedPartitions;
  }

  @Data
  @Builder(toBuilder = true)
  @NoArgsConstructor
  @AllArgsConstructor
  public static class ServerStats {
    private String serverId;
    private long processedRecords;
    private long successRecords;
    private long failedRecords;
    private int totalPartitions;
    private int completedPartitions;
    private int processingPartitions;
  }
}
