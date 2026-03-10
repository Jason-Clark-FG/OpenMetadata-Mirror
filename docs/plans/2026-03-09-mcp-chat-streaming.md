# MCP Chat Event-Level SSE Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add event-level SSE streaming to the MCP chat backend and frontend so users see progressive updates (tool calls starting/ending, text chunks) instead of waiting for the entire response.

**Architecture:** New `POST /v1/mcp-client/chat/stream` endpoint returns `text/event-stream`. The backend uses Jersey `StreamingOutput` (same pattern as `IngestionPipelineResource.streamLogs`) to push SSE events as each step of the LLM loop completes. The frontend uses native `fetch` + `ReadableStream` to parse events and update the UI incrementally. The existing synchronous `/chat` endpoint stays for backward compatibility.

**Tech Stack:** Java 21 / Dropwizard / Jersey SSE (`StreamingOutput`), Jackson for JSON serialization, TypeScript `fetch` API with `ReadableStream` for SSE parsing.

---

### Task 1: Create ChatEvent record and ChatEventEmitter interface

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/ChatEvent.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/ChatEventEmitter.java`

**Step 1: Create ChatEvent**

`ChatEvent` is a record that represents a single SSE event. It holds the event type and a data payload (serialized to JSON).

```java
package org.openmetadata.service.mcpclient;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChatEvent(String event, Object data) {

  public static ChatEvent conversationCreated(java.util.UUID conversationId) {
    return new ChatEvent("conversation_created", java.util.Map.of("conversationId", conversationId));
  }

  public static ChatEvent text(String content) {
    return new ChatEvent("text", java.util.Map.of("content", content));
  }

  public static ChatEvent toolCallStart(String name, java.util.Map<String, Object> input) {
    return new ChatEvent("tool_call_start", java.util.Map.of("name", name, "input", input));
  }

  public static ChatEvent toolCallEnd(String name, Object result) {
    return new ChatEvent("tool_call_end", java.util.Map.of("name", name, "result", result));
  }

  public static ChatEvent messageComplete(Object message) {
    return new ChatEvent("message_complete", java.util.Map.of("message", message));
  }

  public static ChatEvent error(String message) {
    return new ChatEvent("error", java.util.Map.of("message", message));
  }

  public static ChatEvent done() {
    return new ChatEvent("done", java.util.Map.of());
  }
}
```

**Step 2: Create ChatEventEmitter**

A functional interface that `McpClientService.chatStream()` calls to push events.

```java
package org.openmetadata.service.mcpclient;

@FunctionalInterface
public interface ChatEventEmitter {
  void emit(ChatEvent event);
}
```

**Step 3: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/ChatEvent.java \
        openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/ChatEventEmitter.java
git commit -m "feat(mcp): add ChatEvent record and ChatEventEmitter interface"
```

---

### Task 2: Add chatStream method to McpClientService

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/McpClientService.java`

**Context:** The existing `chat()` method (lines 89-228) runs the full LLM loop and returns a `ChatResponse`. We add a new `chatStream()` method that takes a `ChatEventEmitter` and emits events at each step instead of accumulating results. The existing `chat()` method stays unchanged.

**Step 1: Add the chatStream method**

Add the following method to `McpClientService`. It mirrors the logic of `chat()` but emits events instead of returning a single response.

```java
public void chatStream(
    SecurityContext securityContext,
    UUID conversationId,
    String userMessage,
    ChatEventEmitter emitter) {
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
      LlmResponse response = llmClient.sendMessages(llmMessages, tools);
      totalInputTokens += response.inputTokens();
      totalOutputTokens += response.outputTokens();

      if (response.content() != null && !response.content().isBlank()) {
        if (!textCollector.isEmpty()) {
          textCollector.append("\n\n");
        }
        textCollector.append(response.content());
        emitter.emit(ChatEvent.text(response.content()));
      }

      if (!response.hasToolCalls()) {
        break;
      }

      if (executor == null) {
        if (textCollector.isEmpty()) {
          String msg =
              "Tool execution is not available. The MCP Server is not installed or configured.";
          textCollector.append(msg);
          emitter.emit(ChatEvent.text(msg));
        }
        break;
      }

      llmMessages.add(
          LlmMessage.assistantWithToolCalls(response.content(), response.toolCalls()));

      for (LlmToolCall toolCall : response.toolCalls()) {
        Map<String, Object> inputArgs = parseToolArguments(toolCall.arguments());
        emitter.emit(ChatEvent.toolCallStart(toolCall.name(), inputArgs));

        String resultContent =
            executor.executeTool(
                authorizer,
                limits,
                catalogSecurityContext,
                toolCall.name(),
                toolCall.arguments());

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
    assistantText =
        "Sorry, an error occurred while processing your request. Please try again.";
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
    conversation.setTitle(truncateTitle(userMessage));
  }
  conversationRepository.update(conversation);

  emitter.emit(ChatEvent.messageComplete(assistantMsg));
  emitter.emit(ChatEvent.done());
}
```

**Step 2: Run spotless**

```bash
cd openmetadata-service && mvn spotless:apply
```

**Step 3: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/McpClientService.java
git commit -m "feat(mcp): add chatStream method with event emitter"
```

---

### Task 3: Add streaming endpoint to McpClientResource

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/resources/mcpclient/McpClientResource.java`

**Context:** Add a new `POST /v1/mcp-client/chat/stream` endpoint that returns `text/event-stream`. It uses `StreamingOutput` to write SSE events to the output stream, same pattern used in `IngestionPipelineResource` (line 1059).

**Step 1: Add the streaming endpoint**

Add these imports at the top of `McpClientResource.java`:

```java
import jakarta.ws.rs.core.StreamingOutput;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.openmetadata.schema.utils.JsonUtils;
```

Add this method after the existing `chat()` method:

```java
@POST
@Path("/chat/stream")
@Produces("text/event-stream")
@Operation(
    operationId = "mcpClientChatStream",
    summary = "Chat with the MCP assistant (streaming)",
    description =
        "Send a message and get a streaming response via Server-Sent Events.",
    responses = {
      @ApiResponse(
          responseCode = "200",
          description = "SSE event stream",
          content = @Content(mediaType = "text/event-stream")),
      @ApiResponse(responseCode = "400", description = "Bad request")
    })
public Response chatStream(
    @Context SecurityContext securityContext, @Valid ChatRequest request) {
  if (mcpClientService == null || !mcpClientService.isEnabled()) {
    return Response.status(Response.Status.SERVICE_UNAVAILABLE)
        .entity(
            Map.of(
                "message",
                "MCP Client is not enabled. Configure mcpClientConfiguration in openmetadata.yaml."))
        .type(jakarta.ws.rs.core.MediaType.APPLICATION_JSON_TYPE)
        .build();
  }

  StreamingOutput streamingOutput =
      output -> {
        try {
          mcpClientService.chatStream(
              securityContext,
              request.getConversationId(),
              request.getMessage(),
              event -> writeSseEvent(output, event.event(), event.data()));
        } catch (Exception e) {
          writeSseEvent(
              output,
              "error",
              Map.of("message", "An unexpected error occurred."));
          writeSseEvent(output, "done", Map.of());
        }
      };

  return Response.ok(streamingOutput)
      .type("text/event-stream")
      .header("Cache-Control", "no-cache")
      .header("X-Accel-Buffering", "no")
      .build();
}

private static void writeSseEvent(OutputStream output, String event, Object data) {
  try {
    String json = JsonUtils.pojoToJson(data);
    String sseFrame = "event: " + event + "\ndata: " + json + "\n\n";
    output.write(sseFrame.getBytes(StandardCharsets.UTF_8));
    output.flush();
  } catch (IOException e) {
    throw new RuntimeException(e);
  }
}
```

**Step 2: Run spotless**

```bash
cd openmetadata-service && mvn spotless:apply
```

**Step 3: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/resources/mcpclient/McpClientResource.java
git commit -m "feat(mcp): add POST /chat/stream SSE endpoint"
```

---

### Task 4: Add streamChatMessage to frontend API client

**Files:**
- Modify: `openmetadata-ui/src/main/resources/ui/src/rest/mcpClientAPI.ts`

**Context:** The frontend needs a function that calls the new `/chat/stream` endpoint using native `fetch` (not axios, which doesn't support streaming). It reads the SSE stream and invokes callbacks for each event type. Auth tokens are obtained via `getOidcToken()` from `utils/SwTokenStorageUtils`. The API base URL is `${getBasePath()}/api/v1`.

**Step 1: Add SSE event types and streamChatMessage function**

Append the following to `mcpClientAPI.ts`:

```typescript
export type ChatStreamEvent =
  | { event: 'conversation_created'; data: { conversationId: string } }
  | { event: 'text'; data: { content: string } }
  | { event: 'tool_call_start'; data: { name: string; input: Record<string, unknown> } }
  | { event: 'tool_call_end'; data: { name: string; result: unknown } }
  | { event: 'message_complete'; data: { message: McpMessage } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, never> };

export interface ChatStreamCallbacks {
  onEvent: (event: ChatStreamEvent) => void;
  onError?: (error: Error) => void;
}

export const streamChatMessage = async (
  request: ChatRequest,
  callbacks: ChatStreamCallbacks
): Promise<void> => {
  const { getOidcToken } = await import(
    '../utils/SwTokenStorageUtils'
  );
  const { getBasePath } = await import('../utils/HistoryUtils');

  const token = await getOidcToken();
  const basePath = getBasePath();

  const response = await fetch(`${basePath}/api/v1${BASE}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventBlock of events) {
        if (!eventBlock.trim()) {
          continue;
        }

        let eventName = '';
        let eventData = '';

        for (const line of eventBlock.split('\n')) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (eventName && eventData) {
          try {
            const parsed = JSON.parse(eventData);
            callbacks.onEvent({ event: eventName, data: parsed } as ChatStreamEvent);
          } catch {
            // skip malformed events
          }
        }
      }
    }
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  } finally {
    reader.releaseLock();
  }
};
```

**Step 2: Commit**

```bash
git add openmetadata-ui/src/main/resources/ui/src/rest/mcpClientAPI.ts
git commit -m "feat(mcp): add streamChatMessage SSE client function"
```

---

### Task 5: Update McpChatPage to use streaming

**Files:**
- Modify: `openmetadata-ui/src/main/resources/ui/src/pages/McpChatPage/McpChatPage.tsx`

**Context:** Replace the `sendChatMessage` call in `handleSendMessage` with `streamChatMessage`. The UI should:
1. Show an empty assistant bubble immediately when sending
2. Append text content as `text` events arrive
3. Show tool calls as `tool_call_start` / `tool_call_end` events arrive
4. Replace the temporary message with the final `McpMessage` on `message_complete`
5. Update `activeConversationId` on `conversation_created`

**Step 1: Update imports**

Replace the `sendChatMessage` import with `streamChatMessage` and `ChatStreamEvent`:

Change:
```typescript
import {
  ChatResponse,
  deleteConversation,
  listConversations,
  listMessages,
  McpConversation,
  McpMessage,
  MessageBlock,
  sendChatMessage,
  ToolCallInfo,
} from '../../rest/mcpClientAPI';
```

To:
```typescript
import {
  ChatStreamEvent,
  deleteConversation,
  listConversations,
  listMessages,
  McpConversation,
  McpMessage,
  MessageBlock,
  streamChatMessage,
  ToolCallInfo,
} from '../../rest/mcpClientAPI';
```

**Step 2: Replace handleSendMessage**

Replace the entire `handleSendMessage` callback (lines 136-201) with the streaming version. Key differences:
- Creates a temporary assistant message immediately
- Uses `streamChatMessage` with an `onEvent` callback
- Updates state incrementally as events arrive
- Replaces temp messages with final `message_complete` data

```typescript
const handleSendMessage = useCallback(async () => {
  const trimmedInput = inputValue.trim();
  if (isEmpty(trimmedInput) || isSending) {
    return;
  }

  setErrorMessage(undefined);

  const userMessage: McpMessage = {
    id: `temp-user-${Date.now()}`,
    conversationId: activeConversationId ?? '',
    sender: 'human',
    index: messages.length,
    timestamp: Date.now(),
    content: [
      {
        type: 'Generic',
        textMessage: { type: 'plain', message: trimmedInput },
      },
    ],
  };

  const assistantTempId = `temp-assistant-${Date.now()}`;
  const assistantMessage: McpMessage = {
    id: assistantTempId,
    conversationId: activeConversationId ?? '',
    sender: 'assistant',
    index: messages.length + 1,
    timestamp: Date.now(),
    content: [],
  };

  setMessages((prev) => [...prev, userMessage, assistantMessage]);
  setInputValue('');
  setIsSending(true);

  let streamConversationId = activeConversationId;

  try {
    await streamChatMessage(
      {
        conversationId: activeConversationId,
        message: trimmedInput,
      },
      {
        onEvent: (event: ChatStreamEvent) => {
          switch (event.event) {
            case 'conversation_created':
              streamConversationId = event.data.conversationId;
              setActiveConversationId(event.data.conversationId);
              fetchConversations();
              break;

            case 'text':
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantTempId) {
                    return m;
                  }
                  const existingText =
                    m.content
                      ?.find((b) => b.textMessage)
                      ?.textMessage?.message ?? '';
                  const newText = existingText
                    ? `${existingText}\n\n${event.data.content}`
                    : event.data.content;

                  return {
                    ...m,
                    content: [
                      {
                        type: 'Generic' as const,
                        textMessage: {
                          type: 'markdown' as const,
                          message: newText,
                        },
                        tools: m.content?.[0]?.tools,
                      },
                    ],
                  };
                })
              );
              break;

            case 'tool_call_start':
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantTempId) {
                    return m;
                  }
                  const currentTools = m.content?.[0]?.tools ?? [];
                  const updatedTools = [
                    ...currentTools,
                    {
                      name: event.data.name,
                      input: event.data.input,
                    },
                  ];

                  return {
                    ...m,
                    content: [
                      {
                        type: 'Generic' as const,
                        textMessage: m.content?.[0]?.textMessage,
                        tools: updatedTools,
                      },
                    ],
                  };
                })
              );
              break;

            case 'tool_call_end':
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantTempId) {
                    return m;
                  }
                  const updatedTools = (m.content?.[0]?.tools ?? []).map(
                    (tool) => {
                      if (
                        tool.name === event.data.name &&
                        tool.result === undefined
                      ) {
                        return { ...tool, result: event.data.result };
                      }

                      return tool;
                    }
                  );

                  return {
                    ...m,
                    content: [
                      {
                        type: 'Generic' as const,
                        textMessage: m.content?.[0]?.textMessage,
                        tools: updatedTools,
                      },
                    ],
                  };
                })
              );
              break;

            case 'message_complete':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTempId ? event.data.message : m
                )
              );
              break;

            case 'error':
              setErrorMessage(event.data.message);
              break;

            case 'done':
              break;
          }
        },
        onError: (error: Error) => {
          setErrorMessage(error.message);
        },
      }
    );
  } catch (error) {
    const errText = getErrorText(
      error as AxiosError,
      t('server.unexpected-error')
    );
    setErrorMessage(errText);
    setMessages((prev) =>
      prev.filter(
        (m) => m.id !== userMessage.id && m.id !== assistantTempId
      )
    );
    setInputValue(trimmedInput);
  } finally {
    setIsSending(false);
  }
}, [
  inputValue,
  isSending,
  activeConversationId,
  messages.length,
  fetchConversations,
  t,
]);
```

**Step 3: Commit**

```bash
git add openmetadata-ui/src/main/resources/ui/src/pages/McpChatPage/McpChatPage.tsx
git commit -m "feat(mcp): update McpChatPage to consume SSE stream"
```

---

### Task 6: Run spotless and verify build

**Step 1: Run Java formatting**

```bash
cd /path/to/OpenMetadata && mvn spotless:apply -pl openmetadata-service
```

**Step 2: Verify backend compiles**

```bash
mvn clean compile -pl openmetadata-service -DskipTests
```
Expected: BUILD SUCCESS

**Step 3: Verify frontend compiles**

```bash
cd openmetadata-ui/src/main/resources/ui && yarn lint
```
Expected: No errors on modified files

**Step 4: Commit any formatting fixes**

```bash
git add -A && git commit -m "style: apply spotless and lint fixes"
```
