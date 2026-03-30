package org.openmetadata.service.governance.workflows.outbox;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OutboxEntry {
  private String id;
  private String taskId;
  private String status;
  private String updatedBy;
  private long createdAt;
  private boolean delivered;
  private int attempts;
  private Long lastAttemptAt;
}
