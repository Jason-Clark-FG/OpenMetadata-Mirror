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
package org.openmetadata.service.mcpclient;

import static org.openmetadata.service.security.DefaultAuthorizer.getSubjectContext;

import jakarta.ws.rs.core.SecurityContext;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.chat.CreateMcpConversation;
import org.openmetadata.schema.api.chat.CreateMcpMessage;
import org.openmetadata.schema.entity.chat.McpConversation;
import org.openmetadata.schema.entity.chat.McpMessage;
import org.openmetadata.schema.entity.chat.TokenUsage;
import org.openmetadata.schema.entity.chat.content.ChatContentType;
import org.openmetadata.schema.entity.chat.content.MessageBlock;
import org.openmetadata.schema.entity.chat.content.TextMessage;
import org.openmetadata.schema.entity.chat.content.ToolCall;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.clients.llm.LlmClient;
import org.openmetadata.service.clients.llm.LlmClientFactory;
import org.openmetadata.service.clients.llm.LlmMessage;
import org.openmetadata.service.clients.llm.LlmResponse;
import org.openmetadata.service.clients.llm.LlmToolCall;
import org.openmetadata.service.config.McpClientConfiguration;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.McpConversationRepository;
import org.openmetadata.service.jdbi3.McpMessageRepository;
import org.openmetadata.service.limits.Limits;
import org.openmetadata.service.security.Authorizer;
import org.openmetadata.service.security.auth.CatalogSecurityContext;

@Slf4j
public class McpClientService {
  private static final int MAX_TOOL_ITERATIONS = 10;
  private static final int CONVERSATION_HISTORY_LIMIT = 20;

  private final McpConversationRepository conversationRepository;
  private final McpMessageRepository messageRepository;
  private final LlmClient llmClient;
  private final Authorizer authorizer;
  private final Limits limits;
  private final McpClientConfiguration config;
  private volatile ToolExecutor toolExecutor;
  private volatile List<Map<String, Object>> toolDefinitions = new ArrayList<>();

  public McpClientService(
      CollectionDAO dao, McpClientConfiguration config, Authorizer authorizer, Limits limits) {
    this.conversationRepository = new McpConversationRepository(dao.mcpConversationDAO());
    this.messageRepository = new McpMessageRepository(dao.mcpMessageDAO());
    this.llmClient = LlmClientFactory.create(config);
    this.authorizer = authorizer;
    this.limits = limits;
    this.config = config;
  }

  public void setToolExecutor(ToolExecutor toolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  public void setToolDefinitions(List<Map<String, Object>> toolDefinitions) {
    this.toolDefinitions = toolDefinitions;
  }

  public record ChatResponse(UUID conversationId, McpMessage message) {}

  public ChatResponse chat(
      SecurityContext securityContext, UUID conversationId, String userMessage) {
    User user = getSubjectContext(securityContext).user();
    EntityReference userRef = user.getEntityReference();

    McpConversation conversation;
    boolean isNewConversation;
    if (conversationId == null) {
      conversation = conversationRepository.create(new CreateMcpConversation(), userRef);
      isNewConversation = true;
    } else {
      conversation = getConversation(securityContext, conversationId);
      isNewConversation = false;
    }

    int currentMessageCount = conversation.getMessageCount();

    storeMessage(
        conversation.getId(),
        CreateMcpMessage.Sender.HUMAN,
        List.of(
            new MessageBlock()
                .withType(ChatContentType.GENERIC)
                .withTextMessage(
                    new TextMessage()
                        .withType(TextMessage.TextMessageType.MARKDOWN)
                        .withMessage(userMessage))),
        null,
        currentMessageCount);
    currentMessageCount++;

    List<LlmMessage> llmMessages = buildLlmMessages(conversation.getId());

    CatalogSecurityContext catalogSecurityContext = (CatalogSecurityContext) securityContext;
    List<ToolCall> allToolCalls = new ArrayList<>();
    int totalInputTokens = 0;
    int totalOutputTokens = 0;
    String assistantText = null;

    for (int i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      LlmResponse response = llmClient.sendMessages(llmMessages, toolDefinitions);
      totalInputTokens += response.inputTokens();
      totalOutputTokens += response.outputTokens();

      if (!response.hasToolCalls()) {
        assistantText = response.content();
        break;
      }

      llmMessages.add(LlmMessage.assistantWithToolCalls(response.toolCalls()));

      for (LlmToolCall toolCall : response.toolCalls()) {
        String resultContent =
            toolExecutor.executeTool(
                authorizer, limits, catalogSecurityContext, toolCall.name(), toolCall.arguments());

        llmMessages.add(LlmMessage.toolResult(toolCall.id(), resultContent));

        Map<String, Object> inputArgs = parseToolArguments(toolCall.arguments());
        allToolCalls.add(
            new ToolCall()
                .withName(toolCall.name())
                .withInput(inputArgs)
                .withResult(resultContent));
      }
    }

    if (assistantText == null) {
      assistantText = "I was unable to complete the request within the allowed tool call limit.";
    }

    List<MessageBlock> contentBlocks = new ArrayList<>();
    contentBlocks.add(
        new MessageBlock()
            .withType(ChatContentType.GENERIC)
            .withTextMessage(
                new TextMessage()
                    .withType(TextMessage.TextMessageType.MARKDOWN)
                    .withMessage(assistantText))
            .withTools(allToolCalls));

    TokenUsage tokenUsage =
        new TokenUsage()
            .withInputTokens(totalInputTokens)
            .withOutputTokens(totalOutputTokens)
            .withTotalTokens(totalInputTokens + totalOutputTokens);

    McpMessage assistantMsg =
        storeMessage(
            conversation.getId(),
            CreateMcpMessage.Sender.ASSISTANT,
            contentBlocks,
            tokenUsage,
            currentMessageCount);
    currentMessageCount++;

    conversation.setMessageCount(currentMessageCount);
    conversation.setUpdatedBy(userRef.getName());
    if (isNewConversation && conversation.getTitle() == null) {
      conversation.setTitle(truncateTitle(userMessage));
    }
    conversationRepository.update(conversation);

    return new ChatResponse(conversation.getId(), assistantMsg);
  }

  public McpConversation createConversation(
      SecurityContext securityContext, CreateMcpConversation request) {
    User user = getSubjectContext(securityContext).user();
    EntityReference userRef = user.getEntityReference();
    return conversationRepository.create(
        request != null ? request : new CreateMcpConversation(), userRef);
  }

  public int getConversationCount(SecurityContext securityContext) {
    User user = getSubjectContext(securityContext).user();
    return conversationRepository.countByUser(user.getId());
  }

  public int getMessageCount(SecurityContext securityContext, UUID conversationId) {
    getConversation(securityContext, conversationId);
    return messageRepository.countByConversation(conversationId);
  }

  public McpConversation getConversation(SecurityContext securityContext, UUID conversationId) {
    McpConversation conversation = conversationRepository.getById(conversationId);
    verifyOwnership(securityContext, conversation);
    return conversation;
  }

  public List<McpConversation> listConversations(
      SecurityContext securityContext, int limit, int offset) {
    User user = getSubjectContext(securityContext).user();
    return conversationRepository.listByUser(user.getId(), limit, offset);
  }

  public McpConversation getConversationWithMessages(
      SecurityContext securityContext, UUID conversationId) {
    McpConversation conversation = getConversation(securityContext, conversationId);
    List<McpMessage> messages =
        messageRepository.listByConversation(conversationId, CONVERSATION_HISTORY_LIMIT, 0);
    conversation.setMcpMessages(messages);
    return conversation;
  }

  public List<McpMessage> listMessages(
      SecurityContext securityContext, UUID conversationId, int limit, int offset) {
    getConversation(securityContext, conversationId);
    return messageRepository.listByConversation(conversationId, limit, offset);
  }

  public void deleteConversation(SecurityContext securityContext, UUID conversationId) {
    getConversation(securityContext, conversationId);
    messageRepository.deleteByConversation(conversationId);
    conversationRepository.delete(conversationId);
  }

  private McpMessage storeMessage(
      UUID conversationId,
      CreateMcpMessage.Sender sender,
      List<MessageBlock> content,
      TokenUsage tokens,
      int messageIndex) {
    CreateMcpMessage createMessage =
        new CreateMcpMessage()
            .withSender(sender)
            .withContent(content)
            .withTimestamp(System.currentTimeMillis())
            .withTokens(tokens);
    return messageRepository.create(createMessage, conversationId, messageIndex);
  }

  private List<LlmMessage> buildLlmMessages(UUID conversationId) {
    List<LlmMessage> llmMessages = new ArrayList<>();
    llmMessages.add(LlmMessage.system(config.getSystemPrompt()));

    List<McpMessage> history =
        messageRepository.listByConversation(conversationId, CONVERSATION_HISTORY_LIMIT, 0);

    for (McpMessage msg : history) {
      LlmMessage.Role role =
          msg.getSender() == CreateMcpMessage.Sender.HUMAN
              ? LlmMessage.Role.user
              : LlmMessage.Role.assistant;
      String textContent = extractTextFromMessage(msg);
      if (textContent != null) {
        llmMessages.add(new LlmMessage(role, textContent, null, null));
      }
    }

    return llmMessages;
  }

  private String extractTextFromMessage(McpMessage message) {
    if (message.getContent() == null || message.getContent().isEmpty()) {
      return null;
    }
    for (MessageBlock block : message.getContent()) {
      if (block.getTextMessage() != null && block.getTextMessage().getMessage() != null) {
        return block.getTextMessage().getMessage();
      }
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> parseToolArguments(String arguments) {
    if (arguments == null || arguments.isBlank()) {
      return new HashMap<>();
    }
    try {
      return JsonUtils.readValue(arguments, Map.class);
    } catch (Exception e) {
      LOG.warn("Failed to parse tool arguments: {}", arguments, e);
      return new HashMap<>();
    }
  }

  private void verifyOwnership(SecurityContext securityContext, McpConversation conversation) {
    User user = getSubjectContext(securityContext).user();
    if (!conversation.getUser().getId().equals(user.getId())) {
      throw new EntityNotFoundException("Conversation not found: " + conversation.getId());
    }
  }

  private String truncateTitle(String message) {
    if (message == null) {
      return null;
    }
    return message.length() > 100 ? message.substring(0, 97) + "..." : message;
  }
}
