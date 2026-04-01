package org.openmetadata.service.apps.bundles.rdf.distributed;

import java.util.UUID;
import lombok.Builder;
import lombok.Data;
import lombok.With;
import org.openmetadata.service.apps.bundles.searchIndex.distributed.PartitionStatus;

@Data
@Builder(toBuilder = true)
@With
public class RdfIndexPartition {
  private UUID id;
  private UUID jobId;
  private String entityType;
  private int partitionIndex;
  private long rangeStart;
  private long rangeEnd;
  private long estimatedCount;
  private long workUnits;
  private int priority;
  private PartitionStatus status;
  private long cursor;
  private long processedCount;
  private long successCount;
  private long failedCount;
  private String assignedServer;
  private Long claimedAt;
  private Long startedAt;
  private Long completedAt;
  private Long lastUpdateAt;
  private String lastError;
  private int retryCount;
  private long claimableAt;
}
