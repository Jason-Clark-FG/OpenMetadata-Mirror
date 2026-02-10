package org.openmetadata.service.search.opensearch;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Phaser;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.system.StepStats;
import org.openmetadata.service.apps.bundles.searchIndex.OpenSearchBulkSink;
import org.openmetadata.service.search.ReindexContext;
import org.openmetadata.service.search.SearchRepository;
import org.openmetadata.service.search.VectorBulkProcessor;
import org.openmetadata.service.search.vector.OpenSearchVectorService;
import org.openmetadata.service.search.vector.VectorDocBuilder;
import org.openmetadata.service.search.vector.VectorIndexService;
import org.openmetadata.service.search.vector.utils.AvailableEntityTypes;

@Slf4j
public class OpenSearchBulkSinkExt extends OpenSearchBulkSink {
  private static final int MAX_VECTOR_THREADS = 10;

  private final SearchRepository searchRepository;
  private final ExecutorService vectorExecutor;
  private final Phaser phaser;
  private final CopyOnWriteArrayList<Thread> pendingThreads;
  private final AtomicLong vectorSuccess = new AtomicLong(0);
  private final AtomicLong vectorFailed = new AtomicLong(0);
  private VectorBulkProcessor vectorBulkProcessor;

  public OpenSearchBulkSinkExt(
      SearchRepository searchRepository,
      int batchSize,
      int maxConcurrentRequests,
      long maxPayloadSizeBytes) {
    super(searchRepository, batchSize, maxConcurrentRequests, maxPayloadSizeBytes);
    this.searchRepository = searchRepository;
    this.vectorExecutor =
        Executors.newFixedThreadPool(MAX_VECTOR_THREADS, Thread.ofVirtual().factory());
    this.phaser = new Phaser(1);
    this.pendingThreads = new CopyOnWriteArrayList<>();
  }

  @Override
  protected boolean isVectorEmbeddingEnabledForEntity(String entityType) {
    return searchRepository.isVectorEmbeddingEnabled()
        && OpenSearchVectorService.getInstance() != null
        && AvailableEntityTypes.isVectorIndexable(entityType);
  }

  @Override
  protected void addEntitiesToVectorIndexBatch(
      CustomBulkProcessor bulkProcessor,
      List<EntityInterface> entities,
      boolean recreateIndex,
      ReindexContext reindexContext) {
    if (entities.isEmpty()) {
      return;
    }

    OpenSearchVectorService vectorService = OpenSearchVectorService.getInstance();
    if (vectorService == null) {
      return;
    }

    String entityType = entities.getFirst().getEntityReference().getType();
    if (!AvailableEntityTypes.isVectorIndexable(entityType)) {
      return;
    }

    String canonicalIndex = VectorIndexService.getClusteredIndexName();
    String finalTargetIndex = canonicalIndex;
    String finalSourceIndex = null;

    if (reindexContext != null) {
      String stagedIndex =
          reindexContext.getStagedIndex(VectorIndexService.VECTOR_INDEX_KEY).orElse(null);
      if (stagedIndex != null) {
        finalSourceIndex = canonicalIndex;
        finalTargetIndex = stagedIndex;
      }
    }

    String srcIdx = finalSourceIndex;
    String tgtIdx = finalTargetIndex;

    Map<String, String> existingFingerprints = Map.of();
    if (srcIdx != null) {
      List<String> parentIds = new ArrayList<>(entities.size());
      for (EntityInterface entity : entities) {
        parentIds.add(entity.getId().toString());
      }
      existingFingerprints = vectorService.getExistingFingerprintsBatch(srcIdx, parentIds);
    }

    for (EntityInterface entity : entities) {
      String parentId = entity.getId().toString();
      String existingFp = existingFingerprints.get(parentId);
      String currentFp = VectorDocBuilder.computeFingerprintForEntity(entity);

      if (existingFp != null && existingFp.equals(currentFp) && srcIdx != null) {
        submitVectorTask(
            () -> processMigration(vectorService, srcIdx, tgtIdx, parentId, currentFp, entity));
      } else {
        submitVectorTask(() -> processEmbedding(vectorService, entity, tgtIdx));
      }
    }
  }

  private void processMigration(
      OpenSearchVectorService vectorService,
      String sourceIndex,
      String targetIndex,
      String parentId,
      String fingerprint,
      EntityInterface entity) {
    try {
      if (vectorService.copyExistingVectorDocuments(
          sourceIndex, targetIndex, parentId, fingerprint)) {
        vectorSuccess.incrementAndGet();
      } else {
        processEmbedding(vectorService, entity, targetIndex);
      }
    } catch (Exception e) {
      LOG.warn(
          "Vector migration failed for parent_id={}, falling back to recomputation: {}",
          parentId,
          e.getMessage());
      processEmbedding(vectorService, entity, targetIndex);
    }
  }

  private void processEmbedding(
      OpenSearchVectorService vectorService, EntityInterface entity, String targetIndex) {
    try {
      vectorService.updateVectorEmbeddings(entity, targetIndex);
      vectorSuccess.incrementAndGet();
    } catch (Exception e) {
      vectorFailed.incrementAndGet();
      LOG.error("Vector embedding failed for entity {}: {}", entity.getId(), e.getMessage(), e);
    }
  }

  private void submitVectorTask(Runnable task) {
    phaser.register();
    vectorExecutor.submit(
        () -> {
          Thread current = Thread.currentThread();
          pendingThreads.add(current);
          try {
            task.run();
          } finally {
            pendingThreads.remove(current);
            phaser.arriveAndDeregister();
          }
        });
  }

  @Override
  public boolean awaitVectorCompletion(int timeoutSeconds) {
    try {
      int phase = phaser.arrive();
      phaser.awaitAdvanceInterruptibly(phase, timeoutSeconds, TimeUnit.SECONDS);
      return true;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    } catch (TimeoutException e) {
      LOG.warn("Timeout waiting for vector completion after {}s", timeoutSeconds);
      return false;
    }
  }

  @Override
  public int getPendingVectorTaskCount() {
    return Math.max(0, phaser.getUnarrivedParties() - 1);
  }

  @Override
  public StepStats getVectorStats() {
    return new StepStats()
        .withTotalRecords((int) (vectorSuccess.get() + vectorFailed.get()))
        .withSuccessRecords((int) vectorSuccess.get())
        .withFailedRecords((int) vectorFailed.get());
  }

  @Override
  public void close() {
    try {
      awaitVectorCompletion(300);
    } catch (Exception e) {
      LOG.warn("Error awaiting vector completion during close: {}", e.getMessage());
    }

    if (vectorBulkProcessor != null) {
      vectorBulkProcessor.close();
    }

    vectorExecutor.shutdown();
    try {
      if (!vectorExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
        vectorExecutor.shutdownNow();
      }
    } catch (InterruptedException e) {
      vectorExecutor.shutdownNow();
      Thread.currentThread().interrupt();
    }

    super.close();
  }
}
