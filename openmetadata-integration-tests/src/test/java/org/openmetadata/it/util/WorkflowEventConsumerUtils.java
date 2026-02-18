package org.openmetadata.it.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.openmetadata.schema.entity.events.EventSubscription;
import org.openmetadata.schema.entity.events.SubscriptionDestination;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.exceptions.ApiException;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class WorkflowEventConsumerUtils {

  private static final Logger LOG = LoggerFactory.getLogger(WorkflowEventConsumerUtils.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private WorkflowEventConsumerUtils() {}

  public static void ensureActive(OpenMetadataClient client) throws Exception {
    LOG.debug("Ensuring WorkflowEventConsumer subscription is active...");

    EventSubscription existing = null;
    try {
      existing = client.eventSubscriptions().getByName("WorkflowEventConsumer");
      LOG.info("WorkflowEventConsumer subscription found: enabled={}", existing.getEnabled());
    } catch (ApiException e) {
      if (e.getStatusCode() != 404) {
        throw e;
      }
      LOG.debug("WorkflowEventConsumer subscription not found, will create it");
    }

    Map<String, Object> destinationPayload = buildDestinationPayload();

    if (existing == null) {
      createSubscription(client, destinationPayload);
      return;
    }

    boolean needsEnable = !Boolean.TRUE.equals(existing.getEnabled());
    boolean needsDestinationConfig = !hasWorkflowDestinationConfig(existing);
    if (!needsEnable && !needsDestinationConfig) {
      return;
    }

    List<Map<String, Object>> patchOps = new ArrayList<>();
    if (needsEnable) {
      patchOps.add(
          Map.of(
              "op", "replace",
              "path", "/enabled",
              "value", true));
    }
    if (needsDestinationConfig) {
      patchOps.add(
          Map.of(
              "op", "replace",
              "path", "/destinations",
              "value", List.of(destinationPayload)));
    }

    try {
      JsonNode patch = MAPPER.valueToTree(patchOps);
      client.eventSubscriptions().patch(existing.getId(), patch);
      LOG.info(
          "Updated WorkflowEventConsumer subscription (enabled={}, destinationConfig={})",
          needsEnable,
          needsDestinationConfig);
    } catch (Exception patchError) {
      LOG.warn(
          "Failed to patch WorkflowEventConsumer, recreating subscription: {}",
          patchError.getMessage());
      client.eventSubscriptions().delete(existing.getId());
      createSubscription(client, destinationPayload);
    }
  }

  static boolean hasWorkflowDestinationConfig(EventSubscription subscription) {
    if (subscription.getDestinations() == null || subscription.getDestinations().isEmpty()) {
      return false;
    }
    for (SubscriptionDestination destination : subscription.getDestinations()) {
      if (destination.getType()
          != SubscriptionDestination.SubscriptionType.GOVERNANCE_WORKFLOW_CHANGE_EVENT) {
        continue;
      }
      Object config = destination.getConfig();
      if (config == null) {
        continue;
      }
      if (config instanceof Map<?, ?> map && map.isEmpty()) {
        continue;
      }
      return true;
    }
    return false;
  }

  private static Map<String, Object> buildDestinationPayload() {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("id", "fc9e7a84-5dbd-4e63-8b78-6c3a7bf04a60");
    payload.put("category", "External");
    payload.put("type", "GovernanceWorkflowChangeEvent");
    payload.put("config", Map.of("mode", "workflow"));
    payload.put("enabled", true);
    return payload;
  }

  private static void createSubscription(
      OpenMetadataClient client, Map<String, Object> destinationPayload) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", "WorkflowEventConsumer");
    body.put("displayName", "Workflow Event Consumer");
    body.put(
        "description",
        "Consumes EntityChange Events in order to trigger Workflows, if they exist.");
    body.put("alertType", "GovernanceWorkflowChangeEvent");
    body.put("resources", List.of("all"));
    body.put("provider", "system");
    body.put("pollInterval", 10);
    body.put("enabled", true);
    body.put("destinations", List.of(destinationPayload));

    client
        .getHttpClient()
        .executeForString(
            HttpMethod.POST, "/v1/events/subscriptions", body, RequestOptions.builder().build());
    LOG.info("Created WorkflowEventConsumer subscription");
  }
}
