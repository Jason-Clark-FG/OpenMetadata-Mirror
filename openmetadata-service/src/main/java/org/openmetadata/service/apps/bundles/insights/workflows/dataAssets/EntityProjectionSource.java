package org.openmetadata.service.apps.bundles.insights.workflows.dataAssets;

import java.util.List;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.EntityDAO;
import org.openmetadata.service.jdbi3.EntityDAO.EntityProjection;
import org.openmetadata.service.jdbi3.EntityRepository;

/**
 * Lightweight entity source that reads only (id, updatedAt) projections for delta detection. Unlike
 * {@link org.openmetadata.service.workflows.searchIndex.PaginatedEntitiesSource}, this does NOT
 * read the full entity JSON — it returns ~100 bytes per entity instead of ~2KB, making it suitable
 * for scanning all entities efficiently during the delta detection phase.
 */
@Slf4j
public class EntityProjectionSource {
  @Getter private final String entityType;
  private final int batchSize;
  private final EntityDAO<?> dao;

  public EntityProjectionSource(String entityType, int batchSize) {
    this.entityType = entityType;
    this.batchSize = batchSize;
    EntityRepository<?> repository = Entity.getEntityRepository(entityType);
    this.dao = repository.getDao();
  }

  /**
   * Reads the next batch of (id, updatedAt) projections using keyset pagination on the id column.
   *
   * @param afterId the last id from the previous batch, or empty string for the first batch
   * @return list of projections, empty when no more entities remain
   */
  public List<EntityProjection> readNextBatch(String afterId) {
    List<EntityProjection> batch = dao.listProjections(afterId, batchSize);
    LOG.debug(
        "[EntityProjectionSource] entityType={} afterId={} batchSize={} returned={}",
        entityType,
        afterId,
        batchSize,
        batch.size());
    return batch;
  }

  /**
   * Returns the last id in the batch for use as the cursor for the next call. Returns null if the
   * batch is empty (no more entities).
   */
  public static String getNextCursor(List<EntityProjection> batch) {
    if (batch == null || batch.isEmpty()) {
      return null;
    }
    return batch.getLast().id();
  }
}
