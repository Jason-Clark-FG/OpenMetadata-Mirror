package org.openmetadata.service.governance.workflows.elements.nodes.manualTask;

import static org.openmetadata.service.governance.workflows.Workflow.getFlowableElementId;
import static org.openmetadata.service.governance.workflows.WorkflowVariableHandler.getNamespacedVariableName;

import java.util.ArrayList;
import java.util.HashMap;
import org.flowable.bpmn.model.BoundaryEvent;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.EndEvent;
import org.flowable.bpmn.model.ExclusiveGateway;
import org.flowable.bpmn.model.FieldExtension;
import org.flowable.bpmn.model.IntermediateCatchEvent;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.bpmn.model.ServiceTask;
import org.flowable.bpmn.model.StartEvent;
import org.flowable.bpmn.model.SubProcess;
import org.openmetadata.schema.governance.workflows.WorkflowConfiguration;
import org.openmetadata.schema.governance.workflows.elements.nodes.manualTask.ManualTaskDefinition;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.governance.workflows.elements.NodeInterface;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.CheckTerminalDelegate;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.CloseTaskDelegate;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver.ResolvedTemplate;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.SetResultDelegate;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.SetupDelegate;
import org.openmetadata.service.governance.workflows.flowable.builders.EndEventBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.ExclusiveGatewayBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.FieldExtensionBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.IntermediateCatchEventBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.ServiceTaskBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.StartEventBuilder;
import org.openmetadata.service.governance.workflows.flowable.builders.SubProcessBuilder;

/**
 * Builds a BPMN SubProcess for a ManualTask node.
 *
 * <p>Flow:
 *
 * <pre>
 * [Start] → [Setup] → [taskCreatedGateway]
 *   !taskAlreadyExists → [skipEnd]
 *   taskAlreadyExists  → [statusCatchEvent] → [setResult] → [checkTerminal] → [isTerminalGateway]
 *     isTerminal  → [closeTask] → [end]
 *     !isTerminal → [end]
 * </pre>
 *
 * <p>The subprocess always completes after processing one message. Non-terminal statuses end the
 * subprocess without closing the OM Task — the graph-level edge loops back to this node, which
 * re-enters idempotently (SetupDelegate detects the existing task and skips creation).
 */
public class ManualTask implements NodeInterface {
  private final SubProcess subProcess;
  private final BoundaryEvent runtimeExceptionBoundaryEvent;

  public ManualTask(ManualTaskDefinition nodeDefinition, WorkflowConfiguration config) {
    String subProcessId = nodeDefinition.getName();

    ResolvedTemplate resolvedTemplate =
        ManualTaskTemplateResolver.resolve(nodeDefinition.getConfig().getTemplate());
    nodeDefinition.setBranches(new ArrayList<>(resolvedTemplate.statuses()));

    SubProcess subProcess = new SubProcessBuilder().id(subProcessId).build();

    StartEvent startEvent =
        new StartEventBuilder().id(getFlowableElementId(subProcessId, "startEvent")).build();

    ServiceTask setupTask = getSetupTask(subProcessId, nodeDefinition);

    ExclusiveGateway taskCreatedGateway =
        new ExclusiveGatewayBuilder()
            .id(getFlowableElementId(subProcessId, "taskCreatedGateway"))
            .build();

    EndEvent skipEndEvent =
        new EndEventBuilder().id(getFlowableElementId(subProcessId, "skipEndEvent")).build();

    IntermediateCatchEvent statusCatchEvent = getStatusCatchEvent(subProcessId);

    ServiceTask setResultTask =
        new ServiceTaskBuilder()
            .id(getFlowableElementId(subProcessId, "setResult"))
            .implementation(SetResultDelegate.class.getName())
            .build();

    ServiceTask checkTerminalTask = getCheckTerminalTask(subProcessId, resolvedTemplate);

    ExclusiveGateway isTerminalGateway =
        new ExclusiveGatewayBuilder()
            .id(getFlowableElementId(subProcessId, "isTerminalGateway"))
            .build();

    ServiceTask closeTask = getCloseTask(subProcessId);

    EndEvent endEvent =
        new EndEventBuilder().id(getFlowableElementId(subProcessId, "endEvent")).build();

    subProcess.addFlowElement(startEvent);
    subProcess.addFlowElement(setupTask);
    subProcess.addFlowElement(taskCreatedGateway);
    subProcess.addFlowElement(skipEndEvent);
    subProcess.addFlowElement(statusCatchEvent);
    subProcess.addFlowElement(setResultTask);
    subProcess.addFlowElement(checkTerminalTask);
    subProcess.addFlowElement(isTerminalGateway);
    subProcess.addFlowElement(closeTask);
    subProcess.addFlowElement(endEvent);

    // Start → Setup → TaskCreated Gateway
    subProcess.addFlowElement(new SequenceFlow(startEvent.getId(), setupTask.getId()));
    subProcess.addFlowElement(new SequenceFlow(setupTask.getId(), taskCreatedGateway.getId()));

    // TaskCreated Gateway → StatusCatchEvent (task was created)
    SequenceFlow toCatchEvent =
        new SequenceFlow(taskCreatedGateway.getId(), statusCatchEvent.getId());
    toCatchEvent.setConditionExpression("${taskAlreadyExists}");
    subProcess.addFlowElement(toCatchEvent);

    // TaskCreated Gateway → SkipEnd (default)
    SequenceFlow toSkip = new SequenceFlow(taskCreatedGateway.getId(), skipEndEvent.getId());
    toSkip.setConditionExpression("${!taskAlreadyExists}");
    subProcess.addFlowElement(toSkip);
    taskCreatedGateway.setDefaultFlow(toSkip.getId());

    // StatusCatchEvent → SetResult → CheckTerminal → IsTerminal Gateway
    subProcess.addFlowElement(new SequenceFlow(statusCatchEvent.getId(), setResultTask.getId()));
    subProcess.addFlowElement(new SequenceFlow(setResultTask.getId(), checkTerminalTask.getId()));
    subProcess.addFlowElement(
        new SequenceFlow(checkTerminalTask.getId(), isTerminalGateway.getId()));

    // IsTerminal Gateway → CloseTask (terminal status)
    SequenceFlow toCloseTask = new SequenceFlow(isTerminalGateway.getId(), closeTask.getId());
    toCloseTask.setConditionExpression("${isTerminal}");
    subProcess.addFlowElement(toCloseTask);

    // IsTerminal Gateway → End (non-terminal status, default)
    SequenceFlow toEnd = new SequenceFlow(isTerminalGateway.getId(), endEvent.getId());
    toEnd.setConditionExpression("${!isTerminal}");
    subProcess.addFlowElement(toEnd);
    isTerminalGateway.setDefaultFlow(toEnd.getId());

    // CloseTask → End
    subProcess.addFlowElement(new SequenceFlow(closeTask.getId(), endEvent.getId()));

    if (config.getStoreStageStatus()) {
      attachWorkflowInstanceStageListeners(subProcess);
    }

    this.runtimeExceptionBoundaryEvent =
        getRuntimeExceptionBoundaryEvent(subProcess, config.getStoreStageStatus());
    this.subProcess = subProcess;
  }

  private ServiceTask getSetupTask(String subProcessId, ManualTaskDefinition nodeDefinition) {
    FieldExtension inputNamespaceMapExpr =
        new FieldExtensionBuilder()
            .fieldName("inputNamespaceMapExpr")
            .fieldValue(
                JsonUtils.pojoToJson(
                    nodeDefinition.getInputNamespaceMap() != null
                        ? nodeDefinition.getInputNamespaceMap()
                        : new HashMap<>()))
            .build();

    FieldExtension configMapExpr =
        new FieldExtensionBuilder()
            .fieldName("configMapExpr")
            .fieldValue(JsonUtils.pojoToJson(nodeDefinition.getConfig()))
            .build();

    return new ServiceTaskBuilder()
        .id(getFlowableElementId(subProcessId, "setup"))
        .implementation(SetupDelegate.class.getName())
        .addFieldExtension(inputNamespaceMapExpr)
        .addFieldExtension(configMapExpr)
        .build();
  }

  private IntermediateCatchEvent getStatusCatchEvent(String subProcessId) {
    return new IntermediateCatchEventBuilder()
        .id(getFlowableElementId(subProcessId, "statusCatchEvent"))
        .messageExpression("${" + getNamespacedVariableName(subProcessId, "omTaskId") + "}")
        .build();
  }

  private ServiceTask getCheckTerminalTask(String subProcessId, ResolvedTemplate resolvedTemplate) {
    FieldExtension statusesExpr =
        new FieldExtensionBuilder()
            .fieldName("statusesExpr")
            .fieldValue(JsonUtils.pojoToJson(resolvedTemplate.statuses()))
            .build();

    FieldExtension terminalStatusesExpr =
        new FieldExtensionBuilder()
            .fieldName("terminalStatusesExpr")
            .fieldValue(JsonUtils.pojoToJson(resolvedTemplate.terminalStatuses()))
            .build();

    return new ServiceTaskBuilder()
        .id(getFlowableElementId(subProcessId, "checkTerminal"))
        .implementation(CheckTerminalDelegate.class.getName())
        .addFieldExtension(statusesExpr)
        .addFieldExtension(terminalStatusesExpr)
        .build();
  }

  private ServiceTask getCloseTask(String subProcessId) {
    return new ServiceTaskBuilder()
        .id(getFlowableElementId(subProcessId, "closeTask"))
        .implementation(CloseTaskDelegate.class.getName())
        .build();
  }

  @Override
  public BoundaryEvent getRuntimeExceptionBoundaryEvent() {
    return runtimeExceptionBoundaryEvent;
  }

  @Override
  public void addToWorkflow(BpmnModel model, Process process) {
    process.addFlowElement(subProcess);
    process.addFlowElement(runtimeExceptionBoundaryEvent);
  }
}
