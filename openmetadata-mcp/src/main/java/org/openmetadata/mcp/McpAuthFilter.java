package org.openmetadata.mcp;

import static org.openmetadata.service.socket.SocketAddressFilter.checkForUsernameAndImpersonationValidation;

import com.auth0.jwt.interfaces.Claim;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.apps.AbstractNativeApplication;
import org.openmetadata.service.apps.ApplicationContext;
import org.openmetadata.service.security.ImpersonationContext;
import org.openmetadata.service.security.JwtFilter;

public class McpAuthFilter implements Filter {
  private static final String MCP_APP_NAME = "McpApplication";
  private static final String DEFAULT_MCP_BOT_NAME = MCP_APP_NAME + "Bot";

  private final JwtFilter jwtFilter;
  private volatile String mcpBotName;

  public McpAuthFilter(JwtFilter filter) {
    this.jwtFilter = filter;
  }

  private String getMcpBotName() {
    if (mcpBotName == null) {
      AbstractNativeApplication mcpApp =
          ApplicationContext.getInstance().getAppIfExists(MCP_APP_NAME);
      if (mcpApp != null && mcpApp.getApp().getBot() != null) {
        mcpBotName = mcpApp.getApp().getBot().getName();
      } else {
        mcpBotName = DEFAULT_MCP_BOT_NAME;
      }
    }
    return mcpBotName;
  }

  @Override
  public void doFilter(
      ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
      throws IOException, ServletException {
    HttpServletRequest httpServletRequest = (HttpServletRequest) servletRequest;
    HttpServletResponse httpServletResponse = (HttpServletResponse) servletResponse;
    if (ApplicationContext.getInstance().getAppIfExists("McpApplication") == null) {
      sendError(
          httpServletResponse,
          "McpApplication is not installed please install it to use MCP features.");
      return;
    }

    try {
      String tokenWithType = httpServletRequest.getHeader("Authorization");

      // Validate token once and extract claims
      String token = JwtFilter.extractToken(tokenWithType);
      Map<String, Claim> claims = jwtFilter.validateJwtAndGetClaims(token);

      // All MCP requests are impersonated by the MCP bot — this ensures the audit trail
      // distinguishes MCP-driven changes from direct UI changes
      ImpersonationContext.setImpersonatedBy(getMcpBotName());

      checkForUsernameAndImpersonationValidation(token, claims, jwtFilter);

      // Continue with the filter chain
      filterChain.doFilter(servletRequest, servletResponse);
    } finally {
      // Always clear the impersonation context after request processing
      ImpersonationContext.clear();
    }
  }

  private void sendError(HttpServletResponse response, String errorMessage) throws IOException {
    Map<String, Object> error = new HashMap<>();
    error.put("error", errorMessage);
    String errorJson = JsonUtils.pojoToJson(error);
    response.setContentType("application/json");
    response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
    response.getWriter().write(errorJson);
  }
}
