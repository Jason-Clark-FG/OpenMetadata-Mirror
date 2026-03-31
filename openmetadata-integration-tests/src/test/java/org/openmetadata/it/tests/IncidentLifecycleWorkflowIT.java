/*
 *  Copyright 2025 Collate.
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
import org.openmetadata.schema.entity.data.DatabaseSchema;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.entity.tasks.Task;
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
 * E2E test for the bootstrap IncidentLifecycleWorkflow.
 *
 * <p>Validates that the default workflow (shipped in
 * json/data/governance/workflows/IncidentLifecycleWorkflow.json) triggers on test case failure,
 * creates an incident Task assigned to table owners, syncs Task events to TCRS records, and
 * completes the workflow on terminal status.
 */
@Execution(ExecutionMode.SAME_THREAD)
@ExtendWith(TestNamespaceExtension.class)
public class IncidentLifecycleWorkflowIT {

  private static final String WORKFLOW_NAME = "IncidentLifecycleWorkflow";
  private static final Duration PIPELINE_TIMEOUT = Duration.ofSeconds(120);

  @Test
  void bootstrapWorkflow_fullLifecycle(TestNamespace ns) {
    OpenMetadataClient client = SdkClients.adminClient();
    String id = ns.shortPrefix();

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

    await()
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofSeconds(2))
        .until(
            () -> {
              try {
                var wd = client.workflowDefinitions().getByName(WORKFLOW_NAME, "deployed");
                return Boolean.TRUE.equals(wd.getDeployed());
              } catch (Exception e) {
                return false;
              }
            });

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
    assertEquals(TaskEntityStatus.Open, task.getStatus());
    assertEquals(TaskCategory.Incident, task.getCategory());
    assertEquals(TaskEntityType.IncidentResolution, task.getType());
    assertNotNull(task.getWorkflowInstanceId());

    assertNotNull(task.getAboutEntityLink());
    assertTrue(task.getAboutEntityLink().contains("testCase"));
    assertTrue(task.getAboutEntityLink().contains("incidents"));

    TestCase updatedTc =
        client.testCases().getByName(testCase.getFullyQualifiedName(), "incidentId");
    UUID stateId = updatedTc.getIncidentId();
    assertNotNull(stateId);

    await()
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofSeconds(2))
        .until(
            () ->
                listTcrsForStateId(client, stateId).stream()
                    .anyMatch(
                        r ->
                            r.getTestCaseResolutionStatusType()
                                == TestCaseResolutionStatusTypes.New));

    patchTaskStatus(client, task.getId().toString(), "InProgress");

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

    await()
        .atMost(PIPELINE_TIMEOUT)
        .pollInterval(Duration.ofSeconds(2))
        .until(
            () -> {
              Map<String, Object> instance = getWorkflowInstance(client, workflowInstanceId);
              return instance != null && "FINISHED".equals(instance.get("status"));
            });

    Task resolvedTask = client.tasks().get(task.getId().toString(), "resolution");
    assertNotNull(resolvedTask.getResolution());

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
      if (data == null) return List.of();
      return data.stream()
          .map(d -> JsonUtils.convertValue(d, TestCaseResolutionStatus.class))
          .toList();
    } catch (Exception e) {
      return List.of();
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> getWorkflowInstance(OpenMetadataClient client, String instanceId) {
    try {
      String response =
          client
              .getHttpClient()
              .executeForString(
                  HttpMethod.GET,
                  "/v1/governance/workflowInstances?startTs=0&endTs="
                      + System.currentTimeMillis()
                      + "&workflowDefinitionName="
                      + WORKFLOW_NAME
                      + "&limit=100",
                  null,
                  RequestOptions.builder().build());

      Map<String, Object> result = JsonUtils.readValue(response, new TypeReference<>() {});
      List<Map<String, Object>> data = (List<Map<String, Object>>) result.get("data");
      if (data == null) return null;

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
}
