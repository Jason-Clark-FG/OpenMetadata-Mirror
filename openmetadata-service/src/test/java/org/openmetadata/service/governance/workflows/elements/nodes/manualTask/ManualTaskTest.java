package org.openmetadata.service.governance.workflows.elements.nodes.manualTask;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.SubProcess;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.openmetadata.schema.governance.workflows.WorkflowConfiguration;
import org.openmetadata.schema.governance.workflows.elements.nodes.manualTask.Config;
import org.openmetadata.schema.governance.workflows.elements.nodes.manualTask.InputNamespaceMap;
import org.openmetadata.schema.governance.workflows.elements.nodes.manualTask.ManualTaskDefinition;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver;

class ManualTaskTest {

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testConstructsSubProcessAndAddsToWorkflow(String templateName) {
    ManualTask manualTask = buildManualTask("testNode", templateName);

    BpmnModel model = new BpmnModel();
    Process process = new Process();
    process.setId("testProcess");
    model.addProcess(process);
    manualTask.addToWorkflow(model, process);

    SubProcess sp = findSubProcess(process, "testNode");
    assertNotNull(sp, "SubProcess should be added to the process");
  }

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testBranchesMatchResolvedTemplateStatuses(String templateName) {
    ManualTaskDefinition definition = createDefinition("testNode", templateName);
    new ManualTask(definition, createConfig());

    assertEquals(
        ManualTaskTemplateResolver.resolve(templateName).statuses(),
        definition.getBranches(),
        "Branches should be populated from the resolved template statuses");
  }

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testBoundaryEventAttachedToSubProcess(String templateName) {
    ManualTask manualTask = buildManualTask("testNode", templateName);

    assertNotNull(manualTask.getRuntimeExceptionBoundaryEvent());
    assertNotNull(manualTask.getRuntimeExceptionBoundaryEvent().getAttachedToRef());
    assertEquals(
        "testNode", manualTask.getRuntimeExceptionBoundaryEvent().getAttachedToRef().getId());
  }

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testSubProcessIsNotEmpty(String templateName) {
    ManualTask manualTask = buildManualTask("testNode", templateName);
    SubProcess sp = getSubProcess(manualTask);

    assertFalse(sp.getFlowElements().isEmpty(), "SubProcess should contain flow elements");
  }

  // --- Helpers ---

  private ManualTask buildManualTask(String nodeId, String templateName) {
    return new ManualTask(createDefinition(nodeId, templateName), createConfig());
  }

  private ManualTaskDefinition createDefinition(String nodeId, String templateName) {
    ManualTaskDefinition definition = new ManualTaskDefinition();
    definition.setName(nodeId);

    Config config = new Config();
    config.setTemplate(templateName);
    definition.setConfig(config);

    InputNamespaceMap namespaceMap = new InputNamespaceMap();
    namespaceMap.setRelatedEntity("global");
    definition.setInputNamespaceMap(namespaceMap);

    return definition;
  }

  private WorkflowConfiguration createConfig() {
    WorkflowConfiguration config = new WorkflowConfiguration();
    config.setStoreStageStatus(false);
    return config;
  }

  private SubProcess getSubProcess(ManualTask manualTask) {
    BpmnModel model = new BpmnModel();
    Process process = new Process();
    process.setId("testProcess");
    model.addProcess(process);
    manualTask.addToWorkflow(model, process);
    return findSubProcess(process, "testNode");
  }

  private SubProcess findSubProcess(Process process, String id) {
    for (FlowElement element : process.getFlowElements()) {
      if (id.equals(element.getId()) && element instanceof SubProcess) {
        return (SubProcess) element;
      }
    }
    return null;
  }
}
