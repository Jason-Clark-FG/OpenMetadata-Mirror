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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import org.openmetadata.schema.tests.TestCase;
import org.openmetadata.schema.tests.type.TestCaseResolutionStatus;
import org.openmetadata.schema.tests.type.TestCaseResolutionStatusTypes;
import org.openmetadata.schema.tests.type.TestCaseStatus;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.fluent.builders.TestCaseBuilder;
import org.openmetadata.sdk.models.ListParams;
import org.openmetadata.sdk.models.ListResponse;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;

/**
 * E2E integration test for the outbox-based ManualTask message delivery pipeline and incident TCRS
 * sync.
 *
 * <p>Verifies that task status changes (via PATCH) flow through the full pipeline: ChangeEvent →
 * WorkflowEventConsumer → task_workflow_outbox → TaskWorkflowOutboxDrainer → Flowable
 * messageEventReceived → ManualTask subprocess processes each status in order.
 *
 * <p>Also verifies the IncidentTcrsSyncHandler: when a workflow creates an incident Task with
 * aboutEntityLink, status changes are synced to TCRS records (Task → TCRS Strangler Fig bridge).
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
  void outboxDeliversStatusChangesInOrder_andSyncsTcrs(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();

    String id = ns.shortPrefix();
    String workflowName = "outbox-e2e-" + id;

    DatabaseService service = DatabaseServiceTestFactory.createPostgresWithName("sv" + id, ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimpleWithName("sc" + id, ns, service);
    Table table =
        TableTestFactory.createSimpleWithName("tbl" + id, ns, schema.getFullyQualifiedName());

    // Deploy workflow and wait for Flowable to confirm the process definition is ready.
    // The ChangeEvent consumer processes events in offset order — if we trigger
    // the test failure before Flowable has the signal start event registered,
    // the testCase-entityUpdated signal fires but no process catches it.
    // Create TestCase BEFORE deploying workflow — the testCase-entityCreated ChangeEvent
    // will be consumed before the workflow exists, avoiding spurious triggers.
    TestCase testCase =
        TestCaseBuilder.create(client)
            .name("tc" + id)
            .forTable(table)
            .testDefinition("tableRowCountToEqual")
            .parameter("value", "100")
            .create();

    WorkflowDefinition workflow = deployManualTaskWorkflow(client, workflowName);
    assertNotNull(workflow, "Workflow should be deployed");
    waitForWorkflowDeployed(client, workflowName);

    try {
      // Trigger: fail the test → ChangeEventHandler creates a testCase-entityUpdated ChangeEvent
      // (via getChangeEventForEntityTimeSeries which resolves TestCaseResult → parent TestCase).
      createFailedTestResult(client, testCase);

      AtomicReference<Task> taskRef = new AtomicReference<>();
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Task found = findIncidentTaskForTestCase(client, testCase);
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

      // Verify aboutEntityLink encodes testCase FQN + incident stateId
      String aboutLink = task.getAboutEntityLink();
      assertNotNull(aboutLink, "aboutEntityLink should be populated");
      assertTrue(aboutLink.contains("testCase"), "Should reference testCase entity type");
      assertTrue(aboutLink.contains("incidents"), "Should contain incidents field");
      assertTrue(
          aboutLink.contains(testCase.getFullyQualifiedName()), "Should contain the testCase FQN");

      // Get stateId from TestCase for TCRS verification
      TestCase updatedTc =
          client.testCases().getByName(testCase.getFullyQualifiedName(), "incidentId");
      UUID stateId = updatedTc.getIncidentId();
      assertNotNull(stateId, "TestCase should have incidentId set from test failure");
      assertTrue(aboutLink.contains(stateId.toString()), "Should contain the incident stateId");

      patchTaskStatus(client, task.getId().toString(), "InProgress");

      // Verify TCRS(Ack) synced by handler (async — poll)
      await()
          .atMost(Duration.ofSeconds(30))
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () ->
                  listTcrsForStateId(client, stateId).stream()
                      .anyMatch(
                          r ->
                              r.getTestCaseResolutionStatusType()
                                  == TestCaseResolutionStatusTypes.Ack));

      patchTaskStatus(client, task.getId().toString(), "Completed");

      String workflowInstanceId = task.getWorkflowInstanceId().toString();

      // Workflow reaching FINISHED proves the full outbox pipeline delivered the terminal status
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
                return "FINISHED".equals(instance.get("status"));
              });

      // Task resolution proves CloseTaskDelegate ran inside Flowable
      Task resolvedTask = client.tasks().get(task.getId().toString(), "resolution");
      assertNotNull(resolvedTask.getResolution(), "CloseTaskDelegate should have set resolution");

      // Verify TCRS(Resolved) synced by handler
      await()
          .atMost(Duration.ofSeconds(30))
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () ->
                  listTcrsForStateId(client, stateId).stream()
                      .anyMatch(
                          r ->
                              r.getTestCaseResolutionStatusType()
                                  == TestCaseResolutionStatusTypes.Resolved));

      // Final TCRS verification: all expected records exist
      List<TestCaseResolutionStatus> allRecords = listTcrsForStateId(client, stateId);
      assertTrue(
          allRecords.stream()
              .anyMatch(
                  r -> r.getTestCaseResolutionStatusType() == TestCaseResolutionStatusTypes.New),
          "TCRS(New) should exist from initial test failure");
      assertTrue(
          allRecords.stream()
              .anyMatch(
                  r -> r.getTestCaseResolutionStatusType() == TestCaseResolutionStatusTypes.Ack),
          "TCRS(Ack) should be synced from Task InProgress");
      assertTrue(
          allRecords.stream()
              .anyMatch(
                  r ->
                      r.getTestCaseResolutionStatusType()
                          == TestCaseResolutionStatusTypes.Resolved),
          "TCRS(Resolved) should be synced from Task Completed");

      // Count ManualTask subprocess entries
      List<Map<String, Object>> states =
          getWorkflowInstanceStates(client, workflowName, workflowInstanceId);
      long manualTaskEntries =
          states.stream().filter(s -> NODE_NAME.equals(getStageName(s))).count();
      assertEquals(
          3,
          manualTaskEntries,
          "ManualTask subprocess should be entered 3 times (Open, InProgress, Completed cycles)");
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

  @Test
  void onConflict_restart_terminatesOldWorkflow(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();
    String id = ns.shortPrefix();
    String workflowName = "restart-e2e-" + id;

    DatabaseService service = DatabaseServiceTestFactory.createPostgresWithName("sv" + id, ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimpleWithName("sc" + id, ns, service);
    Table table =
        TableTestFactory.createSimpleWithName("tbl" + id, ns, schema.getFullyQualifiedName());
    TestCase testCase =
        TestCaseBuilder.create(client)
            .name("tc" + id)
            .forTable(table)
            .testDefinition("tableRowCountToEqual")
            .parameter("value", "100")
            .create();

    WorkflowDefinition workflow =
        deployManualTaskWorkflowWithPolicy(client, workflowName, "restart", false);
    assertNotNull(workflow);
    waitForWorkflowDeployed(client, workflowName);

    try {
      createFailedTestResult(client, testCase);

      AtomicReference<Task> firstTaskRef = new AtomicReference<>();
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Task found = findIncidentTaskForTestCase(client, testCase);
                if (found != null && found.getWorkflowInstanceId() != null) {
                  firstTaskRef.set(found);
                  return true;
                }
                return false;
              });

      UUID firstWorkflowInstanceId = firstTaskRef.get().getWorkflowInstanceId();
      assertNotNull(firstWorkflowInstanceId);

      patchTestCaseDescription(client, testCase, "Updated to trigger retrigger");

      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Map<String, Object> instance =
                    getWorkflowInstance(client, workflowName, firstWorkflowInstanceId.toString());
                if (instance == null) return false;
                return "FAILURE".equals(instance.get("status"));
              });

      Map<String, Object> terminated =
          getWorkflowInstance(client, workflowName, firstWorkflowInstanceId.toString());
      assertEquals(
          "FAILURE", terminated.get("status"), "Old workflow should be terminated on restart");
    } finally {
      deleteWorkflow(client, workflow);
    }
  }

  @Test
  void onConflict_skip_keepsExistingWorkflow(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();
    String id = ns.shortPrefix();
    String workflowName = "skip-e2e-" + id;

    DatabaseService service = DatabaseServiceTestFactory.createPostgresWithName("sv" + id, ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimpleWithName("sc" + id, ns, service);
    Table table =
        TableTestFactory.createSimpleWithName("tbl" + id, ns, schema.getFullyQualifiedName());
    TestCase testCase =
        TestCaseBuilder.create(client)
            .name("tc" + id)
            .forTable(table)
            .testDefinition("tableRowCountToEqual")
            .parameter("value", "100")
            .create();

    WorkflowDefinition workflow =
        deployManualTaskWorkflowWithPolicy(client, workflowName, "skip", false);
    assertNotNull(workflow);
    waitForWorkflowDeployed(client, workflowName);

    try {
      createFailedTestResult(client, testCase);

      AtomicReference<Task> taskRef = new AtomicReference<>();
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Task found = findIncidentTaskForTestCase(client, testCase);
                if (found != null && found.getWorkflowInstanceId() != null) {
                  taskRef.set(found);
                  return true;
                }
                return false;
              });

      Task originalTask = taskRef.get();
      UUID originalWorkflowInstanceId = originalTask.getWorkflowInstanceId();

      String retriggerDesc = "skip-retrigger-" + System.currentTimeMillis();
      patchTestCaseDescription(client, testCase, retriggerDesc);

      // Wait for the patch to be visible — proves the ChangeEvent pipeline processed the update
      await()
          .atMost(Duration.ofSeconds(30))
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                TestCase tc =
                    client.testCases().getByName(testCase.getFullyQualifiedName(), "description");
                return retriggerDesc.equals(tc.getDescription());
              });

      // Now verify the instance count is still 1 (skip policy kept the old, didn't start new)
      await()
          .during(Duration.ofSeconds(10))
          .atMost(Duration.ofSeconds(15))
          .pollInterval(Duration.ofSeconds(2))
          .until(() -> countWorkflowInstances(client, workflowName) == 1);

      Task sameTask = findIncidentTaskForTestCase(client, testCase);
      assertNotNull(sameTask);
      assertEquals(
          originalTask.getId(), sameTask.getId(), "Task should be the same after second trigger");
      assertEquals(
          originalWorkflowInstanceId,
          sameTask.getWorkflowInstanceId(),
          "Workflow instance should be unchanged");

      Map<String, Object> instance =
          getWorkflowInstance(client, workflowName, originalWorkflowInstanceId.toString());
      assertEquals("RUNNING", instance.get("status"), "Original workflow should still be running");

      patchTaskStatus(client, originalTask.getId().toString(), "Completed");

      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Map<String, Object> inst =
                    getWorkflowInstance(
                        client, workflowName, originalWorkflowInstanceId.toString());
                return inst != null && "FINISHED".equals(inst.get("status"));
              });
    } finally {
      deleteWorkflow(client, workflow);
    }
  }

  @Test
  void onConflict_forward_deliversRetriggerToManualTask(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();
    String id = ns.shortPrefix();
    String workflowName = "fwd-e2e-" + id;

    DatabaseService service = DatabaseServiceTestFactory.createPostgresWithName("sv" + id, ns);
    DatabaseSchema schema = DatabaseSchemaTestFactory.createSimpleWithName("sc" + id, ns, service);
    Table table =
        TableTestFactory.createSimpleWithName("tbl" + id, ns, schema.getFullyQualifiedName());
    TestCase testCase =
        TestCaseBuilder.create(client)
            .name("tc" + id)
            .forTable(table)
            .testDefinition("tableRowCountToEqual")
            .parameter("value", "100")
            .create();

    WorkflowDefinition workflow =
        deployManualTaskWorkflowWithPolicy(client, workflowName, "forward", true);
    assertNotNull(workflow);
    waitForWorkflowDeployed(client, workflowName);

    try {
      createFailedTestResult(client, testCase);

      AtomicReference<Task> taskRef = new AtomicReference<>();
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Task found = findIncidentTaskForTestCase(client, testCase);
                if (found != null && found.getWorkflowInstanceId() != null) {
                  taskRef.set(found);
                  return true;
                }
                return false;
              });

      Task originalTask = taskRef.get();
      UUID originalWorkflowInstanceId = originalTask.getWorkflowInstanceId();

      List<Map<String, Object>> statesBefore =
          getWorkflowInstanceStates(client, workflowName, originalWorkflowInstanceId.toString());
      long entriesBefore =
          statesBefore.stream().filter(s -> NODE_NAME.equals(getStageName(s))).count();

      patchTestCaseDescription(client, testCase, "Updated to trigger retrigger");

      // Wait for retrigger to be delivered — ManualTask subprocess re-entered
      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                List<Map<String, Object>> states =
                    getWorkflowInstanceStates(
                        client, workflowName, originalWorkflowInstanceId.toString());
                long entries =
                    states.stream().filter(s -> NODE_NAME.equals(getStageName(s))).count();
                return entries > entriesBefore;
              });

      Map<String, Object> instance =
          getWorkflowInstance(client, workflowName, originalWorkflowInstanceId.toString());
      assertEquals("RUNNING", instance.get("status"), "Same workflow should still be running");

      Task sameTask = findIncidentTaskForTestCase(client, testCase);
      assertEquals(originalTask.getId(), sameTask.getId(), "Same task after retrigger");
      assertEquals(TaskEntityStatus.Open, sameTask.getStatus(), "Task still open after retrigger");
      assertEquals(1, countWorkflowInstances(client, workflowName), "Only one workflow instance");

      patchTaskStatus(client, originalTask.getId().toString(), "Completed");

      await()
          .atMost(PIPELINE_TIMEOUT)
          .pollInterval(Duration.ofSeconds(2))
          .until(
              () -> {
                Map<String, Object> inst =
                    getWorkflowInstance(
                        client, workflowName, originalWorkflowInstanceId.toString());
                return inst != null && "FINISHED".equals(inst.get("status"));
              });
    } finally {
      deleteWorkflow(client, workflow);
    }
  }

  private void deleteWorkflow(OpenMetadataClient client, WorkflowDefinition workflow) {
    try {
      client
          .workflowDefinitions()
          .delete(workflow.getId().toString(), Map.of("hardDelete", "true", "recursive", "true"));
    } catch (Exception e) {
      // Best-effort cleanup
    }
  }

  private WorkflowDefinition deployManualTaskWorkflow(
      OpenMetadataClient client, String workflowName) {
    String workflowJson =
        """
        {
          "name": "%s",
          "displayName": "Outbox E2E Test Workflow",
          "description": "Tests outbox-based ManualTask delivery and TCRS sync",
          "trigger": {
            "type": "eventBasedEntity",
            "config": {
              "events": ["Updated"],
              "entityTypes": ["testCase"]
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

  private void waitForWorkflowDeployed(OpenMetadataClient client, String workflowName) {
    await()
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofSeconds(2))
        .until(
            () -> {
              try {
                WorkflowDefinition wd =
                    client.workflowDefinitions().getByName(workflowName, "deployed");
                return Boolean.TRUE.equals(wd.getDeployed());
              } catch (Exception e) {
                return false;
              }
            });
  }

  private void createFailedTestResult(OpenMetadataClient client, TestCase testCase) {
    org.openmetadata.schema.api.tests.CreateTestCaseResult failedResult =
        new org.openmetadata.schema.api.tests.CreateTestCaseResult();
    failedResult.setTimestamp(System.currentTimeMillis());
    failedResult.setTestCaseStatus(TestCaseStatus.Failed);
    failedResult.setResult("Test failed - triggering incident");
    client.testCaseResults().create(testCase.getFullyQualifiedName(), failedResult);
  }

  private Task findIncidentTaskForTestCase(OpenMetadataClient client, TestCase testCase) {
    ListParams params =
        new ListParams()
            .addFilter("category", "Incident")
            .setFields("payload,about,aboutEntityLink")
            .setLimit(100);
    ListResponse<Task> tasks = client.tasks().list(params);

    for (Task task : tasks.getData()) {
      if (task.getAbout() != null
          && task.getAbout().getFullyQualifiedName() != null
          && task.getAbout().getFullyQualifiedName().equals(testCase.getFullyQualifiedName())) {
        return task;
      }
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private List<TestCaseResolutionStatus> listTcrsForStateId(
      OpenMetadataClient client, UUID stateId) {
    try {
      String response =
          client
              .getHttpClient()
              .executeForString(
                  HttpMethod.GET,
                  "/v1/dataQuality/testCases/testCaseIncidentStatus/stateId/" + stateId,
                  null,
                  RequestOptions.builder().build());

      Map<String, Object> result = JsonUtils.readValue(response, new TypeReference<>() {});
      List<Object> data = (List<Object>) result.get("data");
      if (data == null) {
        return List.of();
      }
      return data.stream()
          .map(d -> JsonUtils.convertValue(d, TestCaseResolutionStatus.class))
          .toList();
    } catch (Exception e) {
      return List.of();
    }
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
                      + "?limit=100&startTs=0&endTs="
                      + System.currentTimeMillis(),
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
    return stage != null ? (String) stage.get("name") : null;
  }

  private WorkflowDefinition deployManualTaskWorkflowWithPolicy(
      OpenMetadataClient client,
      String workflowName,
      String onConflict,
      boolean includeRetriggerEdge) {
    String retriggerEdge =
        includeRetriggerEdge
            ? """
            ,{"from": "%s", "to": "%s", "condition": "retrigger"}"""
                .formatted(NODE_NAME, NODE_NAME)
            : "";
    String workflowJson =
        """
        {
          "name": "%s",
          "displayName": "OnConflict E2E Test Workflow",
          "description": "Tests onConflict=%s policy",
          "trigger": {
            "type": "eventBasedEntity",
            "config": {
              "events": ["Updated"],
              "entityTypes": ["testCase"],
              "onConflict": "%s"
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
            {"from": "%s", "to": "resolvedEnd", "condition": "Completed"}%s
          ],
          "config": { "storeStageStatus": true }
        }
        """
            .formatted(
                workflowName,
                onConflict,
                onConflict,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                retriggerEdge);

    CreateWorkflowDefinition request =
        JsonUtils.readValue(workflowJson, CreateWorkflowDefinition.class);
    return client.workflowDefinitions().create(request);
  }

  private void patchTestCaseDescription(
      OpenMetadataClient client, TestCase testCase, String description) {
    String patchJson =
        String.format(
            "[{\"op\": \"add\", \"path\": \"/description\", \"value\": \"%s\"}]", description);
    client
        .getHttpClient()
        .executeForString(
            HttpMethod.PATCH,
            "/v1/dataQuality/testCases/" + testCase.getId(),
            patchJson,
            RequestOptions.builder().header("Content-Type", "application/json-patch+json").build());
  }

  @SuppressWarnings("unchecked")
  private long countWorkflowInstances(OpenMetadataClient client, String workflowName) {
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
      if (data == null) return 0;
      return data.stream().filter(i -> "RUNNING".equals(i.get("status"))).count();
    } catch (Exception e) {
      return 0;
    }
  }
}
