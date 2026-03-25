package org.openmetadata.mcp;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;

/**
 * Fallback servlet registered at /mcp/callback when SSO is not configured at startup. Returns a
 * clear error message instead of falling through to the SPA asset servlet, which would show a
 * confusing "Page Not Found" 404.
 */
@Slf4j
public class McpCallbackFallbackServlet extends HttpServlet {

  @Override
  protected void doGet(HttpServletRequest request, HttpServletResponse response)
      throws IOException {
    LOG.warn(
        "MCP SSO callback hit but SSO was not configured at server startup. "
            + "The authentication provider may have been changed after the server started.");
    response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
    response.setContentType("text/html; charset=UTF-8");
    response
        .getWriter()
        .write(
            "<html><body>"
                + "<h1>MCP SSO Not Available</h1>"
                + "<p>The authentication provider was changed after the server started. "
                + "Please restart the server for MCP SSO authentication to take effect.</p>"
                + "</body></html>");
  }
}
