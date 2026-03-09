package org.openmetadata.mcp;

import io.dropwizard.core.setup.Environment;
import io.dropwizard.jetty.MutableServletContextHandler;
import io.modelcontextprotocol.json.jackson.JacksonMcpJsonMapper;
import io.modelcontextprotocol.server.McpStatelessServerFeatures;
import io.modelcontextprotocol.server.McpStatelessSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStatelessServerTransport;
import io.modelcontextprotocol.spec.McpSchema;
import jakarta.servlet.DispatcherType;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.jetty.ee10.servlet.FilterHolder;
import org.eclipse.jetty.ee10.servlet.ServletHolder;
import org.openmetadata.mcp.prompts.DefaultPromptsContext;
import org.openmetadata.mcp.tools.DefaultToolContext;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.OpenMetadataApplicationConfig;
import org.openmetadata.service.apps.McpServerProvider;
import org.openmetadata.service.limits.Limits;
import org.openmetadata.service.resources.mcpclient.McpClientResource;
import org.openmetadata.service.security.Authorizer;
import org.openmetadata.service.security.JwtFilter;
import org.openmetadata.service.security.auth.CatalogSecurityContext;
import org.openmetadata.service.security.auth.SecurityConfigurationManager;

@Slf4j
public class McpServer implements McpServerProvider {
  private JwtFilter jwtFilter;
  private Authorizer authorizer;
  private Limits limits;
  protected DefaultToolContext toolContext;
  protected DefaultPromptsContext promptsContext;

  // Default constructor for dynamic loading
  public McpServer() {
    this.toolContext = new DefaultToolContext();
    this.promptsContext = new DefaultPromptsContext();
  }

  public McpServer(DefaultToolContext toolContext, DefaultPromptsContext promptsContext) {
    this.toolContext = toolContext;
    this.promptsContext = promptsContext;
  }

  @Override
  public void initializeMcpServer(
      Environment environment,
      Authorizer authorizer,
      Limits limits,
      OpenMetadataApplicationConfig config) {
    this.jwtFilter =
        new JwtFilter(
            SecurityConfigurationManager.getCurrentAuthConfig(),
            SecurityConfigurationManager.getCurrentAuthzConfig());
    this.authorizer = authorizer;
    this.limits = limits;
    MutableServletContextHandler contextHandler = environment.getApplicationContext();
    McpAuthFilter authFilter =
        new McpAuthFilter(
            new JwtFilter(
                SecurityConfigurationManager.getCurrentAuthConfig(),
                SecurityConfigurationManager.getCurrentAuthzConfig()));
    List<McpSchema.Tool> tools = getTools();
    List<McpSchema.Prompt> prompts = getPrompts();
    addStatelessTransport(contextHandler, authFilter, tools, prompts);

    registerMcpClientToolExecutor();
  }

  @SuppressWarnings("unchecked")
  private void registerMcpClientToolExecutor() {
    try {
      McpClientResource mcpClientResource = McpClientResource.getInstance();
      if (mcpClientResource == null) {
        LOG.warn("McpClientResource not found — MCP Client chat will not have tool access.");
        return;
      }

      String json = McpUtils.getJsonFromFile("json/data/mcp/tools.json");
      List<Map<String, Object>> rawTools = McpUtils.loadDefinitionsFromJson(json);
      List<Map<String, Object>> llmToolDefs = new ArrayList<>();
      for (Map<String, Object> rawTool : rawTools) {
        Map<String, Object> functionDef = new HashMap<>();
        functionDef.put("name", rawTool.get("name"));
        functionDef.put("description", rawTool.get("description"));
        if (rawTool.containsKey("parameters")) {
          Map<String, Object> params = (Map<String, Object>) rawTool.get("parameters");
          Map<String, Object> cleanParams = new HashMap<>(params);
          cleanParams.remove("examples");
          functionDef.put("parameters", cleanParams);
        }
        Map<String, Object> tool = new HashMap<>();
        tool.put("type", "function");
        tool.put("function", functionDef);
        llmToolDefs.add(tool);
      }

      mcpClientResource.registerToolExecutor(
          (auth, lim, secCtx, toolName, arguments) -> {
            Map<String, Object> args =
                (arguments != null && !arguments.isBlank())
                    ? JsonUtils.readValue(arguments, Map.class)
                    : new HashMap<>();
            McpSchema.CallToolRequest request = new McpSchema.CallToolRequest(toolName, args, null);
            McpSchema.CallToolResult callResult =
                toolContext.callTool(auth, lim, toolName, secCtx, request);
            return extractToolResultContent(callResult);
          },
          llmToolDefs);
      LOG.info("Registered MCP tool executor with McpClientResource.");
    } catch (Exception e) {
      LOG.warn("Failed to register MCP Client tool executor: {}", e.getMessage());
    }
  }

  private static String extractToolResultContent(McpSchema.CallToolResult result) {
    if (result.content() == null || result.content().isEmpty()) {
      return "{}";
    }
    StringBuilder sb = new StringBuilder();
    for (McpSchema.Content content : result.content()) {
      if (content instanceof McpSchema.TextContent textContent) {
        sb.append(textContent.text());
      }
    }
    return sb.length() > 0 ? sb.toString() : "{}";
  }

  protected List<McpSchema.Tool> getTools() {
    return toolContext.loadToolsDefinitionsFromJson("json/data/mcp/tools.json");
  }

  protected List<McpSchema.Prompt> getPrompts() {
    return promptsContext.loadPromptsDefinitionsFromJson("json/data/mcp/prompts.json");
  }

  private void addStatelessTransport(
      MutableServletContextHandler contextHandler,
      McpAuthFilter authFilter,
      List<McpSchema.Tool> tools,
      List<McpSchema.Prompt> prompts) {
    McpSchema.ServerCapabilities serverCapabilities =
        McpSchema.ServerCapabilities.builder()
            .tools(true)
            .prompts(true)
            .resources(true, true)
            .build();

    HttpServletStatelessServerTransport statelessTransport =
        HttpServletStatelessServerTransport.builder()
            .jsonMapper(new JacksonMcpJsonMapper(JsonUtils.getObjectMapper()))
            .messageEndpoint("/mcp")
            .contextExtractor(new AuthEnrichedMcpContextExtractor())
            .build();

    McpStatelessSyncServer server =
        io.modelcontextprotocol.server.McpServer.sync(statelessTransport)
            .serverInfo("openmetadata-mcp-stateless", "0.17.1")
            .capabilities(serverCapabilities)
            .build();
    addToolsToServer(server, tools);
    addPromptsToServer(server, prompts);

    // SSE transport for MCP
    ServletHolder servletHolderSSE = new ServletHolder(statelessTransport);
    contextHandler.addServlet(servletHolderSSE, "/mcp/*");

    contextHandler.addFilter(
        new FilterHolder(authFilter), "/mcp/*", EnumSet.of(DispatcherType.REQUEST));
  }

  public void addToolsToServer(McpStatelessSyncServer server, List<McpSchema.Tool> tools) {
    for (McpSchema.Tool tool : tools) {
      server.addTool(getTool(tool));
    }
  }

  public void addPromptsToServer(McpStatelessSyncServer server, List<McpSchema.Prompt> tools) {
    for (McpSchema.Prompt pm : tools) {
      server.addPrompt(getPrompt(pm));
    }
  }

  private McpStatelessServerFeatures.SyncToolSpecification getTool(McpSchema.Tool tool) {
    return new McpStatelessServerFeatures.SyncToolSpecification(
        tool,
        (context, req) -> {
          CatalogSecurityContext securityContext =
              jwtFilter.getCatalogSecurityContext((String) context.get("Authorization"));
          return toolContext.callTool(authorizer, limits, tool.name(), securityContext, req);
        });
  }

  private McpStatelessServerFeatures.SyncPromptSpecification getPrompt(McpSchema.Prompt prompt) {
    return new McpStatelessServerFeatures.SyncPromptSpecification(
        prompt,
        (exchange, arguments) -> promptsContext.callPrompt(jwtFilter, prompt.name(), arguments));
  }
}
