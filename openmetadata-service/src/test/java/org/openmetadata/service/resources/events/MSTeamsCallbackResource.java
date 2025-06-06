package org.openmetadata.service.resources.events;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.awaitility.Awaitility;
import org.openmetadata.service.util.RestUtil;

/** REST resource used for msteams callback tests. */
@Slf4j
@Path("v1/test/msteams")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class MSTeamsCallbackResource {
  protected final ConcurrentHashMap<String, EventDetails<String>> eventMap =
      new ConcurrentHashMap<>();
  protected final ConcurrentHashMap<String, List<String>> entityCallbackMap =
      new ConcurrentHashMap<>();

  @POST
  @Path("/{name}")
  public Response receiveEventCount(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @HeaderParam(RestUtil.SIGNATURE_HEADER) String signature,
      @PathParam("name") String name,
      String event) {
    addEventDetails(name, event);
    return Response.ok().build();
  }

  @POST
  @Path("/simulate/slowServer")
  public Response receiveEventWithDelay(
      @Context UriInfo uriInfo, @Context SecurityContext securityContext, String event) {
    addEventDetails("simulate-slowServer", event);
    return Response.ok().build();
  }

  @POST
  @Path("/simulate/timeout")
  public Response receiveEventWithTimeout(
      @Context UriInfo uriInfo, @Context SecurityContext securityContext, String event) {
    addEventDetails("simulate-timeout", event);
    Awaitility.await()
        .pollDelay(java.time.Duration.ofSeconds(100L))
        .untilTrue(new AtomicBoolean(true));
    return Response.ok().build();
  }

  @POST
  @Path("/simulate/300")
  public Response receiveEvent300(
      @Context UriInfo uriInfo, @Context SecurityContext securityContext, String event) {
    addEventDetails("simulate-300", event);
    return Response.status(Response.Status.MOVED_PERMANENTLY).build();
  }

  @POST
  @Path("/simulate/400")
  public Response receiveEvent400(
      @Context UriInfo uriInfo, @Context SecurityContext securityContext, String event) {
    addEventDetails("simulate-400", event);
    return Response.status(Response.Status.BAD_REQUEST).build();
  }

  @POST
  @Path("/simulate/500")
  public Response receiveEvent500(
      @Context UriInfo uriInfo, @Context SecurityContext securityContext, String event) {
    addEventDetails("simulate-500", event);
    return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
  }

  protected void addEventDetails(String endpoint, String event) {
    EventDetails<String> details = eventMap.computeIfAbsent(endpoint, k -> new EventDetails<>());
    details.getEvents().add(event);
    LOG.info("Event received {}, total count {}", endpoint, details.getEvents().size());
  }

  public EventDetails<String> getEventDetails(String endpoint) {
    return eventMap.get(endpoint);
  }

  // Get entity callback events by eventType:entityType combination
  public List<String> getEntityCallbackEvents(String eventType, String entityType) {
    String key = eventType + ":" + entityType;
    return entityCallbackMap.getOrDefault(key, new ArrayList<>());
  }

  public void clearEvents() {
    eventMap.clear();
    entityCallbackMap.clear();
  }

  public static String getSecretKey() {
    return "teamsTest";
  }

  static class EventDetails<T> {
    @Getter final ConcurrentLinkedQueue<T> events = new ConcurrentLinkedQueue<>();
  }
}
