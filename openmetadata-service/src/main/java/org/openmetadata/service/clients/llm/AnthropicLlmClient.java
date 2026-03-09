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
package org.openmetadata.service.clients.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.service.config.McpClientConfiguration;

@Slf4j
public class AnthropicLlmClient implements LlmClient {
  private static final String DEFAULT_ENDPOINT = "https://api.anthropic.com";
  private static final String ANTHROPIC_VERSION = "2023-06-01";
  private static final int MAX_TOKENS = 4096;
  private static final Duration TIMEOUT = Duration.ofSeconds(120);

  private final String apiEndpoint;
  private final String apiKey;
  private final String model;
  private final ObjectMapper mapper;
  private final HttpClient httpClient;

  public AnthropicLlmClient(McpClientConfiguration config) {
    this.apiKey = config.getApiKey();
    this.model = config.getModel();
    this.apiEndpoint = config.getApiEndpoint() != null ? config.getApiEndpoint() : DEFAULT_ENDPOINT;
    this.mapper = new ObjectMapper();
    this.httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
  }

  @Override
  public LlmResponse sendMessages(List<LlmMessage> messages, List<Map<String, Object>> tools) {
    try {
      ObjectNode requestBody = buildRequestBody(messages, tools);
      String json = mapper.writeValueAsString(requestBody);

      HttpRequest request =
          HttpRequest.newBuilder()
              .uri(URI.create(apiEndpoint + "/v1/messages"))
              .header("Content-Type", "application/json")
              .header("x-api-key", apiKey)
              .header("anthropic-version", ANTHROPIC_VERSION)
              .timeout(TIMEOUT)
              .POST(HttpRequest.BodyPublishers.ofString(json))
              .build();

      HttpResponse<String> response =
          httpClient.send(request, HttpResponse.BodyHandlers.ofString());

      if (response.statusCode() != 200) {
        throw new RuntimeException(
            "Anthropic API returned status " + response.statusCode() + ": " + response.body());
      }

      return parseResponse(response.body());
    } catch (IOException | InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("Failed to call Anthropic API", e);
    }
  }

  private ObjectNode buildRequestBody(List<LlmMessage> messages, List<Map<String, Object>> tools) {
    ObjectNode body = mapper.createObjectNode();
    body.put("model", model);
    body.put("max_tokens", MAX_TOKENS);

    String systemPrompt = extractSystemPrompt(messages);
    if (systemPrompt != null) {
      body.put("system", systemPrompt);
    }

    ArrayNode messagesArray = body.putArray("messages");
    for (LlmMessage msg : messages) {
      if (msg.role() == LlmMessage.Role.system) {
        continue;
      }
      messagesArray.add(buildMessageNode(msg));
    }

    if (tools != null && !tools.isEmpty()) {
      ArrayNode toolsArray = body.putArray("tools");
      for (Map<String, Object> tool : tools) {
        toolsArray.add(buildToolNode(tool));
      }
    }

    return body;
  }

  private String extractSystemPrompt(List<LlmMessage> messages) {
    for (LlmMessage msg : messages) {
      if (msg.role() == LlmMessage.Role.system && msg.content() != null) {
        return msg.content();
      }
    }
    return null;
  }

  private ObjectNode buildMessageNode(LlmMessage msg) {
    ObjectNode node = mapper.createObjectNode();

    if (msg.role() == LlmMessage.Role.tool) {
      node.put("role", "user");
      ArrayNode contentArray = node.putArray("content");
      ObjectNode toolResultBlock = mapper.createObjectNode();
      toolResultBlock.put("type", "tool_result");
      toolResultBlock.put("tool_use_id", msg.toolCallId());
      toolResultBlock.put("content", msg.content() != null ? msg.content() : "");
      contentArray.add(toolResultBlock);
      return node;
    }

    node.put("role", msg.role() == LlmMessage.Role.assistant ? "assistant" : "user");

    if (msg.toolCalls() != null && !msg.toolCalls().isEmpty()) {
      ArrayNode contentArray = node.putArray("content");
      for (LlmToolCall tc : msg.toolCalls()) {
        ObjectNode toolUseBlock = mapper.createObjectNode();
        toolUseBlock.put("type", "tool_use");
        toolUseBlock.put("id", tc.id());
        toolUseBlock.put("name", tc.name());
        try {
          toolUseBlock.set("input", mapper.readTree(tc.arguments()));
        } catch (IOException e) {
          toolUseBlock.put("input", tc.arguments());
        }
        contentArray.add(toolUseBlock);
      }
      return node;
    }

    if (msg.content() != null) {
      node.put("content", msg.content());
    }

    return node;
  }

  @SuppressWarnings("unchecked")
  private ObjectNode buildToolNode(Map<String, Object> tool) {
    ObjectNode toolNode = mapper.createObjectNode();

    Map<String, Object> function = (Map<String, Object>) tool.get("function");
    if (function != null) {
      toolNode.put("name", (String) function.get("name"));
      if (function.containsKey("description")) {
        toolNode.put("description", (String) function.get("description"));
      }
      if (function.containsKey("parameters")) {
        toolNode.set("input_schema", mapper.valueToTree(function.get("parameters")));
      }
    }

    return toolNode;
  }

  private LlmResponse parseResponse(String responseBody) throws IOException {
    JsonNode root = mapper.readTree(responseBody);

    String stopReason = root.has("stop_reason") ? root.get("stop_reason").asText() : null;

    JsonNode usage = root.path("usage");
    int inputTokens = usage.path("input_tokens").asInt(0);
    int outputTokens = usage.path("output_tokens").asInt(0);

    StringBuilder textContent = new StringBuilder();
    List<LlmToolCall> toolCalls = new ArrayList<>();

    JsonNode contentArray = root.path("content");
    if (contentArray.isArray()) {
      for (JsonNode block : contentArray) {
        String type = block.path("type").asText();
        if ("text".equals(type)) {
          textContent.append(block.path("text").asText());
        } else if ("tool_use".equals(type)) {
          String id = block.get("id").asText();
          String name = block.get("name").asText();
          String arguments = mapper.writeValueAsString(block.get("input"));
          toolCalls.add(new LlmToolCall(id, name, arguments));
        }
      }
    }

    String content = textContent.length() > 0 ? textContent.toString() : null;
    return new LlmResponse(content, toolCalls, inputTokens, outputTokens, stopReason);
  }
}
