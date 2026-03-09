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
public class OpenAiLlmClient implements LlmClient {
  private static final String DEFAULT_ENDPOINT = "https://api.openai.com";
  private static final Duration TIMEOUT = Duration.ofSeconds(120);

  private final String apiEndpoint;
  private final String apiKey;
  private final String model;
  private final ObjectMapper mapper;
  private final HttpClient httpClient;

  public OpenAiLlmClient(McpClientConfiguration config) {
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
              .uri(URI.create(apiEndpoint + "/v1/chat/completions"))
              .header("Content-Type", "application/json")
              .header("Authorization", "Bearer " + apiKey)
              .timeout(TIMEOUT)
              .POST(HttpRequest.BodyPublishers.ofString(json))
              .build();

      HttpResponse<String> response =
          httpClient.send(request, HttpResponse.BodyHandlers.ofString());

      if (response.statusCode() != 200) {
        throw new RuntimeException(
            "OpenAI API returned status " + response.statusCode() + ": " + response.body());
      }

      return parseResponse(response.body());
    } catch (IOException | InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("Failed to call OpenAI API", e);
    }
  }

  private ObjectNode buildRequestBody(List<LlmMessage> messages, List<Map<String, Object>> tools) {
    ObjectNode body = mapper.createObjectNode();
    body.put("model", model);

    ArrayNode messagesArray = body.putArray("messages");
    for (LlmMessage msg : messages) {
      messagesArray.add(buildMessageNode(msg));
    }

    if (tools != null && !tools.isEmpty()) {
      ArrayNode toolsArray = body.putArray("tools");
      for (Map<String, Object> tool : tools) {
        toolsArray.add(mapper.valueToTree(tool));
      }
    }

    return body;
  }

  private ObjectNode buildMessageNode(LlmMessage msg) {
    ObjectNode node = mapper.createObjectNode();
    node.put("role", msg.role().name());

    if (msg.content() != null) {
      node.put("content", msg.content());
    }

    if (msg.toolCallId() != null) {
      node.put("tool_call_id", msg.toolCallId());
    }

    if (msg.toolCalls() != null && !msg.toolCalls().isEmpty()) {
      ArrayNode toolCallsArray = node.putArray("tool_calls");
      for (LlmToolCall tc : msg.toolCalls()) {
        ObjectNode tcNode = mapper.createObjectNode();
        tcNode.put("id", tc.id());
        tcNode.put("type", "function");
        ObjectNode fnNode = tcNode.putObject("function");
        fnNode.put("name", tc.name());
        fnNode.put("arguments", tc.arguments());
        toolCallsArray.add(tcNode);
      }
    }

    return node;
  }

  private LlmResponse parseResponse(String responseBody) throws IOException {
    JsonNode root = mapper.readTree(responseBody);
    JsonNode choice = root.path("choices").path(0);
    JsonNode message = choice.path("message");

    String content =
        message.has("content") && !message.get("content").isNull()
            ? message.get("content").asText()
            : null;

    List<LlmToolCall> toolCalls = new ArrayList<>();
    if (message.has("tool_calls")) {
      for (JsonNode tc : message.get("tool_calls")) {
        JsonNode function = tc.get("function");
        toolCalls.add(
            new LlmToolCall(
                tc.get("id").asText(),
                function.get("name").asText(),
                function.get("arguments").asText()));
      }
    }

    String stopReason = choice.has("finish_reason") ? choice.get("finish_reason").asText() : null;

    JsonNode usage = root.path("usage");
    int inputTokens = usage.path("prompt_tokens").asInt(0);
    int outputTokens = usage.path("completion_tokens").asInt(0);

    return new LlmResponse(content, toolCalls, inputTokens, outputTokens, stopReason);
  }
}
