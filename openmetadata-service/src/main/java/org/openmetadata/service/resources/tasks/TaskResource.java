/*
 *  Copyright 2024 Collate
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

package org.openmetadata.service.resources.tasks;

import static org.openmetadata.service.jdbi3.RoleRepository.DOMAIN_ONLY_ACCESS_ROLE;
import static org.openmetadata.service.security.DefaultAuthorizer.getSubjectContext;

import io.swagger.v3.oas.annotations.ExternalDocumentation;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.json.JsonPatch;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.tasks.CreateTask;
import org.openmetadata.schema.api.tasks.ResolveTask;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.EntityHistory;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityStatus;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.schema.type.TaskPriority;
import org.openmetadata.schema.type.TaskResolution;
import org.openmetadata.schema.utils.ResultList;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.TaskRepository;
import org.openmetadata.service.limits.Limits;
import org.openmetadata.service.resources.Collection;
import org.openmetadata.service.resources.EntityResource;
import org.openmetadata.service.security.AuthorizationException;
import org.openmetadata.service.security.Authorizer;
import org.openmetadata.service.security.policyevaluator.SubjectContext;
import org.openmetadata.service.util.EntityUtil.Fields;

@Slf4j
@Path("/v1/tasks")
@Tag(name = "Tasks", description = "Tasks for data governance workflows")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Collection(name = "tasks", order = 8)
public class TaskResource extends EntityResource<Task, TaskRepository> {

  public static final String COLLECTION_PATH = "v1/tasks/";
  static final String FIELDS = "assignees,reviewers,watchers,about,domain,comments,createdBy";

  public TaskResource(Authorizer authorizer, Limits limits) {
    super(Entity.TASK, authorizer, limits);
  }

  public static class TaskList extends ResultList<Task> {
    /* Required for serde */
  }

  @GET
  @Operation(
      operationId = "listTasks",
      summary = "List tasks",
      description =
          "Get a list of tasks with filters for status, category, type, domain, and assignee.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "List of tasks",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = TaskList.class)))
      })
  public ResultList<Task> list(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Fields to include in response", schema = @Schema(type = "string"))
          @QueryParam("fields")
          String fieldsParam,
      @Parameter(description = "Filter by task status") @QueryParam("status")
          TaskEntityStatus status,
      @Parameter(description = "Filter by task category") @QueryParam("category")
          TaskCategory category,
      @Parameter(description = "Filter by task type") @QueryParam("type") TaskEntityType type,
      @Parameter(description = "Filter by domain FQN") @QueryParam("domain") String domain,
      @Parameter(description = "Filter by priority") @QueryParam("priority") TaskPriority priority,
      @Parameter(description = "Filter by assignee (user or team FQN)") @QueryParam("assignee")
          String assignee,
      @Parameter(description = "Filter by creator FQN") @QueryParam("createdBy") String createdBy,
      @Parameter(description = "Filter by entity FQN the task is about") @QueryParam("aboutEntity")
          String aboutEntity,
      @Parameter(description = "Limit the number results", schema = @Schema(type = "integer"))
          @DefaultValue("10")
          @QueryParam("limit")
          @Min(0)
          @Max(1000000)
          int limitParam,
      @Parameter(description = "Returns list of tasks before this cursor") @QueryParam("before")
          String before,
      @Parameter(description = "Returns list of tasks after this cursor") @QueryParam("after")
          String after,
      @Parameter(description = "Include deleted tasks")
          @QueryParam("include")
          @DefaultValue("non-deleted")
          Include include) {
    ListFilter filter = new ListFilter(include);
    if (status != null) {
      filter.addQueryParam("taskStatus", status.value());
    }
    if (category != null) {
      filter.addQueryParam("category", category.value());
    }
    if (type != null) {
      filter.addQueryParam("taskType", type.value());
    }
    if (priority != null) {
      filter.addQueryParam("taskPriority", priority.value());
    }
    if (assignee != null) {
      filter.addQueryParam("assignee", assignee);
    }
    if (createdBy != null) {
      filter.addQueryParam("createdBy", createdBy);
    }
    if (aboutEntity != null) {
      filter.addQueryParam("aboutEntity", aboutEntity);
    }

    return listInternal(uriInfo, securityContext, fieldsParam, filter, limitParam, before, after);
  }

  @GET
  @Path("/assigned")
  @Operation(
      operationId = "listMyAssignedTasks",
      summary = "List tasks assigned to the current user",
      description =
          "Get tasks assigned to the current user or their teams. "
              + "Includes tasks where the user is a direct assignee or a member of an assigned team.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "List of assigned tasks",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = TaskList.class)))
      })
  public ResultList<Task> listMyAssignedTasks(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Fields to include in response", schema = @Schema(type = "string"))
          @QueryParam("fields")
          String fieldsParam,
      @Parameter(description = "Filter by task status") @QueryParam("status")
          TaskEntityStatus status,
      @Parameter(description = "Limit the number results", schema = @Schema(type = "integer"))
          @DefaultValue("10")
          @QueryParam("limit")
          @Min(0)
          @Max(1000000)
          int limitParam,
      @Parameter(description = "Returns list of tasks before this cursor") @QueryParam("before")
          String before,
      @Parameter(description = "Returns list of tasks after this cursor") @QueryParam("after")
          String after,
      @Parameter(description = "Include deleted tasks")
          @QueryParam("include")
          @DefaultValue("non-deleted")
          Include include) {
    String userName = securityContext.getUserPrincipal().getName();
    User user = Entity.getEntityByName(Entity.USER, userName, "teams", Include.NON_DELETED);

    List<String> assigneeIds = new ArrayList<>();
    assigneeIds.add(user.getId().toString());
    if (user.getTeams() != null) {
      for (EntityReference team : user.getTeams()) {
        assigneeIds.add(team.getId().toString());
      }
    }

    ListFilter filter = new ListFilter(include);
    if (status != null) {
      filter.addQueryParam("taskStatus", status.value());
    }

    List<Task> allTasksList = new ArrayList<>();
    for (String assigneeId : assigneeIds) {
      ListFilter assigneeFilter = new ListFilter(include);
      if (status != null) {
        assigneeFilter.addQueryParam("taskStatus", status.value());
      }
      assigneeFilter.addQueryParam("assignee", assigneeId);
      ResultList<Task> tasks =
          listInternal(
              uriInfo, securityContext, fieldsParam, assigneeFilter, limitParam, before, after);
      if (tasks.getData() != null) {
        allTasksList.addAll(tasks.getData());
      }
    }

    return new ResultList<>(allTasksList);
  }

  @GET
  @Path("/created")
  @Operation(
      operationId = "listMyCreatedTasks",
      summary = "List tasks created by the current user",
      description = "Get tasks created by the current user.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "List of created tasks",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = TaskList.class)))
      })
  public ResultList<Task> listMyCreatedTasks(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Fields to include in response", schema = @Schema(type = "string"))
          @QueryParam("fields")
          String fieldsParam,
      @Parameter(description = "Filter by task status") @QueryParam("status")
          TaskEntityStatus status,
      @Parameter(description = "Limit the number results", schema = @Schema(type = "integer"))
          @DefaultValue("10")
          @QueryParam("limit")
          @Min(0)
          @Max(1000000)
          int limitParam,
      @Parameter(description = "Returns list of tasks before this cursor") @QueryParam("before")
          String before,
      @Parameter(description = "Returns list of tasks after this cursor") @QueryParam("after")
          String after,
      @Parameter(description = "Include deleted tasks")
          @QueryParam("include")
          @DefaultValue("non-deleted")
          Include include) {
    String userName = securityContext.getUserPrincipal().getName();
    User user = Entity.getEntityByName(Entity.USER, userName, "", Include.NON_DELETED);

    ListFilter filter = new ListFilter(include);
    if (status != null) {
      filter.addQueryParam("taskStatus", status.value());
    }
    filter.addQueryParam("createdById", user.getId().toString());

    return listInternal(uriInfo, securityContext, fieldsParam, filter, limitParam, before, after);
  }

  @GET
  @Path("/{id}")
  @Operation(
      operationId = "getTaskById",
      summary = "Get a task by id",
      description = "Get a task by `id`.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "404", description = "Task for instance {id} is not found")
      })
  public Task get(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id") UUID id,
      @Parameter(description = "Fields to include in response", schema = @Schema(type = "string"))
          @QueryParam("fields")
          String fieldsParam,
      @Parameter(description = "Include deleted task")
          @QueryParam("include")
          @DefaultValue("non-deleted")
          Include include) {
    return getInternal(uriInfo, securityContext, id, fieldsParam, include);
  }

  @GET
  @Path("/name/{taskId}")
  @Operation(
      operationId = "getTaskByTaskId",
      summary = "Get a task by task ID",
      description = "Get a task by human-readable task ID (e.g., TASK-00001).",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "404", description = "Task not found")
      })
  public Task getByName(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task ID (e.g., TASK-00001)") @PathParam("taskId") String taskId,
      @Parameter(description = "Fields to include in response", schema = @Schema(type = "string"))
          @QueryParam("fields")
          String fieldsParam,
      @Parameter(description = "Include deleted task")
          @QueryParam("include")
          @DefaultValue("non-deleted")
          Include include) {
    return getByNameInternal(uriInfo, securityContext, taskId, fieldsParam, include);
  }

  @GET
  @Path("/{id}/versions")
  @Operation(
      operationId = "listTaskVersions",
      summary = "List task versions",
      description = "Get a list of all the versions of a task identified by `id`.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "List of task versions",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = EntityHistory.class)))
      })
  public EntityHistory listVersions(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id")
          UUID id) {
    return super.listVersionsInternal(securityContext, id);
  }

  @GET
  @Path("/{id}/versions/{version}")
  @Operation(
      operationId = "getTaskVersion",
      summary = "Get a specific version of the task",
      description = "Get a version of the task by given `id`.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "Task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Task for instance {id} and version {version} is not found")
      })
  public Task getVersion(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id") UUID id,
      @Parameter(
              description = "Task version number in the form `major`.`minor`",
              schema = @Schema(type = "string", example = "0.1 or 1.1"))
          @PathParam("version")
          String version) {
    return super.getVersionInternal(securityContext, id, version);
  }

  @POST
  @Operation(
      operationId = "createTask",
      summary = "Create a task",
      description = "Create a new task for data governance workflows.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "400", description = "Bad request"),
        @ApiResponse(
            responseCode = "403",
            description = "Domain-only user cannot create task on entity outside their domain")
      })
  public Response create(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Valid CreateTask create) {
    Task task = getTask(create, securityContext.getUserPrincipal().getName());
    enforceDomainOnlyPolicyForTask(securityContext, task);
    return create(uriInfo, securityContext, task);
  }

  @PUT
  @Operation(
      operationId = "createOrUpdateTask",
      summary = "Create or update a task",
      description = "Create a task if it does not exist, otherwise update existing.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "400", description = "Bad request"),
        @ApiResponse(
            responseCode = "403",
            description = "Domain-only user cannot create task on entity outside their domain")
      })
  public Response createOrUpdate(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Valid CreateTask create) {
    Task task = getTask(create, securityContext.getUserPrincipal().getName());
    enforceDomainOnlyPolicyForTask(securityContext, task);
    return createOrUpdate(uriInfo, securityContext, task);
  }

  /**
   * Enforce domain-only policy: Users with DOMAIN_ONLY_ACCESS_ROLE can only create tasks on entities
   * within their domains.
   */
  private void enforceDomainOnlyPolicyForTask(SecurityContext securityContext, Task task) {
    SubjectContext subjectContext = getSubjectContext(securityContext);

    if (subjectContext.isAdmin() || !subjectContext.hasAnyRole(DOMAIN_ONLY_ACCESS_ROLE)) {
      return;
    }

    EntityReference about = task.getAbout();
    if (about == null) {
      return;
    }

    try {
      EntityReference targetDomain = getEntityDomain(about);
      if (targetDomain == null) {
        return;
      }

      List<EntityReference> userDomains = subjectContext.getUserDomains();
      boolean hasMatchingDomain =
          userDomains.stream().anyMatch(d -> d.getId().equals(targetDomain.getId()));

      if (!hasMatchingDomain) {
        throw new AuthorizationException(
            String.format(
                "User with domain-only access cannot create task on entity '%s' in domain '%s'",
                about.getFullyQualifiedName(), targetDomain.getFullyQualifiedName()));
      }
    } catch (AuthorizationException e) {
      throw e;
    } catch (Exception e) {
      LOG.debug(
          "Could not check domain policy for task on entity {}: {}", about.getId(), e.getMessage());
    }
  }

  private EntityReference getEntityDomain(EntityReference entityRef) {
    try {
      EntityRepository<?> repo = Entity.getEntityRepository(entityRef.getType());
      Object entity = repo.get(null, entityRef.getId(), repo.getFields("domain"));

      java.lang.reflect.Method getDomainMethod = entity.getClass().getMethod("getDomain");
      Object domain = getDomainMethod.invoke(entity);
      if (domain instanceof EntityReference) {
        return (EntityReference) domain;
      }
    } catch (Exception e) {
      LOG.debug("Could not get domain for entity {}: {}", entityRef.getId(), e.getMessage());
    }
    return null;
  }

  @PATCH
  @Path("/{id}")
  @Operation(
      operationId = "patchTask",
      summary = "Update a task",
      description = "Update an existing task using JsonPatch.",
      externalDocs =
          @ExternalDocumentation(
              description = "JsonPatch RFC",
              url = "https://tools.ietf.org/html/rfc6902"))
  @Consumes(MediaType.APPLICATION_JSON_PATCH_JSON)
  public Response patch(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id") UUID id,
      @RequestBody(
              description = "JsonPatch with array of operations",
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_PATCH_JSON,
                      examples = {
                        @ExampleObject(
                            "[{\"op\": \"add\", \"path\": \"/status\", \"value\": \"InProgress\"}]")
                      }))
          JsonPatch patch) {
    return patchInternal(uriInfo, securityContext, id, patch);
  }

  @POST
  @Path("/{id}/resolve")
  @Operation(
      operationId = "resolveTask",
      summary = "Resolve a task",
      description = "Resolve a task with approval, rejection, or completion.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The resolved task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "404", description = "Task not found"),
        @ApiResponse(responseCode = "403", description = "User not authorized to resolve task")
      })
  public Response resolveTask(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id") UUID id,
      @Valid ResolveTask resolveTask) {
    String userName = securityContext.getUserPrincipal().getName();
    Fields fields = getFields(FIELDS);
    Task task = repository.get(uriInfo, id, fields);

    repository.checkPermissionsForResolveTask(authorizer, task, false, securityContext);

    TaskResolution resolution =
        new TaskResolution()
            .withType(resolveTask.getResolutionType())
            .withComment(resolveTask.getComment())
            .withNewValue(resolveTask.getNewValue())
            .withResolvedAt(System.currentTimeMillis())
            .withResolvedBy(
                Entity.getEntityReferenceByName(Entity.USER, userName, Include.NON_DELETED));

    Task resolvedTask = repository.resolveTask(task, resolution, userName);
    return Response.ok(resolvedTask).build();
  }

  @POST
  @Path("/{id}/close")
  @Operation(
      operationId = "closeTask",
      summary = "Close a task without resolution",
      description =
          "Close a task without applying any changes. Only the creator or assignee can close.",
      responses = {
        @ApiResponse(
            responseCode = "200",
            description = "The closed task",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = Task.class))),
        @ApiResponse(responseCode = "404", description = "Task not found"),
        @ApiResponse(responseCode = "403", description = "User not authorized to close task")
      })
  public Response closeTask(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id") UUID id,
      @Parameter(description = "Comment for closing the task") @QueryParam("comment")
          String comment) {
    String userName = securityContext.getUserPrincipal().getName();
    Fields fields = getFields(FIELDS);
    Task task = repository.get(uriInfo, id, fields);

    repository.checkPermissionsForResolveTask(authorizer, task, true, securityContext);

    Task closedTask = repository.closeTask(task, userName, comment);
    return Response.ok(closedTask).build();
  }

  @DELETE
  @Path("/{id}")
  @Operation(
      operationId = "deleteTask",
      summary = "Delete a task",
      description = "Delete a task by `id`.",
      responses = {
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Task not found")
      })
  public Response delete(
      @Context UriInfo uriInfo,
      @Context SecurityContext securityContext,
      @Parameter(description = "Hard delete the task")
          @QueryParam("hardDelete")
          @DefaultValue("false")
          boolean hardDelete,
      @Parameter(description = "Task Id", schema = @Schema(type = "UUID")) @PathParam("id")
          UUID id) {
    return delete(uriInfo, securityContext, id, false, hardDelete);
  }

  private Task getTask(CreateTask create, String user) {
    Task task =
        new Task()
            .withId(UUID.randomUUID())
            .withName(create.getName())
            .withDisplayName(create.getDisplayName())
            .withDescription(create.getDescription())
            .withCategory(create.getCategory())
            .withType(create.getType())
            .withStatus(TaskEntityStatus.Open)
            .withPriority(create.getPriority() != null ? create.getPriority() : TaskPriority.Medium)
            .withPayload(create.getPayload())
            .withDueDate(create.getDueDate())
            .withExternalReference(create.getExternalReference())
            .withTags(create.getTags())
            .withCreatedBy(Entity.getEntityReferenceByName(Entity.USER, user, Include.NON_DELETED))
            .withCreatedAt(System.currentTimeMillis())
            .withUpdatedBy(user)
            .withUpdatedAt(System.currentTimeMillis());

    if (create.getAbout() != null && create.getAboutType() != null) {
      task.setAbout(
          Entity.getEntityReferenceByName(
              create.getAboutType(), create.getAbout(), Include.NON_DELETED));
    }

    if (create.getDomain() != null) {
      task.setDomain(
          Entity.getEntityReferenceByName(Entity.DOMAIN, create.getDomain(), Include.NON_DELETED));
    }

    if (create.getAssignees() != null) {
      task.setAssignees(create.getAssignees().stream().map(this::resolveUserOrTeam).toList());
    }

    if (create.getReviewers() != null) {
      task.setReviewers(create.getReviewers().stream().map(this::resolveUserOrTeam).toList());
    }

    return task;
  }

  private EntityReference resolveUserOrTeam(String fqn) {
    try {
      return Entity.getEntityReferenceByName(Entity.USER, fqn, Include.NON_DELETED);
    } catch (Exception e) {
      return Entity.getEntityReferenceByName(Entity.TEAM, fqn, Include.NON_DELETED);
    }
  }
}
