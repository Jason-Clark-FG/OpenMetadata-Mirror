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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.chat.CreateMcpConversation;
import org.openmetadata.schema.api.chat.CreateMcpMessage;
import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;
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
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.McpConversationRepository;
import org.openmetadata.service.jdbi3.McpMessageRepository;
import org.openmetadata.service.security.auth.CatalogSecurityContext;

@Slf4j
public class McpClientService implements AutoCloseable {
  private static final int MAX_TOOL_ITERATIONS = 10;
  private static final int LLM_CONTEXT_MESSAGE_LIMIT = 20;
  private static final int CONVERSATION_LOAD_LIMIT = 100;

  private final McpConversationRepository conversationRepository;
  private final McpMessageRepository messageRepository;
  private final McpChatAppConfig config;
  private volatile LlmClient llmClient;
  private volatile ToolExecutor toolExecutor;
  private volatile List<Map<String, Object>> toolDefinitions = Collections.emptyList();
  private volatile List<Map<String, Object>> lastToolDefinitionsSource;

  public McpClientService(CollectionDAO dao, McpChatAppConfig config) {
    this.conversationRepository = new McpConversationRepository(dao.mcpConversationDAO());
    this.messageRepository = new McpMessageRepository(dao.mcpMessageDAO());
    this.config = config;
    boolean hasApiKey = config.getLlmApiKey() != null && !config.getLlmApiKey().isBlank();
    boolean hasAwsConfig = config.getAwsConfig() != null;
    if (hasApiKey || hasAwsConfig) {
      this.llmClient = LlmClientFactory.create(config);
    }
  }

  public boolean isChatEnabled() {
    return llmClient != null;
  }

  @Override
  public void close() {
    LlmClient client = this.llmClient;
    if (client != null) {
      try {
        client.close();
      } catch (Exception e) {
        LOG.warn("Failed to close LLM client", e);
      }
    }
  }

  public void updateTools(ToolExecutor executor, List<Map<String, Object>> definitions) {
    this.toolExecutor = executor;
    if (definitions != lastToolDefinitionsSource) {
      lastToolDefinitionsSource = definitions;
      this.toolDefinitions = Collections.unmodifiableList(new ArrayList<>(definitions));
    }
  }

  public record ChatResponse(UUID conversationId, McpMessage message) {}

  public ChatResponse chat(
      SecurityContext securityContext, UUID conversationId, String userMessage) {
    if (llmClient == null) {
      throw new IllegalStateException(
          "LLM API key is not configured. Update the McpApplication configuration with a valid API key.");
    }
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

    CatalogSecurityContext catalogSecurityContext =
        new CatalogSecurityContext(
            securityContext.getUserPrincipal(),
            securityContext.isSecure() ? "https" : "http",
            securityContext.getAuthenticationScheme(),
            Collections.emptySet());

    List<ToolCall> allToolCalls = new ArrayList<>();
    int totalInputTokens = 0;
    int totalOutputTokens = 0;
    StringBuilder textCollector = new StringBuilder();
    String assistantText = null;

    try {
      ToolExecutor executor = this.toolExecutor;
      List<Map<String, Object>> tools = this.toolDefinitions;
      for (int i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        LlmResponse response = llmClient.sendMessages(llmMessages, tools);
        totalInputTokens += response.inputTokens();
        totalOutputTokens += response.outputTokens();

        if (response.content() != null && !response.content().isBlank()) {
          if (!textCollector.isEmpty()) {
            textCollector.append("\n\n");
          }
          textCollector.append(response.content());
        }

        if (!response.hasToolCalls()) {
          break;
        }

        if (executor == null) {
          if (textCollector.isEmpty()) {
            textCollector.append(
                "Tool execution is not available. The MCP Server is not installed or configured.");
          }
          break;
        }

        llmMessages.add(
            LlmMessage.assistantWithToolCalls(response.content(), response.toolCalls()));

        for (LlmToolCall toolCall : response.toolCalls()) {
          String resultContent =
              executor.executeTool(catalogSecurityContext, toolCall.name(), toolCall.arguments());

          llmMessages.add(LlmMessage.toolResult(toolCall.id(), resultContent));

          Map<String, Object> inputArgs = parseToolArguments(toolCall.arguments());
          Object parsedResult = parseToolResult(resultContent);
          allToolCalls.add(
              new ToolCall()
                  .withName(toolCall.name())
                  .withInput(inputArgs)
                  .withResult(parsedResult));
        }
      }

      assistantText =
          textCollector.isEmpty()
              ? "I was unable to complete the request within the allowed tool call limit."
              : textCollector.toString();
    } catch (Exception e) {
      LOG.error("LLM call failed for conversation {}", conversation.getId(), e);
      assistantText = "Sorry, an error occurred while processing your request. Please try again.";
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
      conversation.setTitle(generateTitle(userMessage));
    }
    conversationRepository.update(conversation);

    return new ChatResponse(conversation.getId(), assistantMsg);
  }

  public void chatStream(
      SecurityContext securityContext,
      UUID conversationId,
      String userMessage,
      ChatEventEmitter emitter) {
    if (llmClient == null) {
      throw new IllegalStateException(
          "LLM API key is not configured. Update the McpApplication configuration with a valid API key.");
    }
    User user = getSubjectContext(securityContext).user();
    EntityReference userRef = user.getEntityReference();

    McpConversation conversation;
    boolean isNewConversation;
    if (conversationId == null) {
      conversation = conversationRepository.create(new CreateMcpConversation(), userRef);
      isNewConversation = true;
      emitter.emit(ChatEvent.conversationCreated(conversation.getId()));
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

    CatalogSecurityContext catalogSecurityContext =
        new CatalogSecurityContext(
            securityContext.getUserPrincipal(),
            securityContext.isSecure() ? "https" : "http",
            securityContext.getAuthenticationScheme(),
            Collections.emptySet());

    List<ToolCall> allToolCalls = new ArrayList<>();
    int totalInputTokens = 0;
    int totalOutputTokens = 0;
    StringBuilder textCollector = new StringBuilder();
    String assistantText = null;

    try {
      ToolExecutor executor = this.toolExecutor;
      List<Map<String, Object>> tools = this.toolDefinitions;
      for (int i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        LlmResponse response =
            llmClient.sendMessagesStreaming(
                llmMessages, tools, chunk -> emitter.emit(ChatEvent.text(chunk)));
        totalInputTokens += response.inputTokens();
        totalOutputTokens += response.outputTokens();

        if (response.content() != null && !response.content().isBlank()) {
          if (!textCollector.isEmpty()) {
            textCollector.append("\n\n");
          }
          textCollector.append(response.content());
        }

        if (!response.hasToolCalls()) {
          break;
        }

        if (executor == null) {
          if (textCollector.isEmpty()) {
            textCollector.append(
                "Tool execution is not available. The MCP Server is not installed or configured.");
          }
          break;
        }

        llmMessages.add(
            LlmMessage.assistantWithToolCalls(response.content(), response.toolCalls()));

        for (LlmToolCall toolCall : response.toolCalls()) {
          Map<String, Object> inputArgs = parseToolArguments(toolCall.arguments());
          emitter.emit(ChatEvent.toolCallStart(toolCall.name(), inputArgs));

          String resultContent =
              executor.executeTool(catalogSecurityContext, toolCall.name(), toolCall.arguments());

          llmMessages.add(LlmMessage.toolResult(toolCall.id(), resultContent));

          Object parsedResult = parseToolResult(resultContent);
          emitter.emit(ChatEvent.toolCallEnd(toolCall.name(), parsedResult));

          allToolCalls.add(
              new ToolCall()
                  .withName(toolCall.name())
                  .withInput(inputArgs)
                  .withResult(parsedResult));
        }
      }

      assistantText =
          textCollector.isEmpty()
              ? "I was unable to complete the request within the allowed tool call limit."
              : textCollector.toString();
    } catch (Exception e) {
      LOG.error("LLM call failed for conversation {}", conversation.getId(), e);
      assistantText = "Sorry, an error occurred while processing your request. Please try again.";
      emitter.emit(ChatEvent.error(assistantText));
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
      String title = generateTitle(userMessage);
      conversation.setTitle(title);
      emitter.emit(ChatEvent.titleUpdated(title));
    }
    conversationRepository.update(conversation);

    emitter.emit(ChatEvent.messageComplete(assistantMsg));
    emitter.emit(ChatEvent.done());
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
        messageRepository.listByConversation(conversationId, CONVERSATION_LOAD_LIMIT, 0);
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
        messageRepository.listByConversation(conversationId, LLM_CONTEXT_MESSAGE_LIMIT, 0);

    for (McpMessage msg : history) {
      boolean isHuman = msg.getSender() == CreateMcpMessage.Sender.HUMAN;
      LlmMessage.Role role = isHuman ? LlmMessage.Role.user : LlmMessage.Role.assistant;

      String textContent = extractTextFromMessage(msg);
      if (!isHuman) {
        String toolSummary = extractToolSummaryFromMessage(msg);
        if (toolSummary != null) {
          String combined =
              (textContent != null ? textContent + "\n\n" : "")
                  + "[Tools used: "
                  + toolSummary
                  + "]";
          llmMessages.add(new LlmMessage(role, combined, null, null));
          continue;
        }
      }
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

  private String extractToolSummaryFromMessage(McpMessage message) {
    if (message.getContent() == null) {
      return null;
    }
    List<String> toolNames = new ArrayList<>();
    for (MessageBlock block : message.getContent()) {
      if (block.getTools() != null) {
        for (ToolCall tc : block.getTools()) {
          toolNames.add(tc.getName());
        }
      }
    }
    return toolNames.isEmpty() ? null : String.join(", ", toolNames);
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

  private Object parseToolResult(String resultContent) {
    if (resultContent == null || resultContent.isBlank()) {
      return Collections.emptyMap();
    }
    try {
      return JsonUtils.readValue(resultContent, Object.class);
    } catch (Exception e) {
      return resultContent;
    }
  }

  private void verifyOwnership(SecurityContext securityContext, McpConversation conversation) {
    User user = getSubjectContext(securityContext).user();
    if (!conversation.getUser().getId().equals(user.getId())) {
      throw new EntityNotFoundException("Conversation not found: " + conversation.getId());
    }
  }

  private String generateTitle(String userMessage) {
    try {
      List<LlmMessage> titleMessages =
          List.of(
              LlmMessage.system(
                  "Generate a short title (5-7 words max) for a conversation starting with this"
                      + " message. Reply with only the title text, no quotes or extra"
                      + " punctuation."),
              LlmMessage.user(userMessage));
      LlmResponse response = llmClient.sendMessages(titleMessages, null);
      String title = response.content();
      if (title != null) {
        title = title.trim().replaceAll("^\"|\"$", "");
        if (title.length() > 100) {
          title = title.substring(0, 97) + "...";
        }
      }
      return title;
    } catch (Exception e) {
      LOG.warn("Failed to generate conversation title", e);
      return truncateTitle(userMessage);
    }
  }

  private String truncateTitle(String message) {
    if (message == null) {
      return null;
    }
    return message.length() > 100 ? message.substring(0, 97) + "..." : message;
  }
}
