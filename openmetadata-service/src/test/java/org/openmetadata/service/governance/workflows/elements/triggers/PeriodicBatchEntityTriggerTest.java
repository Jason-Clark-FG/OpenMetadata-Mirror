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

package org.openmetadata.service.governance.workflows.elements.triggers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.CallActivity;
import org.flowable.bpmn.model.ExclusiveGateway;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.IOParameter;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.ServiceTask;
import org.flowable.bpmn.model.StartEvent;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.governance.workflows.elements.triggers.PeriodicBatchEntityTriggerDefinition;
import org.openmetadata.schema.utils.JsonUtils;

class PeriodicBatchEntityTriggerTest {

  @Test
  void testTriggerCreation() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    assertNotNull(trigger);
    assertEquals("MainWorkflowTrigger", trigger.getTriggerWorkflowId());
  }

  @Test
  void testNoMultiInstanceLoop() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    CallActivity callActivity = findCallActivity(model);
    assertNotNull(callActivity, "CallActivity should exist in the process");
    assertNull(
        callActivity.getLoopCharacteristics(),
        "CallActivity must not have multi-instance loop characteristics in batch mode");
  }

  @Test
  void testCallActivityDoesNotInheritBusinessKey() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    CallActivity callActivity = findCallActivity(model);
    assertNotNull(callActivity);
    assertFalse(
        callActivity.isInheritBusinessKey(),
        "CallActivity must not inherit business key; each spawned main-workflow gets its own UUID");
  }

  @Test
  void testEntityListParameterIsPassedToWorkflow() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    CallActivity callActivity = findCallActivity(model);
    assertNotNull(callActivity);

    List<IOParameter> inParams = callActivity.getInParameters();
    boolean hasEntityListParam =
        inParams.stream()
            .anyMatch(
                p -> "entityList".equals(p.getSource()) && p.getTarget().contains("entityList"));

    assertTrue(hasEntityListParam, "entityList should be passed as input parameter to workflow");
  }

  @Test
  void testScheduleRunIdParameterIsPassedToWorkflow() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    CallActivity callActivity = findCallActivity(model);
    assertNotNull(callActivity);

    List<IOParameter> inParams = callActivity.getInParameters();
    boolean hasScheduleRunIdParam =
        inParams.stream()
            .anyMatch(
                p ->
                    "scheduleRunId".equals(p.getSource())
                        && p.getTarget().contains("scheduleRunId"));

    assertTrue(
        hasScheduleRunIdParam, "scheduleRunId should be propagated into the spawned main workflow");
  }

  @Test
  void testProcessStructure_HasRequiredElements() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    assertFalse(model.getProcesses().isEmpty(), "Model should have processes");

    Process process = model.getProcesses().get(0);

    assertTrue(
        process.getFlowElements().stream().anyMatch(e -> e instanceof StartEvent),
        "Process should have a start event");
    assertTrue(
        process.getFlowElements().stream()
            .anyMatch(e -> e instanceof ServiceTask && e.getId().contains("fetchChangeEventsTask")),
        "Process should have a fetch change events task");
    assertTrue(
        process.getFlowElements().stream()
            .anyMatch(e -> e instanceof ServiceTask && e.getId().contains("commitOffsetTask")),
        "Process should have a commit offset task");
    assertTrue(
        process.getFlowElements().stream().anyMatch(e -> e instanceof CallActivity),
        "Process should have a call activity");
    assertTrue(
        process.getFlowElements().stream().anyMatch(e -> e instanceof ExclusiveGateway),
        "Process should have a loop gateway");
  }

  @Test
  void testMultipleEntityTypes_CreatesMultipleProcesses() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinitionWithMultipleTypes();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MainWorkflow", "MainWorkflowTrigger", triggerDef, "MainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    assertEquals(3, model.getProcesses().size(), "Should create one process per entity type");

    List<String> processIds = model.getProcesses().stream().map(Process::getId).toList();
    assertTrue(
        processIds.stream().anyMatch(id -> id.contains("glossaryTerm")),
        "Should have process for glossaryTerm");
    assertTrue(
        processIds.stream().anyMatch(id -> id.contains("table")), "Should have process for table");
    assertTrue(
        processIds.stream().anyMatch(id -> id.contains("dashboard")),
        "Should have process for dashboard");
  }

  @Test
  void testCallActivityCallsCorrectWorkflow() {
    PeriodicBatchEntityTriggerDefinition triggerDef = createTriggerDefinition();

    PeriodicBatchEntityTrigger trigger =
        new PeriodicBatchEntityTrigger(
            "MyMainWorkflow", "MyMainWorkflowTrigger", triggerDef, "MyMainWorkflow");

    BpmnModel model = new BpmnModel();
    trigger.addToWorkflow(model);

    CallActivity callActivity = findCallActivity(model);
    assertNotNull(callActivity);
    assertEquals(
        "MyMainWorkflow",
        callActivity.getCalledElement(),
        "CallActivity should call the main workflow");
  }

  private CallActivity findCallActivity(BpmnModel model) {
    for (Process process : model.getProcesses()) {
      for (FlowElement element : process.getFlowElements()) {
        if (element instanceof CallActivity callActivity) {
          return callActivity;
        }
      }
    }
    return null;
  }

  private PeriodicBatchEntityTriggerDefinition createTriggerDefinition() {
    String triggerJson =
        """
        {
          "type": "periodicBatchEntity",
          "config": {
            "schedule": {
              "scheduleTimeline": "None"
            },
            "entityTypes": ["glossaryTerm"],
            "batchSize": 500
          },
          "output": ["relatedEntity"]
        }
        """;
    return JsonUtils.readValue(triggerJson, PeriodicBatchEntityTriggerDefinition.class);
  }

  private PeriodicBatchEntityTriggerDefinition createTriggerDefinitionWithMultipleTypes() {
    String triggerJson =
        """
        {
          "type": "periodicBatchEntity",
          "config": {
            "schedule": {
              "scheduleTimeline": "None"
            },
            "entityTypes": ["glossaryTerm", "table", "dashboard"],
            "batchSize": 500
          },
          "output": ["relatedEntity"]
        }
        """;
    return JsonUtils.readValue(triggerJson, PeriodicBatchEntityTriggerDefinition.class);
  }
}
