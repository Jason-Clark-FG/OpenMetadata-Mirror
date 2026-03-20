package org.openmetadata.service.governance.workflows.elements.triggers.impl;

import static org.openmetadata.service.apps.bundles.changeEvent.AbstractEventConsumer.OFFSET_EXTENSION;
import static org.openmetadata.service.governance.workflows.elements.triggers.impl.FetchChangeEventsImpl.MAX_PROCESSED_OFFSET_VARIABLE;
import static org.openmetadata.service.governance.workflows.elements.triggers.impl.FetchChangeEventsImpl.buildConsumerId;

import lombok.extern.slf4j.Slf4j;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.schema.entity.events.EventSubscriptionOffset;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;

@Slf4j
public class CommitChangeEventOffsetImpl implements JavaDelegate {

  private static final String OFFSET_JSON_SCHEMA = "eventSubscriptionOffset";

  private Expression workflowFqnExpr;
  private Expression entityTypeExpr;

  @Override
  public void execute(DelegateExecution execution) {
    String workflowFqn = (String) workflowFqnExpr.getValue(execution);
    String entityType = (String) entityTypeExpr.getValue(execution);
    String consumerId = buildConsumerId(workflowFqn, entityType);

    Long maxProcessedOffset = (Long) execution.getVariable(MAX_PROCESSED_OFFSET_VARIABLE);
    if (maxProcessedOffset == null) {
      LOG.debug(
          "No events processed for workflow '{}' entity type '{}'. Offset not updated.",
          workflowFqn,
          entityType);
      return;
    }

    String existingJson =
        Entity.getCollectionDAO()
            .eventSubscriptionDAO()
            .getSubscriberExtension(consumerId, OFFSET_EXTENSION);

    if (existingJson != null) {
      EventSubscriptionOffset existing =
          JsonUtils.readValue(existingJson, EventSubscriptionOffset.class);
      if (existing.getCurrentOffset() >= maxProcessedOffset) {
        LOG.debug(
            "Stored offset {} >= processed offset {} for workflow '{}'. No update needed.",
            existing.getCurrentOffset(),
            maxProcessedOffset,
            workflowFqn);
        return;
      }
    }

    EventSubscriptionOffset newOffset =
        new EventSubscriptionOffset()
            .withStartingOffset(maxProcessedOffset)
            .withCurrentOffset(maxProcessedOffset)
            .withTimestamp(System.currentTimeMillis());

    Entity.getCollectionDAO()
        .eventSubscriptionDAO()
        .upsertSubscriberExtension(
            consumerId, OFFSET_EXTENSION, OFFSET_JSON_SCHEMA, JsonUtils.pojoToJson(newOffset));

    LOG.info(
        "Committed offset {} for workflow '{}' entity type '{}'.",
        maxProcessedOffset,
        workflowFqn,
        entityType);
  }
}
