package org.openmetadata.it.tests.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.auth.JwtAuthProvider;
import org.openmetadata.schema.entity.app.App;
import org.openmetadata.schema.entity.app.CreateApp;
import org.openmetadata.schema.entity.app.internal.McpChatAppConfig;
import org.openmetadata.schema.entity.chat.McpConversation;
import org.openmetadata.schema.security.credentials.AWSBaseConfig;
import org.openmetadata.schema.utils.JsonUtils;

@Execution(ExecutionMode.SAME_THREAD)
public class McpChatResourceIT extends McpTestBase {

  private static final String MCP_CLIENT_PATH = "mcp-client";

  @BeforeAll
  static void setUp() throws Exception {
    initAuth();
    ensureMcpChatAppInstalled();
  }

  private static void ensureMcpChatAppInstalled() throws Exception {
    HttpResponse<String> response = getResponse("apps/name/McpChatApplication", authToken);
    if (response.statusCode() == 200) {
      return;
    }
    Map<String, Object> appConfig = new HashMap<>();
    appConfig.put("llmProvider", "openai");
    appConfig.put("llmApiKey", "");
    appConfig.put("llmModel", "gpt-4o");
    appConfig.put("systemPrompt", "Test prompt");

    CreateApp createApp =
        new CreateApp().withName("McpChatApplication").withAppConfiguration(appConfig);
    post("apps", createApp, App.class);
  }

  @Test
  void testAppConfigDeserialization() throws Exception {
    App app = get("apps/name/McpChatApplication", App.class);

    assertThat(app).isNotNull();
    assertThat(app.getName()).isEqualTo("McpChatApplication");
    assertThat(app.getAppConfiguration()).isNotNull();

    McpChatAppConfig config =
        JsonUtils.convertValue(app.getAppConfiguration(), McpChatAppConfig.class);
    assertThat(config.getLlmProvider()).isEqualTo("openai");
    assertThat(config.getLlmModel()).isEqualTo("gpt-4o");
  }

  @Test
  void testAppConfigWithAwsConfig() throws Exception {
    McpChatAppConfig config = new McpChatAppConfig();
    config.setLlmProvider("anthropic");
    config.setLlmModel("anthropic.claude-sonnet-4-20250514-v1:0");
    config.setAwsConfig(new AWSBaseConfig().withRegion("us-east-1"));

    String json = JsonUtils.pojoToJson(config);
    McpChatAppConfig deserialized = JsonUtils.readValue(json, McpChatAppConfig.class);

    assertThat(deserialized.getLlmProvider()).isEqualTo("anthropic");
    assertThat(deserialized.getAwsConfig()).isNotNull();
    assertThat(deserialized.getAwsConfig().getRegion()).isEqualTo("us-east-1");
  }

  @Test
  void testCreateConversation() throws Exception {
    McpConversation conversation = createConversation();

    assertThat(conversation).isNotNull();
    assertThat(conversation.getId()).isNotNull();
    assertThat(conversation.getMessageCount()).isZero();
  }

  @Test
  void testListConversations() throws Exception {
    McpConversation created = createConversation();

    JsonNode result = get(MCP_CLIENT_PATH + "/conversations?limit=50", JsonNode.class);

    assertThat(result.has("data")).isTrue();
    assertThat(result.get("data").isArray()).isTrue();

    boolean found = false;
    for (JsonNode conv : result.get("data")) {
      if (conv.get("id").asText().equals(created.getId().toString())) {
        found = true;
        break;
      }
    }
    assertThat(found).isTrue();
  }

  @Test
  void testGetConversationById() throws Exception {
    McpConversation created = createConversation();

    McpConversation fetched =
        get(MCP_CLIENT_PATH + "/conversations/" + created.getId(), McpConversation.class);

    assertThat(fetched.getId()).isEqualTo(created.getId());
    assertThat(fetched.getMessageCount()).isZero();
  }

  @Test
  void testGetConversationMessages_empty() throws Exception {
    McpConversation created = createConversation();

    JsonNode result =
        get(MCP_CLIENT_PATH + "/conversations/" + created.getId() + "/messages", JsonNode.class);

    assertThat(result.has("data")).isTrue();
    assertThat(result.get("data").isArray()).isTrue();
    assertThat(result.get("data").size()).isZero();
  }

  @Test
  void testDeleteConversation() throws Exception {
    McpConversation created = createConversation();

    HttpResponse<String> deleteResp =
        deleteResponse(MCP_CLIENT_PATH + "/conversations/" + created.getId());
    assertThat(deleteResp.statusCode()).isEqualTo(204);

    HttpResponse<String> getResp =
        getResponse(MCP_CLIENT_PATH + "/conversations/" + created.getId(), authToken);
    assertThat(getResp.statusCode()).isGreaterThanOrEqualTo(400);
  }

  @Test
  void testConversationIsolation() throws Exception {
    McpConversation created = createConversation();

    String otherUserToken =
        "Bearer "
            + JwtAuthProvider.tokenFor(
                "test@open-metadata.org", "test@open-metadata.org", new String[] {}, 3600);

    HttpResponse<String> resp =
        getResponse(MCP_CLIENT_PATH + "/conversations/" + created.getId(), otherUserToken);

    assertThat(resp.statusCode()).isGreaterThanOrEqualTo(400);
  }

  @Test
  void testChatWithoutLlmKey() throws Exception {
    Map<String, Object> chatRequest = new HashMap<>();
    chatRequest.put("message", "Hello");

    HttpResponse<String> resp = postResponse(MCP_CLIENT_PATH + "/chat", chatRequest, authToken);

    assertThat(resp.statusCode()).isEqualTo(500);
  }

  @Test
  void testGetNonExistentConversation() throws Exception {
    UUID randomId = UUID.randomUUID();

    HttpResponse<String> resp =
        getResponse(MCP_CLIENT_PATH + "/conversations/" + randomId, authToken);

    assertThat(resp.statusCode()).isGreaterThanOrEqualTo(400);
  }

  private McpConversation createConversation() throws Exception {
    return post(MCP_CLIENT_PATH + "/conversations", new HashMap<>(), McpConversation.class);
  }
}
