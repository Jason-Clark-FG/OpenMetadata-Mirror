/*
 *  Copyright 2021 Collate
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

package org.openmetadata.service.events.lifecycle;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.security.policyevaluator.SubjectContext;

/**
 * Dispatcher for entity lifecycle events.
 * Manages a collection of EntityLifecycleEventHandler implementations and dispatches
 * events to them based on their configuration and priorities.
 */
@Slf4j
public class EntityLifecycleEventDispatcher {

  private static volatile EntityLifecycleEventDispatcher instance;
  private final List<EntityLifecycleEventHandler> handlers;
  private final ExecutorService asyncExecutor;

  private EntityLifecycleEventDispatcher() {
    this.handlers = new ArrayList<>();
    this.asyncExecutor = Executors.newVirtualThreadPerTaskExecutor();
  }

  public static EntityLifecycleEventDispatcher getInstance() {
    if (instance == null) {
      synchronized (EntityLifecycleEventDispatcher.class) {
        if (instance == null) {
          instance = new EntityLifecycleEventDispatcher();
        }
      }
    }
    return instance;
  }

  /**
   * Register a new lifecycle event handler.
   * Handlers are automatically sorted by priority after registration.
   */
  public synchronized void registerHandler(EntityLifecycleEventHandler handler) {
    if (handler == null) {
      LOG.warn("Attempted to register null entity lifecycle handler");
      return;
    }

    // Check if handler with same name already exists
    boolean exists =
        handlers.stream().anyMatch(h -> h.getHandlerName().equals(handler.getHandlerName()));

    if (exists) {
      LOG.warn("Handler with name '{}' already registered, skipping", handler.getHandlerName());
      return;
    }

    handlers.add(handler);
    // Sort handlers by priority (lower priority values first)
    handlers.sort(Comparator.comparingInt(EntityLifecycleEventHandler::getPriority));

    LOG.info(
        "Registered entity lifecycle handler: {} with priority {}",
        handler.getHandlerName(),
        handler.getPriority());
  }

  /**
   * Unregister a lifecycle event handler by name.
   */
  public synchronized boolean unregisterHandler(String handlerName) {
    boolean removed = handlers.removeIf(h -> h.getHandlerName().equals(handlerName));
    if (removed) {
      LOG.info("Unregistered entity lifecycle handler: {}", handlerName);
    }
    return removed;
  }

  /**
   * Get list of all registered handlers.
   *
   * @return Unmodifiable list of handlers
   */
  public List<EntityLifecycleEventHandler> getHandlers() {
    return List.copyOf(handlers);
  }

  /**
   * Dispatch entity created event to all applicable handlers.
   */
  public void onEntityCreated(EntityInterface entity, SubjectContext subjectContext) {
    if (entity == null) return;

    String entityType = entity.getEntityReference().getType();
    LOG.debug("Dispatching entity created event for {} {}", entityType, entity.getId());

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () -> handler.onEntityCreated(snapshotEntityForHandler(entity, async), subjectContext),
          handler,
          async);
    }
  }

  /**
   * Dispatch bulk entity created event to all applicable handlers.
   * Handlers that support bulk operations will receive the full list for batch processing.
   */
  public void onEntitiesCreated(List<EntityInterface> entities, SubjectContext subjectContext) {
    if (entities == null || entities.isEmpty()) return;

    String entityType = entities.getFirst().getEntityReference().getType();
    LOG.debug(
        "Dispatching bulk entity created event for {} {} entities", entityType, entities.size());

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () ->
              handler.onEntitiesCreated(
                  snapshotEntitiesForHandler(entities, async), subjectContext),
          handler,
          async);
    }
  }

  /**
   * Dispatch entity updated event to all applicable handlers.
   */
  public void onEntityUpdated(
      EntityInterface entity, ChangeDescription changeDescription, SubjectContext subjectContext) {
    if (entity == null) return;

    String entityType = entity.getEntityReference().getType();
    LOG.debug("Dispatching entity updated event for {} {}", entityType, entity.getId());

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () ->
              handler.onEntityUpdated(
                  snapshotEntityForHandler(entity, async),
                  snapshotChangeDescriptionForHandler(changeDescription, async),
                  subjectContext),
          handler,
          async);
    }
  }

  /**
   * Dispatch entity updated event to all applicable handlers.
   */
  public void onEntityUpdated(EntityReference entityReference, SubjectContext subjectContext) {
    if (entityReference == null) return;

    String entityType = entityReference.getType();
    LOG.debug("Dispatching entity updated event for {} {}", entityType, entityReference.getId());

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () ->
              handler.onEntityUpdated(
                  snapshotEntityReferenceForHandler(entityReference, async), subjectContext),
          handler,
          async);
    }
  }

  /**
   * Dispatch entity deleted event to all applicable handlers.
   */
  public void onEntityDeleted(EntityInterface entity, SubjectContext subjectContext) {
    if (entity == null) return;

    String entityType = entity.getEntityReference().getType();
    LOG.debug("Dispatching entity deleted event for {} {}", entityType, entity.getId());

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () -> handler.onEntityDeleted(snapshotEntityForHandler(entity, async), subjectContext),
          handler,
          async);
    }
  }

  /**
   * Dispatch entity soft deleted or restored event to all applicable handlers.
   */
  public void onEntitySoftDeletedOrRestored(
      EntityInterface entity, boolean isDeleted, SubjectContext subjectContext) {
    if (entity == null) return;

    String entityType = entity.getEntityReference().getType();
    LOG.debug(
        "Dispatching entity soft delete/restore event for {} {} (deleted: {})",
        entityType,
        entity.getId(),
        isDeleted);

    for (EntityLifecycleEventHandler handler : getApplicableHandlers(entityType)) {
      boolean async = handler.isAsync();
      executeHandler(
          () ->
              handler.onEntitySoftDeletedOrRestored(
                  snapshotEntityForHandler(entity, async), isDeleted, subjectContext),
          handler,
          async);
    }
  }

  private List<EntityLifecycleEventHandler> getApplicableHandlers(String entityType) {
    return handlers.stream()
        .filter(
            handler -> {
              var supportedTypes = handler.getSupportedEntityTypes();
              return supportedTypes.isEmpty() || supportedTypes.contains(entityType);
            })
        .toList();
  }

  private EntityInterface snapshotEntityForHandler(EntityInterface entity, boolean async) {
    if (!async || entity == null) {
      return entity;
    }
    return deepCopy(entity);
  }

  private List<EntityInterface> snapshotEntitiesForHandler(
      List<EntityInterface> entities, boolean async) {
    if (!async) {
      return List.copyOf(entities);
    }
    List<EntityInterface> snapshots = new ArrayList<>(entities.size());
    for (EntityInterface entity : entities) {
      snapshots.add(entity == null ? null : deepCopy(entity));
    }
    return List.copyOf(snapshots);
  }

  private ChangeDescription snapshotChangeDescriptionForHandler(
      ChangeDescription changeDescription, boolean async) {
    if (!async || changeDescription == null) {
      return changeDescription;
    }
    return JsonUtils.deepCopy(changeDescription, ChangeDescription.class);
  }

  private EntityReference snapshotEntityReferenceForHandler(
      EntityReference entityReference, boolean async) {
    if (!async || entityReference == null) {
      return entityReference;
    }
    return JsonUtils.deepCopy(entityReference, EntityReference.class);
  }

  @SuppressWarnings("unchecked")
  private static <T> T deepCopy(T value) {
    return JsonUtils.deepCopy(value, (Class<T>) value.getClass());
  }

  private void executeHandler(
      Runnable handlerExecution, EntityLifecycleEventHandler handler, boolean async) {
    if (async) {
      asyncExecutor.execute(
          () -> {
            try {
              handlerExecution.run();
            } catch (Exception e) {
              LOG.error("Async entity lifecycle handler '{}' failed", handler.getHandlerName(), e);
            }
          });
    } else {
      try {
        handlerExecution.run();
      } catch (Exception e) {
        LOG.error("Sync entity lifecycle handler '{}' failed", handler.getHandlerName(), e);
        // For sync handlers, we could choose to re-throw the exception
        // to prevent the main operation from completing, but for now we just log
      }
    }
  }

  /**
   * Shutdown the dispatcher and its async executor.
   * Should be called during application shutdown.
   */
  public void shutdown() {
    LOG.info("Shutting down EntityLifecycleEventDispatcher");
    asyncExecutor.shutdown();
  }

  /**
   * Get count of registered handlers.
   *
   * @return Number of registered handlers
   */
  public int getHandlerCount() {
    return handlers.size();
  }
}
