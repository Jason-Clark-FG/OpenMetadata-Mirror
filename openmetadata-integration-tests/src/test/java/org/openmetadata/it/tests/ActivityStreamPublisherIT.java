/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.api.domains.CreateDomain;
import org.openmetadata.schema.api.teams.CreateUser;
import org.openmetadata.schema.entity.activity.ActivityEvent;
import org.openmetadata.schema.entity.domains.Domain;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.Paging;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;

/** Regression guards for the activity-stream publisher: dotted entity names and hard-deleted actors. */
@Execution(ExecutionMode.CONCURRENT)
@ExtendWith(TestNamespaceExtension.class)
public class ActivityStreamPublisherIT {

  private static final String ACTIVITY_PATH = "/v1/activity";
  private static final ObjectMapper MAPPER =
      new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  // Worker polls change_event every 30s; allow two cycles + processing slack.
  private static final Duration POLL_TIMEOUT = Duration.ofSeconds(90);
  private static final Duration POLL_INTERVAL = Duration.ofSeconds(5);

  @Test
  void test_dotted_entity_name_publishes_without_parse_error(TestNamespace ns) {
    // Dotted name forces a quoted FQN — pre-fix this bailed the FQN parser.
    String dottedName = ns.uniqueShortId() + ".with.dots";
    Domain domain =
        SdkClients.adminClient()
            .domains()
            .create(
                new CreateDomain()
                    .withName(dottedName)
                    .withDomainType(CreateDomain.DomainType.AGGREGATE)
                    .withDescription("regression guard for activity_stream Bug 1"));

    awaitActivityEvent(
        SdkClients.adminClient(),
        "domain",
        domain.getId().toString(),
        e -> "EntityCreated".equals(String.valueOf(e.getEventType())));
  }

  @Test
  void test_hard_deleted_actor_publishes_with_null_actorId(TestNamespace ns) {
    // Target survives; actor is the one we delete (the publisher skips events whose entity is gone).
    Domain target =
        SdkClients.adminClient()
            .domains()
            .create(
                new CreateDomain()
                    .withName(ns.prefix("bug2-target"))
                    .withDomainType(CreateDomain.DomainType.AGGREGATE)
                    .withDescription("regression guard target — survives ghost deletion"));

    String userName = "ghost-" + ns.uniqueShortId();
    String email = userName + "@test.openmetadata.org";
    User ghost =
        SdkClients.adminClient()
            .users()
            .create(new CreateUser().withName(userName).withEmail(email).withIsAdmin(true));

    // PATCH as ghost so the resulting change_event has userName=ghost.
    OpenMetadataClient ghostClient =
        SdkClients.createClient(userName, email, new String[] {"Admin"});
    ghostClient
        .getHttpClient()
        .executeForString(
            HttpMethod.PATCH,
            "/v1/domains/" + target.getId(),
            "[{\"op\":\"replace\",\"path\":\"/description\",\"value\":\"patched by "
                + userName
                + "\"}]",
            RequestOptions.builder().header("Content-Type", "application/json-patch+json").build());

    // Hard-delete the actor — buildActorReference will catch EntityNotFoundException at processing time.
    Map<String, String> hardDelete = new HashMap<>();
    hardDelete.put("hardDelete", "true");
    hardDelete.put("recursive", "true");
    SdkClients.adminClient().users().delete(ghost.getId().toString(), hardDelete);

    ActivityEvent landed =
        awaitActivityEvent(
            SdkClients.adminClient(),
            "domain",
            target.getId().toString(),
            e ->
                e.getActor() != null
                    && userName.equals(e.getActor().getName())
                    && e.getActor().getId() == null);

    assertNotNull(landed.getActor());
    assertEquals(userName, landed.getActor().getName());
    assertNull(landed.getActor().getId());
  }

  private ActivityEvent awaitActivityEvent(
      OpenMetadataClient client,
      String entityType,
      String entityId,
      java.util.function.Predicate<ActivityEvent> predicate) {
    Optional<ActivityEvent> result =
        Awaitility.await("activity_stream event for " + entityType + " " + entityId)
            .atMost(POLL_TIMEOUT)
            .pollInterval(POLL_INTERVAL)
            .ignoreExceptions()
            .until(
                () ->
                    getEntityActivity(client, entityType, entityId).stream()
                        .filter(predicate)
                        .findFirst(),
                Optional::isPresent);
    assertTrue(result.isPresent(), "Expected at least one matching activity_stream event");
    return result.get();
  }

  private List<ActivityEvent> getEntityActivity(
      OpenMetadataClient client, String entityType, String entityId) throws Exception {
    RequestOptions options =
        RequestOptions.builder().queryParam("limit", "50").queryParam("days", "1").build();
    String response =
        client
            .getHttpClient()
            .executeForString(
                HttpMethod.GET,
                ACTIVITY_PATH + "/entity/" + entityType + "/" + entityId,
                null,
                options);
    return MAPPER.readValue(response, ActivityEventList.class).getData();
  }

  /** Local response shape mirror — keeps this IT self-contained. */
  public static class ActivityEventList {
    @JsonProperty("data")
    private List<ActivityEvent> data;

    @JsonProperty("paging")
    private Paging paging;

    public List<ActivityEvent> getData() {
      return data;
    }

    public void setData(List<ActivityEvent> data) {
      this.data = data;
    }

    public Paging getPaging() {
      return paging;
    }

    public void setPaging(Paging paging) {
      this.paging = paging;
    }
  }
}
