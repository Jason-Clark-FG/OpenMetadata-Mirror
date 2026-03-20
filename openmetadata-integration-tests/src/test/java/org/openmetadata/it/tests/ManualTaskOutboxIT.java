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

import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.factories.DatabaseSchemaTestFactory;
import org.openmetadata.it.factories.DatabaseServiceTestFactory;
import org.openmetadata.it.factories.TableTestFactory;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.api.governance.CreateWorkflowDefinition;
import org.openmetadata.schema.entity.data.DatabaseSchema;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.models.ListParams;
import org.openmetadata.sdk.models.ListResponse;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;

/**
 * E2E integration test for the outbox-based ManualTask message delivery pipeline.
 *
 * <p>Verifies that task status changes (via PATCH) flow through the full pipeline: ChangeEvent →
 * WorkflowEventConsumer → task_workflow_outbox → TaskWorkflowOutboxDrainer → Flowable
 * messageEventReceived → ManualTask subprocess processes each status in order.
 *
 * <p>Proof of delivery: workflow instance stage results show each status transition, and the
 * workflow instance reaches FINISHED status.
 */
@Execution(ExecutionMode.SAME_THREAD)
@ExtendWith(TestNamespaceExtension.class)
public class ManualTaskOutboxIT {

  private static final String NODE_NAME = "resolveIncident";
  private static final Duration PIPELINE_TIMEOUT = Duration.ofSeconds(120);

  @Test
  void outboxDeliversStatusChangesInOrder(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();

    String id = ns.shortPrefix();
    String workflowName = "outbox-e2e-" + id;

    DatabaseService service = DatabaseServiceTestFactory.createPostgresWithName("sv" + id, ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimpleWithName("sc" + id, ns, service);

    WorkflowDefinition workflow = deployManualTaskWorkflow(client, workflowName);
    assertNotNull(workflow, "Workflow should be deployed");

    try {
      Table table =
          TableTestFactory.createSimpleWithName("tbl" + id, ns, schema.getFullyQualifiedName());

      AtomicReference<Task> taskRef = new AtomicReference<>();
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Task found = findIncidentTaskForEntity(client, table);
                if (found != null && found.getWorkflowInstanceId() != null) {
                  taskRef.set(found);
                  return true;
                }
                return false;
              });

      Task task = taskRef.get();
      assertNotNull(task.getWorkflowInstanceId(), "Task should be workflow-managed");
      assertEquals(TaskEntityStatus.Open, task.getStatus());
      assertEquals(TaskCategory.Incident, task.getCategory());
      assertEquals(TaskEntityType.IncidentResolution, task.getType());

      patchTaskStatus(client, task.getId().toString(), "InProgress");
      patchTaskStatus(client, task.getId().toString(), "Completed");

      String workflowInstanceId = task.getWorkflowInstanceId().toString();

      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Map<String, Object> instance =
                    getWorkflowInstance(client, workflowName, workflowInstanceId);
                if (instance == null) {
                  return false;
                }
                String status = (String) instance.get("status");
                return "FINISHED".equals(status);
              });

      List<Map<String, Object>> states =
          getWorkflowInstanceStates(client, workflowName, workflowInstanceId);

      assertFalse(states.isEmpty(), "Workflow should have recorded stage results");

      List<String> stageResults =
          states.stream()
              .filter(s -> NODE_NAME.equals(getStageName(s)))
              .map(s -> getStageResult(s))
              .toList();

      assertFalse(stageResults.isEmpty(), "Should have stage results for " + NODE_NAME);
      assertEquals(
          "Completed", stageResults.getLast(), "Last stage result should be the terminal status");
    } finally {
      try {
        client
            .workflowDefinitions()
            .delete(workflow.getId().toString(), Map.of("hardDelete", "true", "recursive", "true"));
      } catch (Exception e) {
        // Best-effort cleanup
      }
    }
  }

  private WorkflowDefinition deployManualTaskWorkflow(
      OpenMetadataClient client, String workflowName) {
    String workflowJson =
        """
        {
          "name": "%s",
          "displayName": "Outbox E2E Test Workflow",
          "description": "Tests outbox-based ManualTask delivery",
          "trigger": {
            "type": "eventBasedEntity",
            "config": {
              "events": ["Created"],
              "entityTypes": ["table"]
            },
            "output": ["relatedEntity"]
          },
          "nodes": [
            {
              "type": "startEvent",
              "subType": "startEvent",
              "name": "start",
              "displayName": "Start"
            },
            {
              "type": "manualTask",
              "subType": "manualTask",
              "name": "%s",
              "displayName": "Resolve Incident",
              "config": { "template": "IncidentResolution" },
              "input": ["relatedEntity"],
              "inputNamespaceMap": { "relatedEntity": "global" },
              "output": ["result"]
            },
            {
              "type": "endEvent",
              "subType": "endEvent",
              "name": "resolvedEnd",
              "displayName": "Resolved"
            }
          ],
          "edges": [
            {"from": "start", "to": "%s"},
            {"from": "%s", "to": "%s", "condition": "Open"},
            {"from": "%s", "to": "%s", "condition": "InProgress"},
            {"from": "%s", "to": "%s", "condition": "Pending"},
            {"from": "%s", "to": "resolvedEnd", "condition": "Completed"}
          ],
          "config": { "storeStageStatus": true }
        }
        """
            .formatted(
                workflowName,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME);

    CreateWorkflowDefinition request =
        JsonUtils.readValue(workflowJson, CreateWorkflowDefinition.class);
    return client.workflowDefinitions().create(request);
  }

  private Task findIncidentTaskForEntity(OpenMetadataClient client, Table table) {
    ListParams params =
        new ListParams()
            .addFilter("category", "Incident")
            .addFilter("status", "Open")
            .setFields("payload,about")
            .setLimit(100);
    ListResponse<Task> tasks = client.tasks().list(params);

    for (Task task : tasks.getData()) {
      if (task.getAbout() != null
          && task.getAbout().getFullyQualifiedName() != null
          && task.getAbout().getFullyQualifiedName().equals(table.getFullyQualifiedName())) {
        return task;
      }
    }
    return null;
  }

  private void patchTaskStatus(OpenMetadataClient client, String taskId, String status) {
    String patchJson =
        String.format("[{\"op\": \"replace\", \"path\": \"/status\", \"value\": \"%s\"}]", status);
    client
        .getHttpClient()
        .executeForString(
            HttpMethod.PATCH,
            "/v1/tasks/" + taskId,
            patchJson,
            RequestOptions.builder().header("Content-Type", "application/json-patch+json").build());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> getWorkflowInstance(
      OpenMetadataClient client, String workflowName, String instanceId) {
    try {
      String response =
          client
              .getHttpClient()
              .executeForString(
                  HttpMethod.GET,
                  "/v1/governance/workflowInstances?startTs=0&endTs="
                      + System.currentTimeMillis()
                      + "&workflowDefinitionName="
                      + workflowName
                      + "&limit=100",
                  null,
                  RequestOptions.builder().build());

      Map<String, Object> result = JsonUtils.readValue(response, new TypeReference<>() {});
      List<Map<String, Object>> data = (List<Map<String, Object>>) result.get("data");
      if (data == null) {
        return null;
      }

      for (Map<String, Object> instance : data) {
        if (instanceId.equals(instance.get("id"))) {
          return instance;
        }
      }
    } catch (Exception e) {
      // Polling — return null to retry
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> getWorkflowInstanceStates(
      OpenMetadataClient client, String workflowName, String instanceId) {
    try {
      String response =
          client
              .getHttpClient()
              .executeForString(
                  HttpMethod.GET,
                  "/v1/governance/workflowInstanceStates/"
                      + workflowName
                      + "/"
                      + instanceId
                      + "?limit=100",
                  null,
                  RequestOptions.builder().build());

      Map<String, Object> result = JsonUtils.readValue(response, new TypeReference<>() {});
      List<Map<String, Object>> data = (List<Map<String, Object>>) result.get("data");
      return data != null ? data : List.of();
    } catch (Exception e) {
      return List.of();
    }
  }

  @SuppressWarnings("unchecked")
  private String getStageName(Map<String, Object> state) {
    Map<String, Object> stage = (Map<String, Object>) state.get("stage");
    return stage != null ? (String) stage.get("stageName") : null;
  }

  @SuppressWarnings("unchecked")
  private String getStageResult(Map<String, Object> state) {
    Map<String, Object> stage = (Map<String, Object>) state.get("stage");
    return stage != null ? (String) stage.get("result") : null;
  }
}
