# MCP Client with Message Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an MCP Client to OpenMetadata so users can interact with the MCP Server tools through a chat UI, with full conversation and message tracking.

**Architecture:** Two new DB tables (`chat_conversation`, `chat_message`) store conversations and messages (inspired by Collate). A new REST resource (`/v1/mcp-client`) exposes CRUD for conversations/messages and a `/chat` endpoint that orchestrates user message → LLM (with MCP tool definitions) → tool execution loop → AI response. The UI adds a `/chat` page with a conversation sidebar and message thread.

**Tech Stack:** Java 21 / Dropwizard (backend), MCP Java SDK 0.17.1, Java HttpClient (LLM calls), React + TypeScript + MUI (frontend), JDBI (DAOs), Flyway (migrations).

**Acceptance Criteria:** Backend is there, UI is there, and a user can directly interact with the MCP Server via the UI MCP Client natively.

---

## Task 1: JSON Schemas for Chat Entities

Create the data model schemas that drive code generation for both Java and TypeScript.

**Files:**
- Create: `openmetadata-spec/src/main/resources/json/schema/entity/chat/chatConversation.json`
- Create: `openmetadata-spec/src/main/resources/json/schema/entity/chat/chatMessage.json`
- Create: `openmetadata-spec/src/main/resources/json/schema/entity/chat/content/messageBlock.json`
- Create: `openmetadata-spec/src/main/resources/json/schema/entity/chat/content/chatContentType.json`
- Create: `openmetadata-spec/src/main/resources/json/schema/api/chat/createChatConversation.json`
- Create: `openmetadata-spec/src/main/resources/json/schema/api/chat/createChatMessage.json`

### chatConversation.json
```json
{
  "$id": "https://open-metadata.org/schema/entity/chat/chatConversation.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatConversation",
  "description": "A chat conversation between a user and the AI assistant via the MCP Client.",
  "type": "object",
  "javaType": "org.openmetadata.schema.entity.chat.ChatConversation",
  "properties": {
    "id": {
      "description": "Unique identifier for the conversation.",
      "$ref": "../../type/basic.json#/definitions/uuid"
    },
    "user": {
      "description": "User who owns this conversation.",
      "$ref": "../../type/entityReference.json"
    },
    "createdAt": {
      "description": "Timestamp when the conversation was created.",
      "$ref": "../../type/basic.json#/definitions/timestamp"
    },
    "createdBy": {
      "description": "User who created the conversation.",
      "type": "string"
    },
    "updatedAt": {
      "description": "Timestamp when the conversation was last updated.",
      "$ref": "../../type/basic.json#/definitions/timestamp"
    },
    "updatedBy": {
      "description": "User who last updated the conversation.",
      "type": "string"
    },
    "title": {
      "description": "Title of the conversation (first 100 chars of first user message or generated).",
      "type": "string",
      "maxLength": 100
    },
    "messageCount": {
      "description": "Total number of messages in this conversation.",
      "type": "integer",
      "default": 0
    },
    "chatMessages": {
      "description": "Messages in this conversation (populated on fetch).",
      "type": "array",
      "items": {
        "$ref": "./chatMessage.json"
      }
    }
  },
  "additionalProperties": false,
  "required": ["id", "user", "createdAt"]
}
```

### chatMessage.json
```json
{
  "$id": "https://open-metadata.org/schema/entity/chat/chatMessage.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatMessage",
  "description": "A message within a chat conversation, supporting text and tool usage tracking.",
  "type": "object",
  "javaType": "org.openmetadata.schema.entity.chat.ChatMessage",
  "definitions": {
    "sender": {
      "description": "Sender type.",
      "type": "string",
      "enum": ["human", "assistant"]
    },
    "tokens": {
      "description": "LLM token usage for generating this message.",
      "type": "object",
      "javaType": "org.openmetadata.schema.entity.chat.TokenUsage",
      "properties": {
        "inputTokens": { "type": "integer", "minimum": 0 },
        "outputTokens": { "type": "integer", "minimum": 0 },
        "totalTokens": { "type": "integer", "minimum": 0 }
      }
    }
  },
  "properties": {
    "id": {
      "description": "Unique identifier for the message.",
      "$ref": "../../type/basic.json#/definitions/uuid"
    },
    "conversationId": {
      "description": "ID of the conversation this message belongs to.",
      "$ref": "../../type/basic.json#/definitions/uuid"
    },
    "sender": {
      "$ref": "#/definitions/sender"
    },
    "index": {
      "description": "Sequential index of the message in the conversation.",
      "type": "integer"
    },
    "timestamp": {
      "description": "Timestamp when the message was sent.",
      "$ref": "../../type/basic.json#/definitions/timestamp"
    },
    "content": {
      "description": "Rich content blocks.",
      "type": "array",
      "items": {
        "$ref": "./content/messageBlock.json"
      }
    },
    "tokens": {
      "description": "LLM token usage for generating this message.",
      "$ref": "#/definitions/tokens"
    }
  },
  "additionalProperties": false,
  "required": ["id", "conversationId", "sender", "index", "timestamp"]
}
```

### content/messageBlock.json
```json
{
  "$id": "https://open-metadata.org/schema/entity/chat/content/messageBlock.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MessageBlock",
  "description": "A content block for a chat message supporting text and tool tracking.",
  "type": "object",
  "javaType": "org.openmetadata.schema.entity.chat.content.MessageBlock",
  "definitions": {
    "textMessageType": {
      "type": "string",
      "enum": ["plain", "markdown"],
      "default": "markdown"
    },
    "textMessage": {
      "type": "object",
      "javaType": "org.openmetadata.schema.entity.chat.content.TextMessage",
      "properties": {
        "type": { "$ref": "#/definitions/textMessageType", "default": "markdown" },
        "message": { "type": "string" }
      }
    },
    "toolCall": {
      "type": "object",
      "javaType": "org.openmetadata.schema.entity.chat.content.ToolCall",
      "properties": {
        "name": { "type": "string" },
        "input": { "existingJavaType": "java.lang.Object", "type": "object" },
        "result": { "existingJavaType": "java.lang.Object", "type": "object" }
      },
      "required": ["name"]
    }
  },
  "properties": {
    "type": {
      "$ref": "./chatContentType.json",
      "default": "Generic"
    },
    "textMessage": {
      "$ref": "#/definitions/textMessage"
    },
    "tools": {
      "description": "Tool calls made during message generation.",
      "type": "array",
      "items": { "$ref": "#/definitions/toolCall" }
    }
  }
}
```

### content/chatContentType.json
```json
{
  "$id": "https://open-metadata.org/schema/entity/chat/content/chatContentType.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatContentType",
  "description": "Chat content type.",
  "javaType": "org.openmetadata.schema.entity.chat.content.ChatContentType",
  "type": "string",
  "enum": ["Generic"]
}
```

### api/chat/createChatConversation.json
```json
{
  "$id": "https://open-metadata.org/schema/api/chat/createChatConversation.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CreateChatConversation",
  "description": "Request to create a new chat conversation.",
  "type": "object",
  "javaType": "org.openmetadata.schema.api.chat.CreateChatConversation",
  "properties": {
    "title": {
      "description": "Optional title for the conversation.",
      "type": "string",
      "maxLength": 100
    }
  },
  "additionalProperties": false
}
```

### api/chat/createChatMessage.json
```json
{
  "$id": "https://open-metadata.org/schema/api/chat/createChatMessage.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CreateChatMessage",
  "description": "Request to create a new chat message.",
  "type": "object",
  "javaType": "org.openmetadata.schema.api.chat.CreateChatMessage",
  "properties": {
    "sender": {
      "$ref": "../../entity/chat/chatMessage.json#/definitions/sender"
    },
    "content": {
      "description": "Rich content blocks.",
      "type": "array",
      "items": {
        "$ref": "../../entity/chat/content/messageBlock.json"
      }
    },
    "timestamp": {
      "description": "Timestamp when the message was sent.",
      "$ref": "../../type/basic.json#/definitions/timestamp"
    },
    "tokens": {
      "description": "LLM token usage.",
      "$ref": "../../entity/chat/chatMessage.json#/definitions/tokens"
    }
  },
  "additionalProperties": false,
  "required": ["sender", "timestamp"]
}
```

**Step: Run schema generation**
```bash
cd openmetadata-spec && mvn clean install -DskipTests
```

**Commit:** `feat: add JSON schemas for chat conversation and message entities`

---

## Task 2: SQL Migrations for Chat Tables

Create the `chat_conversation` and `chat_message` tables for both MySQL and PostgreSQL.

**Files:**
- Create: `bootstrap/sql/migrations/native/1.13.0/mysql/schemaChanges.sql` (append)
- Create: `bootstrap/sql/migrations/native/1.13.0/postgres/schemaChanges.sql` (append)

Since 1.13.0 migrations already exist, we append to them.

### MySQL

```sql
-- Chat conversation
CREATE TABLE IF NOT EXISTS chat_conversation (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.id') STORED NOT NULL,
  json JSON NOT NULL,
  userId VARCHAR(256) GENERATED ALWAYS AS (json ->> '$.user.id') NOT NULL,
  createdAt BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.createdAt') NOT NULL,
  updatedAt BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.updatedAt') NOT NULL,
  createdBy VARCHAR(50) GENERATED ALWAYS AS (json ->> '$.createdBy') NOT NULL,
  updatedBy VARCHAR(50) GENERATED ALWAYS AS (json ->> '$.updatedBy') NOT NULL,
  messageCount INT GENERATED ALWAYS AS (json ->> '$.messageCount') STORED,

  PRIMARY KEY (id),
  INDEX idx_chat_conversation_user_updated (userId, updatedAt DESC)
);

-- Chat message
CREATE TABLE IF NOT EXISTS chat_message (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.id') STORED NOT NULL,
  json JSON NOT NULL,
  conversationId VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.conversationId') STORED NOT NULL,
  sender VARCHAR(10) GENERATED ALWAYS AS (json ->> '$.sender') STORED NOT NULL,
  messageIndex INT GENERATED ALWAYS AS (json ->> '$.index') STORED,
  timestamp BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.timestamp') NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_message_conversation FOREIGN KEY (conversationId) REFERENCES chat_conversation(id) ON DELETE CASCADE,
  INDEX idx_chat_message_conversation_index (conversationId, messageIndex),
  INDEX idx_chat_message_conversation_created (conversationId, timestamp)
);
```

### PostgreSQL

```sql
-- Chat conversation
CREATE TABLE IF NOT EXISTS chat_conversation (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> 'id') STORED NOT NULL,
  json JSONB NOT NULL,
  userId VARCHAR(256) GENERATED ALWAYS AS (json ->> 'user.id') STORED NOT NULL,
  createdAt BIGINT GENERATED ALWAYS AS ((json ->> 'createdAt')::bigint) STORED NOT NULL,
  updatedAt BIGINT GENERATED ALWAYS AS ((json ->> 'updatedAt')::bigint) STORED NOT NULL,
  createdBy VARCHAR(50) GENERATED ALWAYS AS (json ->> 'createdBy') STORED NOT NULL,
  updatedBy VARCHAR(50) GENERATED ALWAYS AS (json ->> 'updatedBy') STORED NOT NULL,
  messageCount INT GENERATED ALWAYS AS ((json ->> 'messageCount')::int) STORED,

  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_chat_conversation_user_updated ON chat_conversation (userId, updatedAt DESC);

-- Chat message
CREATE TABLE IF NOT EXISTS chat_message (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> 'id') STORED NOT NULL,
  json JSONB NOT NULL,
  conversationId VARCHAR(36) GENERATED ALWAYS AS (json ->> 'conversationId') STORED NOT NULL,
  sender VARCHAR(10) GENERATED ALWAYS AS (json ->> 'sender') STORED NOT NULL,
  messageIndex INT GENERATED ALWAYS AS ((json ->> 'index')::int) STORED,
  timestamp BIGINT GENERATED ALWAYS AS ((json ->> 'timestamp')::bigint) STORED NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_message_conversation FOREIGN KEY (conversationId) REFERENCES chat_conversation(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_index ON chat_message (conversationId, messageIndex);
CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_created ON chat_message (conversationId, timestamp);
```

**Commit:** `feat: add SQL migrations for chat_conversation and chat_message tables`

---

## Task 3: Backend Configuration — McpClientConfiguration

Add configuration for the MCP Client LLM provider.

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/config/McpClientConfiguration.java`
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/OpenMetadataApplicationConfig.java`
- Modify: `conf/openmetadata.yaml`

### McpClientConfiguration.java
```java
package org.openmetadata.service.config;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class McpClientConfiguration {
  @JsonProperty("enabled")
  private boolean enabled = false;

  @JsonProperty("provider")
  private String provider = "openai";

  @JsonProperty("apiKey")
  private String apiKey;

  @JsonProperty("model")
  private String model = "gpt-4o";

  @JsonProperty("apiEndpoint")
  private String apiEndpoint;

  @JsonProperty("systemPrompt")
  private String systemPrompt = "You are a helpful metadata assistant for OpenMetadata. Use the available tools to search, explore, and manage metadata. Be concise and actionable.";
}
```

### OpenMetadataApplicationConfig.java — Add field
```java
@JsonProperty("mcpClientConfiguration")
private McpClientConfiguration mcpClientConfiguration;
```

### openmetadata.yaml — Add section
```yaml
mcpClientConfiguration:
  enabled: ${MCP_CLIENT_ENABLED:-false}
  provider: ${MCP_CLIENT_PROVIDER:-openai}
  apiKey: ${MCP_CLIENT_API_KEY:-}
  model: ${MCP_CLIENT_MODEL:-gpt-4o}
  apiEndpoint: ${MCP_CLIENT_API_ENDPOINT:-}
  systemPrompt: "You are a helpful metadata assistant for OpenMetadata. Use the available tools to search, explore, and manage metadata. Be concise and actionable."
```

**Commit:** `feat: add McpClientConfiguration for LLM provider settings`

---

## Task 4: Backend DAOs

Add DAO interfaces for chat_conversation and chat_message to CollectionDAO.

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/CollectionDAO.java`

### Add to CollectionDAO interface

```java
@CreateSqlObject
ChatConversationDAO chatConversationDAO();

@CreateSqlObject
ChatMessageDAO chatMessageDAO();
```

### ChatConversationDAO interface (inside CollectionDAO)

```java
interface ChatConversationDAO {
  @ConnectionAwareSqlUpdate(
      value = "INSERT INTO chat_conversation (json) VALUES (:json)",
      connectionType = MYSQL)
  @ConnectionAwareSqlUpdate(
      value = "INSERT INTO chat_conversation (json) VALUES (:json::jsonb)",
      connectionType = POSTGRES)
  void insert(@Bind("json") String json);

  @SqlQuery("SELECT json FROM chat_conversation WHERE id = :id")
  String getById(@BindUUID("id") UUID id);

  @SqlQuery(
      "SELECT json FROM chat_conversation WHERE userId = :userId "
          + "ORDER BY updatedAt DESC LIMIT :limit OFFSET :offset")
  List<String> listByUser(
      @BindUUID("userId") UUID userId, @Bind("limit") int limit, @Bind("offset") int offset);

  @ConnectionAwareSqlUpdate(
      value = "UPDATE chat_conversation SET json = :json WHERE id = :id",
      connectionType = MYSQL)
  @ConnectionAwareSqlUpdate(
      value = "UPDATE chat_conversation SET json = :json::jsonb WHERE id = :id",
      connectionType = POSTGRES)
  void update(@BindUUID("id") UUID id, @Bind("json") String json);

  @SqlQuery("SELECT COUNT(*) FROM chat_conversation WHERE userId = :userId")
  int countByUser(@BindUUID("userId") UUID userId);

  @SqlUpdate("DELETE FROM chat_conversation WHERE id = :id")
  void delete(@BindUUID("id") UUID id);
}
```

### ChatMessageDAO interface (inside CollectionDAO)

```java
interface ChatMessageDAO {
  @ConnectionAwareSqlUpdate(
      value = "INSERT INTO chat_message (json) VALUES (:json)",
      connectionType = MYSQL)
  @ConnectionAwareSqlUpdate(
      value = "INSERT INTO chat_message (json) VALUES (:json::jsonb)",
      connectionType = POSTGRES)
  void insert(@Bind("json") String json);

  @SqlQuery("SELECT json FROM chat_message WHERE id = :id")
  String getById(@BindUUID("id") UUID id);

  @SqlQuery(
      "SELECT json FROM chat_message WHERE conversationId = :conversationId "
          + "ORDER BY messageIndex ASC LIMIT :limit OFFSET :offset")
  List<String> listByConversation(
      @BindUUID("conversationId") UUID conversationId,
      @Bind("limit") int limit,
      @Bind("offset") int offset);

  @SqlQuery("SELECT COUNT(*) FROM chat_message WHERE conversationId = :conversationId")
  int countByConversation(@BindUUID("conversationId") UUID conversationId);

  @ConnectionAwareSqlUpdate(
      value = "UPDATE chat_message SET json = :json WHERE id = :id",
      connectionType = MYSQL)
  @ConnectionAwareSqlUpdate(
      value = "UPDATE chat_message SET json = :json::jsonb WHERE id = :id",
      connectionType = POSTGRES)
  void updateContent(@BindUUID("id") UUID id, @Bind("json") String json);

  @SqlUpdate("DELETE FROM chat_message WHERE id = :id")
  void delete(@BindUUID("id") UUID id);

  @SqlUpdate("DELETE FROM chat_message WHERE conversationId = :conversationId")
  void deleteByConversation(@BindUUID("conversationId") UUID conversationId);
}
```

**Commit:** `feat: add ChatConversationDAO and ChatMessageDAO to CollectionDAO`

---

## Task 5: Backend Repositories

Create repository classes that wrap the DAOs with business logic.

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/ChatConversationRepository.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/ChatMessageRepository.java`

### ChatConversationRepository.java

```java
package org.openmetadata.service.jdbi3;

import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.chat.CreateChatConversation;
import org.openmetadata.schema.entity.chat.ChatConversation;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.exception.CatalogExceptionMessage;
import org.openmetadata.service.exception.EntityNotFoundException;

@Slf4j
public class ChatConversationRepository {
  private final CollectionDAO.ChatConversationDAO dao;

  public ChatConversationRepository(CollectionDAO.ChatConversationDAO dao) {
    this.dao = dao;
  }

  public ChatConversation create(CreateChatConversation request, EntityReference user) {
    UUID id = UUID.randomUUID();
    long now = System.currentTimeMillis();
    ChatConversation conversation =
        new ChatConversation()
            .withId(id)
            .withUser(user)
            .withCreatedAt(now)
            .withUpdatedAt(now)
            .withCreatedBy(user.getName())
            .withUpdatedBy(user.getName())
            .withTitle(request.getTitle())
            .withMessageCount(0);
    dao.insert(JsonUtils.pojoToJson(conversation));
    return conversation;
  }

  public ChatConversation getById(UUID id) {
    String json = dao.getById(id);
    if (json == null) {
      throw EntityNotFoundException.byMessage(
          CatalogExceptionMessage.entityNotFound("ChatConversation", id.toString()));
    }
    return JsonUtils.readValue(json, ChatConversation.class);
  }

  public List<ChatConversation> listByUser(UUID userId, int limit, int offset) {
    List<String> rows = dao.listByUser(userId, limit, offset);
    return JsonUtils.readObjects(rows, ChatConversation.class);
  }

  public ChatConversation update(ChatConversation conversation) {
    conversation.setUpdatedAt(System.currentTimeMillis());
    dao.update(conversation.getId(), JsonUtils.pojoToJson(conversation));
    return conversation;
  }

  public int countByUser(UUID userId) {
    return dao.countByUser(userId);
  }

  public void delete(UUID id) {
    dao.delete(id);
  }
}
```

### ChatMessageRepository.java

```java
package org.openmetadata.service.jdbi3;

import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.chat.CreateChatMessage;
import org.openmetadata.schema.entity.chat.ChatMessage;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.exception.CatalogExceptionMessage;
import org.openmetadata.service.exception.EntityNotFoundException;

@Slf4j
public class ChatMessageRepository {
  private final CollectionDAO.ChatMessageDAO dao;

  public ChatMessageRepository(CollectionDAO.ChatMessageDAO dao) {
    this.dao = dao;
  }

  public ChatMessage create(CreateChatMessage request, UUID conversationId, int messageIndex) {
    UUID id = UUID.randomUUID();
    ChatMessage message =
        new ChatMessage()
            .withId(id)
            .withConversationId(conversationId)
            .withSender(request.getSender())
            .withIndex(messageIndex)
            .withTimestamp(request.getTimestamp())
            .withContent(request.getContent())
            .withTokens(request.getTokens());
    dao.insert(JsonUtils.pojoToJson(message));
    return message;
  }

  public ChatMessage getById(UUID id) {
    String json = dao.getById(id);
    if (json == null) {
      throw EntityNotFoundException.byMessage(
          CatalogExceptionMessage.entityNotFound("ChatMessage", id.toString()));
    }
    return JsonUtils.readValue(json, ChatMessage.class);
  }

  public List<ChatMessage> listByConversation(UUID conversationId, int limit, int offset) {
    List<String> rows = dao.listByConversation(conversationId, limit, offset);
    return JsonUtils.readObjects(rows, ChatMessage.class);
  }

  public int countByConversation(UUID conversationId) {
    return dao.countByConversation(conversationId);
  }

  public void delete(UUID id) {
    dao.delete(id);
  }

  public void deleteByConversation(UUID conversationId) {
    dao.deleteByConversation(conversationId);
  }
}
```

**Commit:** `feat: add ChatConversationRepository and ChatMessageRepository`

---

## Task 6: LLM Client Abstraction + MCP Tool Execution

Create the service that calls the LLM and handles the MCP tool call loop.

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmClient.java` (interface)
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/OpenAiLlmClient.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/AnthropicLlmClient.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmClientFactory.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmMessage.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmResponse.java`
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmToolCall.java`

### LlmClient.java (interface)
Defines `sendMessages(List<LlmMessage> messages, List<McpToolDefinition> tools) → LlmResponse`.

### LlmMessage.java (record)
Role enum (`system`, `user`, `assistant`, `tool`) + content string + optional tool call info.

### LlmResponse.java (record)
Content string + list of tool calls + token usage + stop reason.

### LlmToolCall.java (record)
Tool call ID + tool name + arguments (JSON string).

### OpenAiLlmClient.java
Uses Java `HttpClient` to call the OpenAI Chat Completions API (`/v1/chat/completions`).
- Converts `LlmMessage` list + tool definitions to OpenAI request JSON
- Parses response: if `tool_calls` present → returns `LlmToolCall` list
- If text content → returns content
- Tracks token usage from response

### AnthropicLlmClient.java
Uses Java `HttpClient` to call Anthropic Messages API (`/v1/messages`).
- Converts messages to Anthropic format (system prompt separate, user/assistant alternating)
- Handles tool_use content blocks → returns tool calls
- Handles text content blocks → returns content

### LlmClientFactory.java
```java
public static LlmClient create(McpClientConfiguration config) {
  return switch (config.getProvider()) {
    case "openai" -> new OpenAiLlmClient(config);
    case "anthropic" -> new AnthropicLlmClient(config);
    default -> throw new IllegalArgumentException("Unknown LLM provider: " + config.getProvider());
  };
}
```

**Commit:** `feat: add LLM client abstraction with OpenAI and Anthropic implementations`

---

## Task 7: MCP Client Service (Orchestrator)

The core service that ties together: conversation memory, MCP tools, LLM client, and the tool call loop.

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/McpClientService.java`

### Core Method: `chat(SecurityContext, UUID conversationId, String userMessage) → ChatMessage`

```
1. Get or create conversation
2. Store user message as ChatMessage (sender=human)
3. Load conversation history (last N messages)
4. Get MCP tool definitions from the MCP server's tools.json
5. Build LLM message list: system prompt + conversation history
6. LOOP:
   a. Call LLM with messages + tools
   b. If LLM returns tool_calls:
      - For each tool call: execute via DefaultToolContext.callTool()
      - Append tool results to message list
      - Continue loop
   c. If LLM returns text content: break loop
7. Store assistant response as ChatMessage (sender=assistant) with token usage + tool calls in content
8. Update conversation (messageCount, updatedAt, title if first message)
9. Return the assistant ChatMessage
```

The service gets MCP tool definitions from `tools.json` (same resource used by the MCP server). It executes tools directly via `DefaultToolContext.callTool()` (in-process, no HTTP roundtrip needed since we're in the same JVM).

**Commit:** `feat: add McpClientService orchestrating LLM + MCP tool execution loop`

---

## Task 8: REST Resource — McpClientResource

Expose the chat API as REST endpoints.

**Files:**
- Create: `openmetadata-service/src/main/java/org/openmetadata/service/resources/mcpclient/McpClientResource.java`

### Endpoints

```
POST   /v1/mcp-client/chat                              — Send message, get AI response
POST   /v1/mcp-client/conversations                     — Create new conversation
GET    /v1/mcp-client/conversations                     — List user's conversations
GET    /v1/mcp-client/conversations/{id}                — Get conversation with messages
DELETE /v1/mcp-client/conversations/{id}                — Delete conversation
GET    /v1/mcp-client/conversations/{id}/messages       — List messages in conversation
```

### POST /v1/mcp-client/chat — Request Body
```json
{
  "conversationId": "uuid (optional, creates new if absent)",
  "message": "What tables have PII data?"
}
```

### POST /v1/mcp-client/chat — Response
```json
{
  "conversationId": "uuid",
  "message": { ... ChatMessage with assistant response ... }
}
```

The resource uses `@Collection(name = "McpClient")` annotation for auto-registration. Constructor takes `Authorizer`, `Limits`, and reads `McpClientConfiguration` from the app config.

**Commit:** `feat: add McpClientResource REST endpoints for chat and conversations`

---

## Task 9: Backend Build & Verification

Run the full backend build to ensure everything compiles.

```bash
# Generate models from schemas
cd openmetadata-spec && mvn clean install -DskipTests

# Build backend
mvn clean package -DskipTests -DonlyBackend -pl !openmetadata-ui

# Format Java code
mvn spotless:apply
```

**Commit:** `chore: fix formatting after MCP client backend implementation`

---

## Task 10: Frontend — REST API Client

Create the TypeScript API client for the MCP Client endpoints.

**Files:**
- Create: `openmetadata-ui/src/main/resources/ui/src/rest/mcpClientAPI.ts`

```typescript
import { AxiosResponse } from 'axios';
import { ChatConversation } from '../generated/entity/chat/chatConversation';
import { ChatMessage } from '../generated/entity/chat/chatMessage';
import APIClient from './index';

const MCP_CLIENT_BASE = '/mcp-client';

export interface ChatRequest {
  conversationId?: string;
  message: string;
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
}

export const sendChatMessage = async (
  request: ChatRequest
): Promise<ChatResponse> => {
  const response = await APIClient.post<ChatResponse>(
    `${MCP_CLIENT_BASE}/chat`,
    request
  );
  return response.data;
};

export const createConversation = async (): Promise<ChatConversation> => {
  const response = await APIClient.post<ChatConversation>(
    `${MCP_CLIENT_BASE}/conversations`,
    {}
  );
  return response.data;
};

export const listConversations = async (
  limit = 20,
  offset = 0
): Promise<{ data: ChatConversation[]; paging: { total: number } }> => {
  const response = await APIClient.get(
    `${MCP_CLIENT_BASE}/conversations?limit=${limit}&offset=${offset}`
  );
  return response.data;
};

export const getConversation = async (
  id: string
): Promise<ChatConversation> => {
  const response = await APIClient.get<ChatConversation>(
    `${MCP_CLIENT_BASE}/conversations/${id}`
  );
  return response.data;
};

export const deleteConversation = async (id: string): Promise<void> => {
  await APIClient.delete(`${MCP_CLIENT_BASE}/conversations/${id}`);
};

export const listMessages = async (
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<{ data: ChatMessage[] }> => {
  const response = await APIClient.get(
    `${MCP_CLIENT_BASE}/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`
  );
  return response.data;
};
```

**Commit:** `feat: add frontend REST API client for MCP Client`

---

## Task 11: Frontend — Chat Page Components

Create the chat UI page with conversation sidebar and message thread.

**Files:**
- Create: `openmetadata-ui/src/main/resources/ui/src/pages/ChatPage/ChatPage.tsx`
- Create: `openmetadata-ui/src/main/resources/ui/src/pages/ChatPage/ConversationList.tsx`
- Create: `openmetadata-ui/src/main/resources/ui/src/pages/ChatPage/ChatMessages.tsx`
- Create: `openmetadata-ui/src/main/resources/ui/src/pages/ChatPage/ChatInput.tsx`
- Create: `openmetadata-ui/src/main/resources/ui/src/pages/ChatPage/ToolCallDisplay.tsx`

### ChatPage.tsx
Main page component with two-panel layout:
- Left panel (250px): ConversationList — shows past conversations, "New Chat" button
- Right panel: ChatMessages + ChatInput

State: `activeConversationId`, `conversations[]`, `messages[]`, `isLoading`

### ConversationList.tsx
- Fetches conversations via `listConversations()`
- Renders list with title + timestamp
- Click selects conversation → loads messages
- "New Chat" button at top
- Delete button per conversation

### ChatMessages.tsx
- Renders message list (user messages right-aligned, assistant left-aligned)
- Markdown rendering for assistant messages (use existing markdown component or `ReactMarkdown`)
- Shows tool calls inline (collapsible) via ToolCallDisplay
- Auto-scrolls to bottom on new messages

### ChatInput.tsx
- Text input (MUI TextField multiline) + Send button
- Enter to send, Shift+Enter for newline
- Disabled while loading
- Shows loading indicator while waiting for response

### ToolCallDisplay.tsx
- Collapsible card showing tool name + input/output
- Shows tool name as chip, expand to see JSON input/result

**Commit:** `feat: add ChatPage UI components with conversation list and message thread`

---

## Task 12: Frontend — Routes, Navigation, i18n

Wire the chat page into the app navigation.

**Files:**
- Modify: `openmetadata-ui/src/main/resources/ui/src/constants/constants.ts` — Add `CHAT: '/chat'` to ROUTES
- Modify: `openmetadata-ui/src/main/resources/ui/src/constants/LeftSidebar.constants.ts` — Add chat item to sidebar
- Modify: `openmetadata-ui/src/main/resources/ui/src/components/AppRouter/AuthenticatedAppRouter.tsx` — Add Route for /chat
- Modify: `openmetadata-ui/src/main/resources/ui/src/enums/sidebar.enum.ts` — Add `CHAT` to SidebarItem
- Modify: `openmetadata-ui/src/main/resources/ui/src/locale/languages/en-us.json` — Add i18n labels

### Route constant
```typescript
CHAT: '/chat',
```

### Sidebar item (add before Settings)
```typescript
{
  key: ROUTES.CHAT,
  title: 'label.chat',
  redirect_url: ROUTES.CHAT,
  icon: ChatIcon,
  dataTestId: `app-bar-item-${SidebarItem.CHAT}`,
}
```

### Authenticated route
```tsx
<Route element={<ChatPage />} path={ROUTES.CHAT} />
```

### i18n labels
```json
"label.chat": "Chat",
"label.new-chat": "New Chat",
"label.send": "Send",
"label.mcp-assistant": "MCP Assistant",
"label.no-conversation-selected": "No Conversation Selected",
"message.chat-placeholder": "Ask about your metadata...",
"message.chat-empty-state": "Start a conversation to explore your metadata using AI.",
"message.chat-mcp-disabled": "MCP Client is not configured. Please configure the LLM provider in openmetadata.yaml."
```

**Commit:** `feat: add chat route, navigation, and i18n labels`

---

## Task 13: Frontend Build & Lint

```bash
cd openmetadata-ui/src/main/resources/ui
yarn install
yarn lint:fix
yarn build
```

Fix any TypeScript or ESLint errors.

**Commit:** `chore: fix frontend lint/build issues`

---

## Task 14: Integration Verification

Full build and manual verification:

```bash
# Full build
mvn clean package -DskipTests

# Or start locally
./docker/run_local_docker.sh -m ui -d mysql
```

Verify:
1. `/chat` page loads in browser
2. Conversation list appears (empty initially)
3. Sending a message creates a conversation and returns AI response (when LLM configured)
4. Tool calls from MCP server are visible in the response
5. Conversation history persists across page refreshes
6. Can delete conversations

**Commit:** `chore: integration verification for MCP Client feature`
