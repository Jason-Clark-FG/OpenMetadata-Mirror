package org.openmetadata.service.search.elasticsearch;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.service.apps.bundles.searchIndex.ElasticSearchBulkSink;
import org.openmetadata.service.search.SearchRepository;

@Slf4j
public class ElasticSearchBulkSinkExt extends ElasticSearchBulkSink {

  public ElasticSearchBulkSinkExt(
      SearchRepository searchRepository,
      int batchSize,
      int maxConcurrentRequests,
      long maxPayloadSizeBytes) {
    super(searchRepository, batchSize, maxConcurrentRequests, maxPayloadSizeBytes);
    LOG.info("ElasticSearch vector embedding support is not yet implemented");
  }

  @Override
  protected boolean isVectorEmbeddingEnabledForEntity(String entityType) {
    return false;
  }

  @Override
  protected void addEntitiesToVectorIndexBatch(
      CustomBulkProcessor bulkProcessor, List<EntityInterface> entities, boolean recreateIndex) {
    // TODO: Implement Elasticsearch vector embedding support
  }
}
