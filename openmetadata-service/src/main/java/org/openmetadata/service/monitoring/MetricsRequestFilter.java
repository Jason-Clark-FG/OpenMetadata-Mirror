package org.openmetadata.service.monitoring;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.Provider;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.glassfish.jersey.server.ExtendedUriInfo;
import org.glassfish.jersey.uri.UriTemplate;

@Slf4j
@Provider
@Priority(Priorities.AUTHENTICATION - 1)
public class MetricsRequestFilter implements ContainerRequestFilter, ContainerResponseFilter {
  private final OpenMetadataMetrics metrics;

  @Inject
  public MetricsRequestFilter(OpenMetadataMetrics metrics) {
    this.metrics = metrics;
  }

  @Override
  public void filter(ContainerRequestContext requestContext) {
    String pathTemplate = extractPathTemplate(requestContext.getUriInfo());
    String endpoint = MetricUtils.classifyEndpoint(pathTemplate);
    String method = requestContext.getMethod();
    RequestLatencyContext.startRequest(endpoint, method);
  }

  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
    try {
      if (responseContext.hasEntity() && responseContext.getLength() > 0) {
        metrics.recordHttpResponseSize(responseContext.getLength());
      }
      RequestLatencyContext.endRequest();
    } catch (Exception e) {
      LOG.warn("Error recording HTTP metrics", e);
    }
  }

  static String extractPathTemplate(UriInfo uriInfo) {
    if (uriInfo instanceof ExtendedUriInfo extendedUriInfo) {
      List<UriTemplate> templates = extendedUriInfo.getMatchedTemplates();
      if (templates != null && !templates.isEmpty()) {
        StringBuilder sb = new StringBuilder();
        for (int i = templates.size() - 1; i >= 0; i--) {
          sb.append(templates.get(i).getTemplate());
        }
        String template = sb.toString();
        if (!template.isEmpty()) {
          return template;
        }
      }
    }
    return uriInfo.getPath();
  }
}
