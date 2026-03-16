package org.openmetadata.service.apps.bundles.insights.workflows.dataAssets;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.service.apps.bundles.insights.search.DataInsightsSearchInterface;
import org.openmetadata.service.apps.bundles.insights.search.ManifestEntry;
import org.openmetadata.service.jdbi3.EntityDAO.EntityProjection;

/**
 * Compares a projection scan of the database against the manifest index to produce three sets:
 * changed (updatedAt differs), new (ID not in manifest), and deleted (ID in manifest but not in
 * DB). Unchanged entities are skipped entirely.
 */
@Slf4j
public class DeltaDetector {

  public record DeltaResult(
      List<String> changedIds, List<String> newIds, List<String> deletedIds, int totalScanned) {}

  private final DataInsightsSearchInterface searchInterface;
  private final String manifestIndex;

  public DeltaDetector(DataInsightsSearchInterface searchInterface, String manifestIndex) {
    this.searchInterface = searchInterface;
    this.manifestIndex = manifestIndex;
  }

  public DeltaResult detectDelta(EntityProjectionSource source) throws IOException {
    List<String> changedIds = new ArrayList<>();
    List<String> newIds = new ArrayList<>();
    Set<String> seenIds = new HashSet<>();
    int totalScanned = 0;

    String cursor = "";
    while (true) {
      List<EntityProjection> batch = source.readNextBatch(cursor);
      if (batch.isEmpty()) {
        break;
      }
      totalScanned += batch.size();

      List<String> batchIds = batch.stream().map(EntityProjection::id).toList();
      seenIds.addAll(batchIds);

      Map<String, ManifestEntry> manifestEntries =
          searchInterface.getManifestEntries(manifestIndex, batchIds);

      for (EntityProjection projection : batch) {
        ManifestEntry entry = manifestEntries.get(projection.id());
        if (entry == null) {
          newIds.add(projection.id());
        } else if (entry.lastProcessedUpdatedAt() != projection.updatedAt()) {
          changedIds.add(projection.id());
        }
      }

      cursor = EntityProjectionSource.getNextCursor(batch);
      if (cursor == null) {
        break;
      }
    }

    List<String> deletedIds = new ArrayList<>();
    searchInterface.scrollManifestByEntityType(
        manifestIndex,
        source.getEntityType(),
        entry -> {
          if (!seenIds.contains(entry.entityId())) {
            deletedIds.add(entry.entityId());
          }
        });

    LOG.info(
        "[DeltaDetector] entityType={} scanned={} changed={} new={} deleted={} skipped={}",
        source.getEntityType(),
        totalScanned,
        changedIds.size(),
        newIds.size(),
        deletedIds.size(),
        totalScanned - changedIds.size() - newIds.size());

    return new DeltaResult(changedIds, newIds, deletedIds, totalScanned);
  }
}
