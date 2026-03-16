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

package org.openmetadata.service.governance.workflows;

import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.openmetadata.service.governance.workflows.Workflow.GLOBAL_NAMESPACE;
import static org.openmetadata.service.governance.workflows.Workflow.RELATED_ENTITY_VARIABLE;
import static org.openmetadata.service.governance.workflows.WorkflowVariableHandler.getNamespacedVariableName;
import static org.openmetadata.service.util.TestUtils.ADMIN_AUTH_HEADERS;

import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.flowable.common.engine.impl.cfg.IdGenerator;
import org.flowable.common.engine.impl.persistence.StrongUuidGenerator;
import org.flowable.engine.ProcessEngineConfiguration;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.runtime.Execution;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.openmetadata.schema.api.data.CreateDatabase;
import org.openmetadata.schema.api.data.CreateDatabaseSchema;
import org.openmetadata.schema.api.data.CreateTable;
import org.openmetadata.schema.api.events.CreateEventSubscription;
import org.openmetadata.schema.api.governance.CreateWorkflowDefinition;
import org.openmetadata.schema.api.services.CreateDatabaseService;
import org.openmetadata.schema.api.services.DatabaseConnection;
import org.openmetadata.schema.entity.data.Database;
import org.openmetadata.schema.entity.data.DatabaseSchema;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.entity.events.EventSubscription;
import org.openmetadata.schema.entity.events.SubscriptionDestination;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.schema.services.connections.database.MysqlConnection;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.ColumnDataType;
import org.openmetadata.schema.type.ProviderType;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.OpenMetadataApplicationTest;
import org.openmetadata.service.jdbi3.TaskRepository;
import org.openmetadata.service.resources.databases.DatabaseResourceTest;
import org.openmetadata.service.resources.databases.DatabaseSchemaResourceTest;
import org.openmetadata.service.resources.databases.TableResourceTest;
import org.openmetadata.service.resources.events.EventSubscriptionResourceTest;
import org.openmetadata.service.resources.services.DatabaseServiceResourceTest;
import org.openmetadata.service.security.SecurityUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * End-to-end integration test for the ManualTask workflow node.
 *
 * <p>Deploys a workflow with a ManualTask (IncidentResolution template), triggers it via table
 * entity creation, then exercises the PATCH-triggered bridge: PATCHes task to non-terminal status
 * ("InProgress") to verify the subprocess cycles, then PATCHes to terminal status ("Completed") to
 * close the task and finish the workflow.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class ManualTaskWorkflowTest extends OpenMetadataApplicationTest {

  private static final Logger LOG = LoggerFactory.getLogger(ManualTaskWorkflowTest.class);
  private static final String WORKFLOW_NAME = "ManualTaskE2ETestWorkflow";
  private static final String NODE_NAME = "resolveIncident";
  private static final String ICE_ACTIVITY_ID =
      Workflow.getFlowableElementId(NODE_NAME, "statusCatchEvent");
  private static final String OM_TASK_ID_VAR = getNamespacedVariableName(NODE_NAME, "omTaskId");

  private DatabaseServiceResourceTest databaseServiceTest;
  private DatabaseResourceTest databaseTest;
  private DatabaseSchemaResourceTest schemaTest;
  private TableResourceTest tableTest;

  private DatabaseSchema databaseSchema;

  private IdGenerator originalIdGenerator;
  private WorkflowDefinition createdWorkflow;

  @BeforeAll
  public void setup() throws Exception {
    databaseServiceTest = new DatabaseServiceResourceTest();
    databaseTest = new DatabaseResourceTest();
    schemaTest = new DatabaseSchemaResourceTest();
    tableTest = new TableResourceTest();

    ProcessEngineConfiguration cfg = WorkflowHandler.getInstance().getProcessEngineConfiguration();
    if (cfg != null) {
      originalIdGenerator = cfg.getIdGenerator();
      cfg.setIdGenerator(new StrongUuidGenerator());
    }

    ensureWorkflowEventConsumerIsActive();
    setupTestDatabase();
    deployManualTaskWorkflow();
  }

  @AfterAll
  public void cleanup() {
    ProcessEngineConfiguration cfg = WorkflowHandler.getInstance().getProcessEngineConfiguration();
    if (cfg != null && originalIdGenerator != null) {
      cfg.setIdGenerator(originalIdGenerator);
    }

    if (createdWorkflow != null) {
      try {
        SecurityUtil.addHeaders(
                getResource("governance/workflowDefinitions/name/" + WORKFLOW_NAME),
                ADMIN_AUTH_HEADERS)
            .delete();
      } catch (Exception e) {
        LOG.warn("Failed to delete test workflow: {}", e.getMessage());
      }
    }
  }

  /**
   * Tests the full ManualTask lifecycle via PATCH: initial Open loop, non-terminal cycle, then
   * terminal close.
   *
   * <p>Flow: trigger -> SetupDelegate creates OM Task with result="Open" -> subprocess exits ->
   * graph-level Open self-loop -> re-enters -> ICE subscribes -> PATCH to InProgress -> cycles ->
   * PATCH to Completed -> CloseTaskDelegate sees already-Completed -> workflow finishes.
   */
  @Test
  public void testManualTaskNonTerminalThenTerminal() throws Exception {
    String tableName = "manual_task_test_" + System.currentTimeMillis();
    CreateTable createTable =
        new CreateTable()
            .withName(tableName)
            .withDatabaseSchema(databaseSchema.getFullyQualifiedName())
            .withColumns(List.of(new Column().withName("id").withDataType(ColumnDataType.INT)));
    Table testTable = tableTest.createEntity(createTable, ADMIN_AUTH_HEADERS);

    String entityLink = String.format("<#E::table::%s>", testTable.getFullyQualifiedName());
    manuallyTriggerWorkflow(entityLink);

    RuntimeService runtimeService = WorkflowHandler.getInstance().getRuntimeService();

    // Wait for the ICE subscription after the initial Open self-loop
    // (SetupDelegate creates task with result="Open", subprocess exits, graph re-enters, ICE
    // subscribes)
    String omTaskId = waitForIceSubscription(runtimeService);

    TaskRepository taskRepo =
        (TaskRepository)
            org.openmetadata.service.Entity.getEntityRepository(
                org.openmetadata.service.Entity.TASK);
    org.openmetadata.schema.entity.tasks.Task omTask =
        taskRepo.get(null, UUID.fromString(omTaskId), taskRepo.getFields("*"));
    assertNotNull(omTask, "OM Task should exist");
    assertEquals(TaskEntityStatus.Open, omTask.getStatus());

    // PATCH task status to InProgress (non-terminal) — bridge fires via postUpdate()
    patchTaskStatus(UUID.fromString(omTaskId), TaskEntityStatus.InProgress);

    // Wait for the subprocess to cycle back and ICE to re-subscribe
    String omTaskIdAfterCycle = waitForIceSubscription(runtimeService);
    assertEquals(omTaskId, omTaskIdAfterCycle, "Same task ID should be reused after cycle");

    omTask = taskRepo.get(null, UUID.fromString(omTaskId), taskRepo.getFields("*"));
    assertEquals(
        TaskEntityStatus.InProgress, omTask.getStatus(), "Task should be InProgress after PATCH");

    // PATCH task status to Completed (terminal) — bridge fires, CloseTaskDelegate skips (already
    // closed)
    patchTaskStatus(UUID.fromString(omTaskId), TaskEntityStatus.Completed);

    await()
        .atMost(Duration.ofSeconds(15))
        .pollInterval(Duration.ofSeconds(1))
        .until(
            () -> {
              org.openmetadata.schema.entity.tasks.Task t =
                  taskRepo.get(null, UUID.fromString(omTaskId), taskRepo.getFields("*"));
              return t.getStatus() == TaskEntityStatus.Completed;
            });

    omTask = taskRepo.get(null, UUID.fromString(omTaskId), taskRepo.getFields("*"));
    assertEquals(TaskEntityStatus.Completed, omTask.getStatus(), "Task should be completed");

    List<Execution> remaining =
        runtimeService.createExecutionQuery().messageEventSubscriptionName(omTaskId).list();
    assertTrue(remaining.isEmpty(), "No active ICE subscriptions should remain after terminal");
  }

  /**
   * Polls for an IntermediateCatchEvent message subscription using Awaitility. The subscription
   * name is the OM Task UUID, stored as process variable {@code resolveIncident_omTaskId}.
   */
  private String waitForIceSubscription(RuntimeService runtimeService) {
    AtomicReference<String> omTaskIdRef = new AtomicReference<>();

    await()
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofSeconds(1))
        .until(
            () -> {
              List<Execution> executions =
                  runtimeService.createExecutionQuery().activityId(ICE_ACTIVITY_ID).list();
              if (executions.isEmpty()) {
                return false;
              }
              Execution iceExecution = executions.getFirst();
              String omTaskId =
                  (String)
                      runtimeService.getVariable(
                          iceExecution.getProcessInstanceId(), OM_TASK_ID_VAR);
              if (omTaskId != null) {
                omTaskIdRef.set(omTaskId);
                return true;
              }
              return false;
            });

    return omTaskIdRef.get();
  }

  private void manuallyTriggerWorkflow(String entityLink) {
    Map<String, Object> variables = new HashMap<>();
    variables.put(getNamespacedVariableName(GLOBAL_NAMESPACE, RELATED_ENTITY_VARIABLE), entityLink);
    WorkflowHandler.getInstance().triggerWithSignal("table-entityCreated", variables);
  }

  private void setupTestDatabase() throws Exception {
    CreateDatabaseService createService =
        new CreateDatabaseService()
            .withName("manual_task_test_svc_" + System.currentTimeMillis())
            .withServiceType(CreateDatabaseService.DatabaseServiceType.Mysql)
            .withConnection(
                new DatabaseConnection()
                    .withConfig(
                        new MysqlConnection().withHostPort("localhost:3306").withUsername("test")));
    DatabaseService databaseService =
        databaseServiceTest.createEntity(createService, ADMIN_AUTH_HEADERS);

    CreateDatabase createDatabase =
        new CreateDatabase()
            .withName("manual_task_test_db")
            .withService(databaseService.getFullyQualifiedName());
    Database database = databaseTest.createEntity(createDatabase, ADMIN_AUTH_HEADERS);

    CreateDatabaseSchema createSchema =
        new CreateDatabaseSchema()
            .withName("manual_task_test_schema")
            .withDatabase(database.getFullyQualifiedName());
    databaseSchema = schemaTest.createEntity(createSchema, ADMIN_AUTH_HEADERS);
  }

  private void deployManualTaskWorkflow() throws Exception {
    String workflowJson =
        """
        {
          "name": "%s",
          "displayName": "ManualTask E2E Test Workflow",
          "description": "Tests ManualTask with IncidentResolution template",
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
              "config": {
                "template": "IncidentResolution"
              },
              "input": ["relatedEntity"],
              "inputNamespaceMap": {
                "relatedEntity": "global"
              },
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
          "config": {
            "storeStageStatus": true
          }
        }
        """
            .formatted(
                WORKFLOW_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME,
                NODE_NAME);

    CreateWorkflowDefinition workflow =
        JsonUtils.readValue(workflowJson, CreateWorkflowDefinition.class);

    Response response =
        SecurityUtil.addHeaders(getResource("governance/workflowDefinitions"), ADMIN_AUTH_HEADERS)
            .post(Entity.json(workflow));

    assertTrue(
        response.getStatus() == Response.Status.CREATED.getStatusCode()
            || response.getStatus() == Response.Status.OK.getStatusCode(),
        "Workflow creation should succeed. Status: " + response.getStatus());

    WebTarget target = getResource("governance/workflowDefinitions/name/" + WORKFLOW_NAME);
    Invocation.Builder builder = target.request();
    for (Map.Entry<String, String> entry : ADMIN_AUTH_HEADERS.entrySet()) {
      builder = builder.header(entry.getKey(), entry.getValue());
    }
    createdWorkflow = JsonUtils.readValue(builder.get(String.class), WorkflowDefinition.class);
    assertNotNull(createdWorkflow);
  }

  private void patchTaskStatus(UUID taskId, TaskEntityStatus newStatus) {
    String patchJson =
        String.format(
            "[{\"op\": \"replace\", \"path\": \"/status\", \"value\": \"%s\"}]", newStatus.value());

    Response response =
        SecurityUtil.addHeaders(getResource("tasks/" + taskId), ADMIN_AUTH_HEADERS)
            .method("PATCH", Entity.entity(patchJson, "application/json-patch+json"));

    assertEquals(
        Response.Status.OK.getStatusCode(),
        response.getStatus(),
        "PATCH task status to " + newStatus.value() + " should succeed");
  }

  private void ensureWorkflowEventConsumerIsActive() throws Exception {
    EventSubscriptionResourceTest eventSubscriptionTest = new EventSubscriptionResourceTest();
    EventSubscription existing = null;
    try {
      existing =
          eventSubscriptionTest.getEntityByName("WorkflowEventConsumer", null, ADMIN_AUTH_HEADERS);
    } catch (Exception e) {
      // Doesn't exist yet
    }

    if (existing == null) {
      CreateEventSubscription createSubscription =
          new CreateEventSubscription()
              .withName("WorkflowEventConsumer")
              .withDisplayName("Workflow Event Consumer")
              .withDescription("Consumers EntityChange Events to trigger Workflows.")
              .withAlertType(CreateEventSubscription.AlertType.GOVERNANCE_WORKFLOW_CHANGE_EVENT)
              .withResources(List.of("all"))
              .withProvider(ProviderType.SYSTEM)
              .withPollInterval(10)
              .withEnabled(true)
              .withDestinations(
                  List.of(
                      new SubscriptionDestination()
                          .withId(UUID.fromString("fc9e7a84-5dbd-4e63-8b78-6c3a7bf04a60"))
                          .withCategory(SubscriptionDestination.SubscriptionCategory.EXTERNAL)
                          .withType(
                              SubscriptionDestination.SubscriptionType
                                  .GOVERNANCE_WORKFLOW_CHANGE_EVENT)
                          .withEnabled(true)));
      eventSubscriptionTest.createEntity(createSubscription, ADMIN_AUTH_HEADERS);
    } else if (!existing.getEnabled()) {
      String json = JsonUtils.pojoToJson(existing);
      existing.setEnabled(true);
      eventSubscriptionTest.patchEntity(existing.getId(), json, existing, ADMIN_AUTH_HEADERS);
    }
  }
}
