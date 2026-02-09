package org.openmetadata.service.monitoring;

import jakarta.annotation.Priority;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;

@Provider
@Priority(1)
@Slf4j
public class RequestMetricsFilter implements ContainerRequestFilter, ContainerResponseFilter {

  private static final String REQUEST_START_TIME = "request.start.time";

  private final JettyMetrics jettyMetrics;

  public RequestMetricsFilter(JettyMetrics jettyMetrics) {
    this.jettyMetrics = jettyMetrics;
  }

  @Override
  public void filter(ContainerRequestContext requestContext) throws IOException {
    requestContext.setProperty(REQUEST_START_TIME, System.nanoTime());

    if (jettyMetrics != null) {
      try {
        jettyMetrics.incrementActiveRequests();
      } catch (Exception e) {
        LOG.debug("JettyMetrics not fully initialized yet: {}", e.getMessage());
      }
    }
  }

  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext)
      throws IOException {
    if (jettyMetrics != null) {
      try {
        jettyMetrics.decrementActiveRequests();
      } catch (Exception e) {
        LOG.debug("JettyMetrics not fully initialized yet: {}", e.getMessage());
      }
    }

    Long requestStartTime = (Long) requestContext.getProperty(REQUEST_START_TIME);
    if (requestStartTime != null) {
      long totalTimeMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - requestStartTime);

      if (totalTimeMs > 1000) {
        LOG.warn(
            "Slow request - {}ms - {} {}",
            totalTimeMs,
            requestContext.getMethod(),
            requestContext.getUriInfo().getPath());
      }
    }
  }
}
