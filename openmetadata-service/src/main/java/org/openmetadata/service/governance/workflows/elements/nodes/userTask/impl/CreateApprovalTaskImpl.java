package org.openmetadata.service.governance.workflows.elements.nodes.userTask.impl;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;
import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RELATED_ENTITY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.exception.ExceptionUtils;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.BpmnError;
import org.flowable.engine.delegate.TaskListener;
import org.flowable.identitylink.api.IdentityLink;
import org.flowable.task.service.delegate.DelegateTask;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.feed.Thread;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.ChangeEvent;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.EventType;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TaskDetails;
import org.openmetadata.schema.type.TaskStatus;
import org.openmetadata.schema.type.TaskType;
import org.openmetadata.schema.type.ThreadType;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.formatter.decorators.FeedMessageDecorator;
import org.openmetadata.service.formatter.util.FormatterUtil;
import org.openmetadata.service.governance.workflows.WorkflowHandler;
import org.openmetadata.service.governance.workflows.WorkflowVariableHandler;
import org.openmetadata.service.jdbi3.FeedRepository;
import org.openmetadata.service.resources.feeds.FeedMapper;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.FeedUtils;
import org.openmetadata.service.util.WebsocketNotificationHandler;

@Slf4j
public class CreateApprovalTaskImpl implements TaskListener {
  private static final FeedMessageDecorator FEED_MESSAGE_DECORATOR = new FeedMessageDecorator();

  private Expression inputNamespaceMapExpr;
  private Expression approvalThresholdExpr;
  private Expression rejectionThresholdExpr;

  @Override
  public void notify(DelegateTask delegateTask) {
    WorkflowVariableHandler varHandler = new WorkflowVariableHandler(delegateTask);
    try {
      Map<String, String> inputNamespaceMap =
          JsonUtils.readOrConvertValue(inputNamespaceMapExpr.getValue(delegateTask), Map.class);
      List<EntityReference> assignees = getAssignees(delegateTask);
      MessageParser.EntityLink entityLink =
          MessageParser.EntityLink.parse(
              (String)
                  varHandler.getNamespacedVariable(
                      inputNamespaceMap.get(RELATED_ENTITY_VARIABLE), RELATED_ENTITY_VARIABLE));
      EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);

      int approvalThreshold = 1;
      if (approvalThresholdExpr != null) {
        String thresholdStr = (String) approvalThresholdExpr.getValue(delegateTask);
        if (thresholdStr != null && !thresholdStr.isEmpty()) {
          approvalThreshold = Integer.parseInt(thresholdStr);
        }
      }

      int rejectionThreshold = 1;
      if (rejectionThresholdExpr != null) {
        String thresholdStr = (String) rejectionThresholdExpr.getValue(delegateTask);
        if (thresholdStr != null && !thresholdStr.isEmpty()) {
          rejectionThreshold = Integer.parseInt(thresholdStr);
        }
      }

      Thread task = createApprovalTask(entity, assignees);
      WorkflowHandler.getInstance().setCustomTaskId(delegateTask.getId(), task.getId());

      delegateTask.setVariable("approvalThreshold", approvalThreshold);
      delegateTask.setVariable("rejectionThreshold", rejectionThreshold);
      delegateTask.setVariable("approversList", new ArrayList<String>());
      delegateTask.setVariable("rejectersList", new ArrayList<String>());
    } catch (Exception exc) {
      LOG.error(
          "[{}] Failure: ",
          getProcessDefinitionKeyFromId(delegateTask.getProcessDefinitionId()),
          exc);
      varHandler.setGlobalVariable(EXCEPTION_VARIABLE, ExceptionUtils.getStackTrace(exc));
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }

  private List<EntityReference> getAssignees(DelegateTask delegateTask) {
    List<EntityReference> assignees = new ArrayList<>();
    Set<IdentityLink> candidates = delegateTask.getCandidates();
    if (!candidates.isEmpty()) {
      for (IdentityLink candidate : candidates) {
        assignees.add(getEntityReferenceFromLinkString(candidate.getUserId()));
      }
    } else {
      assignees.add(getEntityReferenceFromLinkString(delegateTask.getAssignee()));
    }
    return assignees;
  }

  private EntityReference getEntityReferenceFromLinkString(String entityLinkString) {
    MessageParser.EntityLink assigneeEntityLink = MessageParser.EntityLink.parse(entityLinkString);
    return Entity.getEntityReferenceByName(
        assigneeEntityLink.getEntityType(), assigneeEntityLink.getEntityFQN(), Include.NON_DELETED);
  }

  /**
   * Runs the entity's changeDescription through the activity-feed formatter pipeline and returns
   * one Thread per changed field (same output shape the activity feed persists). Returns an empty
   * list when there is nothing to diff or when the formatter fails — callers must handle both.
   */
  List<Thread> buildFormattedDiffs(EntityInterface entity, MessageParser.EntityLink about) {
    final ChangeDescription cd = entity.getChangeDescription();
    if (cd == null
        || (nullOrEmpty(cd.getFieldsAdded())
            && nullOrEmpty(cd.getFieldsUpdated())
            && nullOrEmpty(cd.getFieldsDeleted()))) {
      return List.of();
    }
    try {
      final Thread baseThread =
          FeedUtils.getThread(
              FEED_MESSAGE_DECORATOR,
              entity,
              about.getLinkString(),
              about.getEntityType(),
              entity.getUpdatedBy());
      return FormatterUtil.getFormattedMessages(FEED_MESSAGE_DECORATOR, baseThread, cd);
    } catch (Exception e) {
      LOG.warn(
          "Failed to build change summary for approval task on {}",
          entity.getFullyQualifiedName(),
          e);
      return List.of();
    }
  }

  /**
   * Stamps the task thread with a change preview sourced from the entity's changeDescription.
   *
   * <p>Produces one markdown bullet line per changed field and stores the result in
   * thread.message. Always clears cardStyle/feedInfo/fieldOperation so the UI owns rendering.
   *
   * <p>No change / formatter failure: sets message to null (no preview section shown).
   */
  void applyChangePreview(
      Thread taskThread, EntityInterface entity, MessageParser.EntityLink about) {
    final List<Thread> perFieldThreads = buildFormattedDiffs(entity, about);
    taskThread.withCardStyle(null).withFieldOperation(null).withFeedInfo(null);
    if (perFieldThreads.isEmpty()) {
      taskThread.withMessage(null);
      return;
    }
    final StringBuilder builder = new StringBuilder();
    for (final Thread perField : perFieldThreads) {
      builder.append("- ").append(perField.getMessage()).append('\n');
    }
    taskThread.withMessage(builder.toString());
  }

  private Thread createApprovalTask(EntityInterface entity, List<EntityReference> assignees) {
    FeedRepository feedRepository = Entity.getFeedRepository();
    MessageParser.EntityLink about =
        new MessageParser.EntityLink(
            Entity.getEntityTypeFromObject(entity), entity.getFullyQualifiedName());

    Thread thread;
    ChangeEvent changeEvent;
    try {
      thread = feedRepository.getTask(about, TaskType.RequestApproval, TaskStatus.Open);
      thread.getTask().setAssignees(FeedMapper.formatAssignees(assignees));
      applyChangePreview(thread, entity, about);
      thread.withUpdatedBy(entity.getUpdatedBy()).withUpdatedAt(System.currentTimeMillis());

      Entity.getCollectionDAO().feedDAO().update(thread.getId(), JsonUtils.pojoToJson(thread));

      WorkflowHandler.getInstance()
          .terminateTaskProcessInstance(thread.getId(), "A Newer Process Instance is Running.");
      changeEvent =
          new ChangeEvent()
              .withId(UUID.randomUUID())
              .withEventType(EventType.THREAD_UPDATED)
              .withEntityId(thread.getId())
              .withEntityType(Entity.THREAD)
              .withUserName(entity.getUpdatedBy())
              .withTimestamp(thread.getUpdatedAt())
              .withEntity(thread);
    } catch (EntityNotFoundException ex) {
      TaskDetails taskDetails =
          new TaskDetails()
              .withAssignees(FeedMapper.formatAssignees(assignees))
              .withType(TaskType.RequestApproval)
              .withStatus(TaskStatus.Open);

      thread =
          new Thread()
              .withId(UUID.randomUUID())
              .withThreadTs(System.currentTimeMillis())
              .withCreatedBy(entity.getUpdatedBy())
              .withAbout(about.getLinkString())
              .withType(ThreadType.Task)
              .withTask(taskDetails)
              .withUpdatedBy(entity.getUpdatedBy())
              .withUpdatedAt(System.currentTimeMillis());
      applyChangePreview(thread, entity, about);
      feedRepository.create(thread);

      changeEvent =
          new ChangeEvent()
              .withId(UUID.randomUUID())
              .withEventType(EventType.THREAD_CREATED)
              .withEntityId(thread.getId())
              .withEntityType(Entity.THREAD)
              .withUserName(entity.getUpdatedBy())
              .withTimestamp(thread.getUpdatedAt())
              .withEntity(thread);
    }
    Entity.getCollectionDAO().changeEventDAO().insert(JsonUtils.pojoToMaskedJson(changeEvent));
    WebsocketNotificationHandler.handleTaskNotification(thread);
    return thread;
  }
}
