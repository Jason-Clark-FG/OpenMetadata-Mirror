package org.openmetadata.service.resources.search;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.service.Entity;
import org.openmetadata.service.resources.Collection;
import org.openmetadata.service.search.vector.OpenSearchVectorService;
import org.openmetadata.service.search.vector.utils.DTOs.FingerprintResponse;
import org.openmetadata.service.search.vector.utils.DTOs.VectorSearchRequest;
import org.openmetadata.service.search.vector.utils.DTOs.VectorSearchResponse;
import org.openmetadata.service.security.Authorizer;

@Slf4j
@Path("/v1/search/vector")
@Tag(name = "Vector Search", description = "APIs for vector-based semantic search.")
@Produces(MediaType.APPLICATION_JSON)
@Collection(name = "vectorSearch")
public class VectorSearchResource {
  private final Authorizer authorizer;

  public VectorSearchResource(Authorizer authorizer) {
    this.authorizer = authorizer;
  }

  @POST
  @Path("/query")
  @Consumes(MediaType.APPLICATION_JSON)
  @Operation(
      operationId = "vectorSearch",
      summary = "Vector semantic search",
      description = "Search entities using vector embeddings with full filter support.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "Vector search results",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = VectorSearchResponse.class)))
      })
  public Response vectorSearchPost(
      @Context SecurityContext securityContext, VectorSearchRequest request) {
    if (request.query == null || request.query.isBlank()) {
      return Response.status(Response.Status.BAD_REQUEST)
          .entity("{\"error\":\"query is required\"}")
          .build();
    }

    if (!Entity.getSearchRepository().isVectorEmbeddingEnabled()) {
      return Response.status(Response.Status.SERVICE_UNAVAILABLE)
          .entity("{\"error\":\"Vector search is not enabled\"}")
          .build();
    }

    OpenSearchVectorService vectorService = OpenSearchVectorService.getInstance();
    if (vectorService == null) {
      return Response.status(Response.Status.SERVICE_UNAVAILABLE)
          .entity("{\"error\":\"Vector search service is not initialized\"}")
          .build();
    }

    try {
      VectorSearchResponse response =
          vectorService.search(
              request.query,
              request.filters != null ? request.filters : Collections.emptyMap(),
              request.size,
              request.k,
              request.threshold);
      return Response.ok(response).build();
    } catch (Exception e) {
      LOG.error("Vector search failed: {}", e.getMessage(), e);
      return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
          .entity("{\"error\":\"An internal error occurred\"}")
          .build();
    }
  }

  @GET
  @Path("/fingerprint")
  @Operation(
      operationId = "getFingerprint",
      summary = "Get vector fingerprint",
      description = "Returns the existing fingerprint for a given entity.")
  public Response getFingerprint(
      @Context SecurityContext securityContext,
      @Parameter(description = "Parent entity ID", required = true) @QueryParam("parentId")
          String parentId) {
    if (!Entity.getSearchRepository().isVectorEmbeddingEnabled()) {
      return Response.status(Response.Status.SERVICE_UNAVAILABLE)
          .entity("{\"error\":\"Vector search is not enabled\"}")
          .build();
    }

    OpenSearchVectorService vectorService = OpenSearchVectorService.getInstance();
    if (vectorService == null) {
      return Response.status(Response.Status.SERVICE_UNAVAILABLE)
          .entity("{\"error\":\"Vector search service is not initialized\"}")
          .build();
    }

    try {
      UUID.fromString(parentId);
    } catch (IllegalArgumentException e) {
      return Response.status(Response.Status.BAD_REQUEST)
          .entity("{\"error\":\"Invalid parentId format\"}")
          .build();
    }

    try {
      String indexName = vectorService.getIndexName();
      String fingerprint = vectorService.getExistingFingerprint(indexName, parentId);
      FingerprintResponse response =
          new FingerprintResponse(
              parentId, indexName, fingerprint, fingerprint != null ? "Found" : "Not found");
      return Response.ok(response).build();
    } catch (Exception e) {
      LOG.error("Failed to get fingerprint for {}: {}", parentId, e.getMessage(), e);
      return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
          .entity("{\"error\":\"An internal error occurred\"}")
          .build();
    }
  }

  @GET
  @Path("/status")
  @Operation(
      operationId = "vectorSearchStatus",
      summary = "Get vector search status",
      description = "Returns the current status of the vector search service.")
  public Response getStatus(@Context SecurityContext securityContext) {
    boolean enabled = Entity.getSearchRepository().isVectorEmbeddingEnabled();

    String modelId = "N/A";
    int dimension = 0;
    boolean indexExists = false;

    OpenSearchVectorService vectorService = OpenSearchVectorService.getInstance();
    if (enabled && vectorService != null) {
      modelId = vectorService.getEmbeddingClient().getModelId();
      dimension = vectorService.getEmbeddingClient().getDimension();
      indexExists = vectorService.indexExists();
    }

    return Response.ok(
            Map.of(
                "enabled", enabled,
                "modelId", modelId,
                "dimension", dimension,
                "indexExists", indexExists))
        .build();
  }
}
