# MCP Chat Application Configuration Schema

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written `McpClientConfiguration` class with a JSON Schema-generated `McpChatAppConfig`, following the same schema-first pattern used by all other native applications.

**Architecture:** Define a JSON Schema at `openmetadata-spec/` that generates a typed Java class via jsonschema2pojo. The schema `$ref`s the existing `AWSBaseConfig` for AWS credentials. All consumers (`McpChatApplication`, `McpClientService`, `LlmClientFactory`, LLM clients) switch from the hand-written config to the generated type.

**Tech Stack:** JSON Schema, jsonschema2pojo (Maven code generation), Java 21

---

## Chunk 1: Schema + Code Generation

### Task 1: Create the JSON Schema

**Files:**
- Create: `openmetadata-spec/src/main/resources/json/schema/entity/applications/configuration/internal/mcpChatAppConfig.json`

- [ ] **Step 1: Create the schema file**

```json
{
  "$id": "https://open-metadata.org/schema/entity/applications/configuration/internal/mcpChatAppConfig.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "McpChatAppConfig",
  "description": "Configuration for the MCP Chat Application.",
  "type": "object",
  "javaType": "org.openmetadata.schema.entity.app.internal.McpChatAppConfig",
  "properties": {
    "llmProvider": {
      "description": "LLM provider to use (openai or anthropic).",
      "type": "string",
      "default": "openai"
    },
    "llmApiKey": {
      "description": "API key for the LLM provider.",
      "type": "string",
      "format": "password"
    },
    "llmModel": {
      "description": "The model identifier to use (e.g., gpt-4o, anthropic.claude-sonnet-4-20250514-v1:0).",
      "type": "string",
      "default": "gpt-4o"
    },
    "llmApiEndpoint": {
      "description": "Custom API endpoint URL. Leave empty to use the provider default.",
      "type": "string"
    },
    "awsConfig": {
      "description": "AWS credentials for accessing Anthropic models via AWS Bedrock.",
      "$ref": "../../../../security/credentials/awsBaseConfig.json"
    },
    "systemPrompt": {
      "description": "The system prompt that guides the assistant behavior.",
      "type": "string",
      "default": "You are a helpful metadata assistant for OpenMetadata. Use the available tools to search, explore, and manage metadata. Be concise and actionable."
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Commit**

```bash
git add openmetadata-spec/src/main/resources/json/schema/entity/applications/configuration/internal/mcpChatAppConfig.json
git commit -m "feat(mcp): add JSON Schema for McpChatAppConfig"
```

### Task 2: Register in applicationConfig.json

**Files:**
- Modify: `openmetadata-spec/src/main/resources/json/schema/entity/applications/configuration/applicationConfig.json`

- [ ] **Step 1: Add the $ref entry**

Add a new `$ref` to the `appConfig` oneOf array, before the catch-all `additionalProperties: true` entry:

```json
{
  "$ref": "internal/mcpChatAppConfig.json"
}
```

The `oneOf` array should now include this entry right before the last generic object entry.

- [ ] **Step 2: Commit**

```bash
git add openmetadata-spec/src/main/resources/json/schema/entity/applications/configuration/applicationConfig.json
git commit -m "feat(mcp): register McpChatAppConfig in applicationConfig oneOf"
```

### Task 3: Generate the Java class

- [ ] **Step 1: Run Maven on openmetadata-spec to trigger code generation**

```bash
cd openmetadata-spec && mvn clean install -DskipTests
```

Expected: A generated class at `openmetadata-spec/target/generated-sources/jsonschema2pojo/org/openmetadata/schema/entity/app/internal/McpChatAppConfig.java` with typed getters/setters for `llmProvider`, `llmApiKey`, `llmModel`, `llmApiEndpoint`, `awsConfig` (type `AWSBaseConfig`), and `systemPrompt`.

- [ ] **Step 2: Verify the generated class has the correct `awsConfig` type**

```bash
grep -n "AWSBaseConfig\|awsConfig" openmetadata-spec/target/generated-sources/jsonschema2pojo/org/openmetadata/schema/entity/app/internal/McpChatAppConfig.java
```

Expected: `awsConfig` field is typed as `AWSBaseConfig`, not `Object` or `Map`.

---

## Chunk 2: Switch consumers to generated config

### Task 4: Update McpChatApplication to use McpChatAppConfig

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/apps/bundles/mcp/McpChatApplication.java`

- [ ] **Step 1: Replace the manual Map extraction with JsonUtils.convertValue**

Replace the entire `initializeService()` method body. The new version:

```java
private void initializeService() {
    Object appConfigObj = getApp().getAppConfiguration();
    if (appConfigObj == null) {
        LOG.warn("McpChatApplication has no configuration.");
        return;
    }

    McpChatAppConfig mcpConfig = JsonUtils.convertValue(appConfigObj, McpChatAppConfig.class);
    this.mcpClientService = new McpClientService(Entity.getCollectionDAO(), mcpConfig);
    LOG.info(
        "McpChatApplication service initialized (chat enabled: {})",
        mcpClientService.isChatEnabled());
}
```

Update imports:
- Remove: `import java.util.Map;`
- Remove: `import org.openmetadata.service.config.McpClientConfiguration;`
- Add: `import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;`

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/apps/bundles/mcp/McpChatApplication.java
git commit -m "refactor(mcp): use generated McpChatAppConfig in McpChatApplication"
```

### Task 5: Update McpClientService

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/McpClientService.java`

- [ ] **Step 1: Change config type and update field access**

Change the constructor parameter and field type from `McpClientConfiguration` to `McpChatAppConfig`.

Field access changes:
- `config.getApiKey()` → `config.getLlmApiKey()`
- `config.getAwsConfig()` → `config.getAwsConfig()` (same name, but now returns `AWSBaseConfig` instead of `Map`)
- `config.getAwsConfig() != null && !config.getAwsConfig().isEmpty()` → `config.getAwsConfig() != null`
- `config.getSystemPrompt()` → `config.getSystemPrompt()` (unchanged)

Updated constructor:

```java
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
```

Update the field declaration:

```java
private final McpChatAppConfig config;
```

Update imports:
- Remove: `import org.openmetadata.service.config.McpClientConfiguration;`
- Add: `import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;`

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/mcpclient/McpClientService.java
git commit -m "refactor(mcp): use McpChatAppConfig in McpClientService"
```

### Task 6: Update LlmClientFactory

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmClientFactory.java`

- [ ] **Step 1: Change parameter type**

```java
package org.openmetadata.service.clients.llm;

import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;

public final class LlmClientFactory {

  private LlmClientFactory() {}

  public static LlmClient create(McpChatAppConfig config) {
    return switch (config.getLlmProvider()) {
      case "openai" -> new OpenAiLlmClient(config);
      case "anthropic" -> new BedrockLlmClient(config);
      default -> throw new IllegalArgumentException(
          "Unknown LLM provider: " + config.getLlmProvider());
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/LlmClientFactory.java
git commit -m "refactor(mcp): use McpChatAppConfig in LlmClientFactory"
```

### Task 7: Update OpenAiLlmClient

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/OpenAiLlmClient.java`

- [ ] **Step 1: Change constructor parameter type**

Update the constructor to accept `McpChatAppConfig`:

```java
public OpenAiLlmClient(McpChatAppConfig config) {
    this.apiKey = config.getLlmApiKey();
    this.model = config.getLlmModel();
    this.apiEndpoint =
        config.getLlmApiEndpoint() != null && !config.getLlmApiEndpoint().isBlank()
            ? config.getLlmApiEndpoint()
            : DEFAULT_ENDPOINT;
    this.mapper = new ObjectMapper();
    this.httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
}
```

Update imports:
- Remove: `import org.openmetadata.service.config.McpClientConfiguration;`
- Add: `import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;`

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/OpenAiLlmClient.java
git commit -m "refactor(mcp): use McpChatAppConfig in OpenAiLlmClient"
```

### Task 8: Update AnthropicLlmClient

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/AnthropicLlmClient.java`

- [ ] **Step 1: Change constructor parameter type**

```java
public AnthropicLlmClient(McpChatAppConfig config) {
    this.apiKey = config.getLlmApiKey();
    this.model = config.getLlmModel();
    this.apiEndpoint = config.getLlmApiEndpoint() != null ? config.getLlmApiEndpoint() : DEFAULT_ENDPOINT;
    this.mapper = new ObjectMapper();
    this.httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
}
```

Update imports:
- Remove: `import org.openmetadata.service.config.McpClientConfiguration;`
- Add: `import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;`

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/AnthropicLlmClient.java
git commit -m "refactor(mcp): use McpChatAppConfig in AnthropicLlmClient"
```

### Task 9: Update BedrockLlmClient

**Files:**
- Modify: `openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/BedrockLlmClient.java`

- [ ] **Step 1: Change constructor to use typed AWSBaseConfig directly**

Since `config.getAwsConfig()` now returns `AWSBaseConfig` (not `Map`), remove the `JsonUtils.convertValue` call:

```java
public BedrockLlmClient(McpChatAppConfig config) {
    this.model = config.getLlmModel();
    this.mapper = new ObjectMapper();

    AWSBaseConfig awsConfig = config.getAwsConfig();
    BedrockRuntimeClientBuilder builder =
        BedrockRuntimeClient.builder()
            .credentialsProvider(AwsCredentialsUtil.buildCredentialsProvider(awsConfig))
            .region(Region.of(awsConfig.getRegion()));

    if (awsConfig.getEndpointUrl() != null) {
        builder.endpointOverride(awsConfig.getEndpointUrl());
    }

    this.bedrockClient = builder.build();
}
```

Update imports:
- Remove: `import org.openmetadata.service.config.McpClientConfiguration;`
- Remove: `import org.openmetadata.schema.utils.JsonUtils;` (if no longer used elsewhere in the file)
- Add: `import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;`

- [ ] **Step 2: Commit**

```bash
git add openmetadata-service/src/main/java/org/openmetadata/service/clients/llm/BedrockLlmClient.java
git commit -m "refactor(mcp): use McpChatAppConfig in BedrockLlmClient"
```

---

## Chunk 3: Cleanup

### Task 10: Delete the hand-written McpClientConfiguration

**Files:**
- Delete: `openmetadata-service/src/main/java/org/openmetadata/service/config/McpClientConfiguration.java`

- [ ] **Step 1: Verify no remaining references to McpClientConfiguration**

```bash
grep -r "McpClientConfiguration" openmetadata-service/src/main/java/
```

Expected: No matches (all references were updated in Tasks 4-9).

- [ ] **Step 2: Delete the file**

```bash
git rm openmetadata-service/src/main/java/org/openmetadata/service/config/McpClientConfiguration.java
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(mcp): remove hand-written McpClientConfiguration"
```

### Task 11: Build and verify

- [ ] **Step 1: Build the backend to verify compilation**

```bash
mvn clean package -DskipTests -pl !openmetadata-ui
```

Expected: BUILD SUCCESS

- [ ] **Step 2: Run spotless to fix formatting**

```bash
mvn spotless:apply -pl openmetadata-service
```

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "style: apply spotless formatting"
```
