package org.openmetadata.service.search;

import static org.openmetadata.service.search.SearchIndexRetryQueue.STATUS_FAILED;
import static org.openmetadata.service.search.SearchIndexRetryQueue.STATUS_PENDING;
import static org.openmetadata.service.search.SearchIndexRetryQueue.STATUS_PENDING_RETRY_1;
import static org.openmetadata.service.search.SearchIndexRetryQueue.STATUS_PENDING_RETRY_2;

import io.dropwizard.lifecycle.Managed;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.search.IndexMapping;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.search.indexes.SearchIndex;

/**
 * Background worker that continuously retries failed live-indexing writes from
 * {@code search_index_retry_queue}.
 */
@Slf4j
public class SearchIndexRetryWorker implements Managed {

  private static final int POLL_INTERVAL_SECONDS = 30;
  private static final int CLAIM_BATCH_SIZE = 25;
  private static final int MAX_CASCADE_REINDEX = 5000;

  private final CollectionDAO collectionDAO;
  private final SearchRepository searchRepository;
  private final AtomicBoolean running = new AtomicBoolean(false);

  private volatile Thread workerThread;

  public SearchIndexRetryWorker(CollectionDAO collectionDAO, SearchRepository searchRepository) {
    this.collectionDAO = collectionDAO;
    this.searchRepository = searchRepository;
  }

  @Override
  public void start() {
    if (!running.compareAndSet(false, true)) {
      return;
    }
    workerThread = new Thread(this::runLoop, "search-index-retry-worker");
    workerThread.setDaemon(true);
    workerThread.start();
    LOG.info("Started search index retry worker");
  }

  @Override
  public void stop() {
    if (!running.compareAndSet(true, false)) {
      return;
    }
    Thread thread = workerThread;
    if (thread != null) {
      thread.interrupt();
      try {
        thread.join(10_000);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
    LOG.info("Stopped search index retry worker");
  }

  private void runLoop() {
    while (running.get()) {
      try {
        List<CollectionDAO.SearchIndexRetryQueueDAO.SearchIndexRetryRecord> claimed =
            collectionDAO.searchIndexRetryQueueDAO().claimPending(CLAIM_BATCH_SIZE);
        if (claimed.isEmpty()) {
          sleep(POLL_INTERVAL_SECONDS);
          continue;
        }

        for (CollectionDAO.SearchIndexRetryQueueDAO.SearchIndexRetryRecord record : claimed) {
          if (!running.get()) {
            return;
          }
          processRecord(record);
        }
      } catch (Exception e) {
        LOG.error("Unexpected error in search index retry worker", e);
        sleep(POLL_INTERVAL_SECONDS);
      }
    }
  }

  private void processRecord(CollectionDAO.SearchIndexRetryQueueDAO.SearchIndexRetryRecord record) {
    String retryStatus = SearchIndexRetryQueue.normalize(record.getStatus());
    if (retryStatus.isEmpty()) {
      retryStatus = STATUS_PENDING;
    }
    String nextRetryStatus = nextRetryStatus(retryStatus);

    try {
      EntityReference root = resolveEntityReference(record);
      if (root != null) {
        reindexEntityCascade(root);
        collectionDAO
            .searchIndexRetryQueueDAO()
            .deleteByEntity(record.getEntityId(), record.getEntityFqn());
        return;
      }

      // Hard-deleted entities are no longer resolvable from DB; remove stale docs by ID.
      String entityId = SearchIndexRetryQueue.normalize(record.getEntityId());
      if (!entityId.isEmpty()) {
        removeStaleEntityById(entityId);
        collectionDAO
            .searchIndexRetryQueueDAO()
            .deleteByEntity(record.getEntityId(), record.getEntityFqn());
        return;
      }

      collectionDAO
          .searchIndexRetryQueueDAO()
          .updateFailureAndStatus(
              record.getEntityId(),
              record.getEntityFqn(),
              "Unable to resolve entity for retry from entityId/entityFqn",
              nextRetryStatus);
    } catch (Exception e) {
      collectionDAO
          .searchIndexRetryQueueDAO()
          .updateFailureAndStatus(
              record.getEntityId(),
              record.getEntityFqn(),
              SearchIndexRetryQueue.failureReason("retryFailed", e),
              nextRetryStatus);
      LOG.debug(
          "Retry failed for entityId={} entityFqn={} nextStatus={}: {}",
          record.getEntityId(),
          record.getEntityFqn(),
          nextRetryStatus,
          e.getMessage());
    }
  }

  private EntityReference resolveEntityReference(
      CollectionDAO.SearchIndexRetryQueueDAO.SearchIndexRetryRecord record) {
    String entityId = SearchIndexRetryQueue.normalize(record.getEntityId());
    String entityFqn = SearchIndexRetryQueue.normalize(record.getEntityFqn());

    if (!entityId.isEmpty()) {
      try {
        UUID uuid = UUID.fromString(entityId);
        EntityReference byId = resolveById(uuid);
        if (byId != null) {
          return byId;
        }
      } catch (IllegalArgumentException ignored) {
        LOG.debug("Invalid entityId {} in retry queue", entityId);
      }
    }

    if (!entityFqn.isEmpty()) {
      EntityReference byFqn = resolveByFqn(entityFqn);
      if (byFqn != null) {
        return byFqn;
      }
    }
    return null;
  }

  private EntityReference resolveById(UUID id) {
    List<String> typesToTry = candidateEntityTypes();

    for (String entityType : typesToTry) {
      try {
        EntityReference ref = Entity.getEntityReferenceById(entityType, id, Include.ALL);
        if (ref != null && ref.getId() != null) {
          return ref;
        }
      } catch (Exception ignored) {
        // Continue trying other entity types.
      }
    }
    return null;
  }

  private EntityReference resolveByFqn(String fqn) {
    List<String> typesToTry = candidateEntityTypes();
    for (String entityType : typesToTry) {
      try {
        EntityReference ref = Entity.getEntityReferenceByName(entityType, fqn, Include.ALL);
        if (ref != null && ref.getId() != null) {
          return ref;
        }
      } catch (Exception ignored) {
        // Continue trying other entity types.
      }
    }
    return null;
  }

  private List<String> candidateEntityTypes() {
    Set<String> indexedTypes = searchRepository.getSearchEntities();
    List<String> resolved = new ArrayList<>();
    for (String entityType : Entity.getEntityList()) {
      if (!indexedTypes.contains(entityType)) {
        continue;
      }
      try {
        EntityRepository<?> repository = Entity.getEntityRepository(entityType);
        if (repository != null) {
          resolved.add(entityType);
        }
      } catch (Exception ignored) {
        // Skip non-entity index mappings.
      }
    }
    return resolved;
  }

  private void reindexEntityCascade(EntityReference root) throws Exception {
    ArrayDeque<EntityReference> queue = new ArrayDeque<>();
    Set<String> visited = new HashSet<>();
    queue.add(root);
    int processed = 0;

    while (!queue.isEmpty() && processed < MAX_CASCADE_REINDEX) {
      EntityReference current = queue.poll();
      if (current == null || current.getId() == null || current.getType() == null) {
        continue;
      }

      String visitKey = current.getType() + ":" + current.getId();
      if (!visited.add(visitKey)) {
        continue;
      }

      if (!searchRepository.checkIfIndexingIsSupported(current.getType())) {
        continue;
      }

      EntityInterface entity;
      try {
        entity = Entity.getEntity(current, "*", Include.ALL);
      } catch (Exception ex) {
        continue;
      }

      if (entity == null) {
        continue;
      }

      upsertEntityFromDatabase(entity);
      processed++;

      addChildrenByRelation(
          queue,
          entity.getId(),
          entity.getEntityReference().getType(),
          Relationship.CONTAINS.ordinal());

      if (Entity.DOMAIN.equals(entity.getEntityReference().getType())
          || Entity.DATA_PRODUCT.equals(entity.getEntityReference().getType())) {
        addChildrenByRelation(
            queue,
            entity.getId(),
            entity.getEntityReference().getType(),
            Relationship.HAS.ordinal());
      }
    }

    if (processed >= MAX_CASCADE_REINDEX) {
      LOG.warn(
          "Stopped retry cascade early after reaching max cascade limit for root {}:{}",
          root.getType(),
          root.getId());
    }
  }

  private void upsertEntityFromDatabase(EntityInterface entity) throws Exception {
    String entityType = entity.getEntityReference().getType();
    IndexMapping indexMapping = searchRepository.getIndexMapping(entityType);
    if (indexMapping == null) {
      return;
    }

    SearchIndex searchIndex =
        searchRepository.getSearchIndexFactory().buildIndex(entityType, entity);
    String doc = JsonUtils.pojoToJson(searchIndex.buildSearchIndexDoc());
    searchRepository
        .getSearchClient()
        .createEntity(
            indexMapping.getIndexName(searchRepository.getClusterAlias()),
            entity.getId().toString(),
            doc);
  }

  private void addChildrenByRelation(
      ArrayDeque<EntityReference> queue, UUID fromId, String fromEntityType, int relation) {
    List<CollectionDAO.EntityRelationshipRecord> children =
        collectionDAO.relationshipDAO().findTo(fromId, fromEntityType, relation);
    for (CollectionDAO.EntityRelationshipRecord child : children) {
      if (child == null || child.getId() == null || child.getType() == null) {
        continue;
      }
      if (!searchRepository.checkIfIndexingIsSupported(child.getType())) {
        continue;
      }
      queue.add(new EntityReference().withId(child.getId()).withType(child.getType()));
    }
  }

  private void removeStaleEntityById(String entityId) {
    for (String entityType : searchRepository.getSearchEntities()) {
      IndexMapping indexMapping = searchRepository.getIndexMapping(entityType);
      if (indexMapping == null) {
        continue;
      }
      try {
        searchRepository
            .getSearchClient()
            .deleteEntity(indexMapping.getIndexName(searchRepository.getClusterAlias()), entityId);
      } catch (Exception ignored) {
        // Ignore not-found / index mismatch and continue best-effort cleanup.
      }
    }
  }

  private void sleep(int seconds) {
    try {
      Thread.sleep(seconds * 1000L);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private String nextRetryStatus(String currentStatus) {
    return switch (currentStatus) {
      case STATUS_PENDING -> STATUS_PENDING_RETRY_1;
      case STATUS_PENDING_RETRY_1 -> STATUS_PENDING_RETRY_2;
      case STATUS_PENDING_RETRY_2 -> STATUS_FAILED;
      default -> STATUS_FAILED;
    };
  }
}
