package org.openmetadata.service.apps.bundles.insights.search.opensearch;

import java.io.IOException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.search.IndexMapping;
import org.openmetadata.service.apps.bundles.insights.search.DataInsightsSearchConfiguration;
import org.openmetadata.service.apps.bundles.insights.search.DataInsightsSearchInterface;
import org.openmetadata.service.apps.bundles.insights.search.EntityIndexMap;
import org.openmetadata.service.apps.bundles.insights.search.IndexMappingTemplate;
import org.openmetadata.service.apps.bundles.insights.search.IndexTemplate;
import org.openmetadata.service.apps.bundles.insights.search.ManifestEntry;
import org.openmetadata.service.search.opensearch.OsUtils;
import os.org.opensearch.client.opensearch.OpenSearchClient;
import os.org.opensearch.client.opensearch.generic.OpenSearchGenericClient;
import os.org.opensearch.client.opensearch.generic.Requests;

public class OpenSearchDataInsightsClient implements DataInsightsSearchInterface {
  private final OpenSearchClient client;
  private final String resourcePath = "/dataInsights/opensearch";
  private final String clusterAlias;

  public OpenSearchDataInsightsClient(OpenSearchClient client, String clusterAlias) {
    this.client = client;
    this.clusterAlias = clusterAlias;
  }

  @Override
  public String getClusterAlias() {
    return clusterAlias;
  }

  private os.org.opensearch.client.opensearch.generic.Response performRequest(
      String method, String path) throws IOException {
    OpenSearchGenericClient genericClient = client.generic();
    return genericClient.execute(Requests.builder().method(method).endpoint(path).build());
  }

  private os.org.opensearch.client.opensearch.generic.Response performRequest(
      String method, String path, String payload) throws IOException {
    OpenSearchGenericClient genericClient = client.generic();
    return genericClient.execute(
        Requests.builder().method(method).endpoint(path).json(payload).build());
  }

  @Override
  public void createComponentTemplate(String name, String template) throws IOException {
    performRequest("PUT", String.format("/_component_template/%s", name), template);
  }

  @Override
  public void createIndexTemplate(String name, String template) throws IOException {
    performRequest("PUT", String.format("/_index_template/%s", name), template);
  }

  @Override
  public void createDataStream(String name) throws IOException {
    performRequest("PUT", String.format("/_data_stream/%s", name));
  }

  @Override
  public Boolean dataAssetDataStreamExists(String name) throws IOException {
    var response = performRequest("HEAD", String.format("/%s", name));
    return response.getStatus() == 200;
  }

  @Override
  public void createDataAssetsDataStream(
      String name,
      String entityType,
      IndexMapping entityIndexMapping,
      String language,
      int retentionDays)
      throws IOException {
    createComponentTemplate(
        getStringWithClusterAlias("di-data-assets-mapping"),
        buildMapping(
            entityType,
            entityIndexMapping,
            language,
            readResource(String.format("%s/indexMappingsTemplate.json", resourcePath))));
    createIndexTemplate(
        getStringWithClusterAlias("di-data-assets"),
        IndexTemplate.getIndexTemplateWithClusterAlias(
            getClusterAlias(), readResource(String.format("%s/indexTemplate.json", resourcePath))));
    createDataStream(name);
  }

  @Override
  public void deleteDataAssetDataStream(String name) throws IOException {
    performRequest("DELETE", String.format("/_data_stream/%s", name));
  }

  @Override
  public String getResourcePath() {
    return resourcePath;
  }

  @Override
  public void createManifestIndex(String name, String mappingJson) throws IOException {
    performRequest("PUT", String.format("/%s", name), mappingJson);
  }

  @Override
  public boolean manifestIndexExists(String name) throws IOException {
    var response = performRequest("HEAD", String.format("/%s", name));
    return response.getStatus() == 200;
  }

  @Override
  public void deleteManifestIndex(String name) throws IOException {
    performRequest("DELETE", String.format("/%s", name));
  }

  @Override
  public void createTransform(String transformId, String transformDefinition) throws IOException {
    performRequest(
        "PUT", String.format("/_plugins/_transform/%s", transformId), transformDefinition);
  }

  @Override
  public void startTransform(String transformId) throws IOException {
    performRequest("POST", String.format("/_plugins/_transform/%s/_start", transformId));
  }

  @Override
  public void stopTransform(String transformId) throws IOException {
    performRequest("POST", String.format("/_plugins/_transform/%s/_stop", transformId));
  }

  @Override
  public boolean transformExists(String transformId) throws IOException {
    try {
      performRequest("GET", String.format("/_plugins/_transform/%s", transformId));
      return true;
    } catch (IOException e) {
      if (e.getMessage() != null && e.getMessage().contains("404")) {
        return false;
      }
      throw e;
    }
  }

  @Override
  public String getTransformStatus(String transformId) throws IOException {
    var response =
        performRequest("GET", String.format("/_plugins/_transform/%s/_stats", transformId));
    String body = new String(response.getBody().get().bodyAsBytes());
    if (body.contains("\"state\":\"started\"")) {
      return "started";
    } else if (body.contains("\"state\":\"stopped\"")) {
      return "stopped";
    } else if (body.contains("\"state\":\"failed\"")) {
      return "failed";
    }
    return "unknown";
  }

  @Override
  public void createIndex(String name, String mappingJson) throws IOException {
    performRequest("PUT", String.format("/%s", name), mappingJson);
  }

  @Override
  public boolean indexExists(String name) throws IOException {
    var response = performRequest("HEAD", String.format("/%s", name));
    return response.getStatus() == 200;
  }

  @Override
  public String buildMapping(
      String entityType,
      IndexMapping entityIndexMapping,
      String language,
      String indexMappingTemplateStr) {
    IndexMappingTemplate indexMappingTemplate =
        JsonUtils.readOrConvertValue(indexMappingTemplateStr, IndexMappingTemplate.class);
    String mappingContent =
        readResource(
            String.format(entityIndexMapping.getIndexMappingFile(), language.toLowerCase()));
    String transformedContent = OsUtils.enrichIndexMappingForOpenSearch(mappingContent);
    EntityIndexMap entityIndexMap =
        JsonUtils.readOrConvertValue(transformedContent, EntityIndexMap.class);

    DataInsightsSearchConfiguration dataInsightsSearchConfiguration =
        readDataInsightsSearchConfiguration();
    List<String> entityAttributeFields =
        getEntityAttributeFields(dataInsightsSearchConfiguration, entityType);

    indexMappingTemplate
        .getTemplate()
        .getSettings()
        .put("analysis", entityIndexMap.getSettings().get("analysis"));

    for (String attribute : entityAttributeFields) {
      if (!indexMappingTemplate
          .getTemplate()
          .getMappings()
          .getProperties()
          .containsKey(attribute)) {
        Object value = entityIndexMap.getMappings().getProperties().get(attribute);
        if (value != null) {
          indexMappingTemplate.getTemplate().getMappings().getProperties().put(attribute, value);
        }
      }
    }

    return JsonUtils.pojoToJson(indexMappingTemplate);
  }

  @Override
  @SuppressWarnings("unchecked")
  public Map<String, ManifestEntry> getManifestEntries(
      String manifestIndex, List<String> entityIds) throws IOException {
    Map<String, ManifestEntry> result = new HashMap<>();
    if (entityIds == null || entityIds.isEmpty()) {
      return result;
    }
    List<Map<String, String>> docs =
        entityIds.stream().map(id -> Map.of("_index", manifestIndex, "_id", id)).toList();
    String body = JsonUtils.pojoToJson(Map.of("docs", docs));
    var response = performRequest("GET", "/_mget", body);
    String responseBody = new String(response.getBody().get().bodyAsBytes());
    Map<String, Object> parsed = JsonUtils.readOrConvertValue(responseBody, Map.class);
    List<Map<String, Object>> docResults = (List<Map<String, Object>>) parsed.get("docs");
    if (docResults != null) {
      for (Map<String, Object> doc : docResults) {
        if (Boolean.TRUE.equals(doc.get("found"))) {
          Map<String, Object> source = (Map<String, Object>) doc.get("_source");
          ManifestEntry entry = parseManifestSource(source);
          result.put(entry.entityId(), entry);
        }
      }
    }
    return result;
  }

  @Override
  public void bulkUpsertManifest(String manifestIndex, List<ManifestEntry> entries)
      throws IOException {
    if (entries == null || entries.isEmpty()) {
      return;
    }
    StringBuilder bulk = new StringBuilder();
    for (ManifestEntry entry : entries) {
      bulk.append(
          String.format(
              "{\"index\":{\"_index\":\"%s\",\"_id\":\"%s\"}}\n",
              manifestIndex, entry.entityId()));
      bulk.append(
          String.format(
              "{\"entityId\":\"%s\",\"entityType\":\"%s\",\"lastProcessedUpdatedAt\":%d,\"lastSnapshotDate\":\"%s\"}\n",
              entry.entityId(),
              entry.entityType(),
              entry.lastProcessedUpdatedAt(),
              entry.lastSnapshotDate().toString()));
    }
    performRequest("POST", "/_bulk", bulk.toString());
  }

  @Override
  @SuppressWarnings("unchecked")
  public void scrollManifestByEntityType(
      String manifestIndex, String entityType, Consumer<ManifestEntry> consumer)
      throws IOException {
    String query =
        String.format(
            "{\"size\":1000,\"query\":{\"term\":{\"entityType\":\"%s\"}}}", entityType);
    var response =
        performRequest("POST", String.format("/%s/_search?scroll=1m", manifestIndex), query);
    String responseBody = new String(response.getBody().get().bodyAsBytes());
    Map<String, Object> parsed = JsonUtils.readOrConvertValue(responseBody, Map.class);
    String scrollId = (String) parsed.get("_scroll_id");

    processScrollHits(parsed, consumer);

    while (scrollId != null) {
      String scrollBody = String.format("{\"scroll\":\"1m\",\"scroll_id\":\"%s\"}", scrollId);
      var scrollResponse = performRequest("POST", "/_search/scroll", scrollBody);
      String scrollResponseBody = new String(scrollResponse.getBody().get().bodyAsBytes());
      Map<String, Object> scrollParsed =
          JsonUtils.readOrConvertValue(scrollResponseBody, Map.class);
      scrollId = (String) scrollParsed.get("_scroll_id");
      int processed = processScrollHits(scrollParsed, consumer);
      if (processed == 0) {
        break;
      }
    }
  }

  @Override
  public void deleteManifestEntries(String manifestIndex, List<String> entityIds)
      throws IOException {
    if (entityIds == null || entityIds.isEmpty()) {
      return;
    }
    StringBuilder bulk = new StringBuilder();
    for (String id : entityIds) {
      bulk.append(
          String.format("{\"delete\":{\"_index\":\"%s\",\"_id\":\"%s\"}}\n", manifestIndex, id));
    }
    performRequest("POST", "/_bulk", bulk.toString());
  }

  @SuppressWarnings("unchecked")
  private int processScrollHits(Map<String, Object> parsed, Consumer<ManifestEntry> consumer) {
    Map<String, Object> hits = (Map<String, Object>) parsed.get("hits");
    if (hits == null) {
      return 0;
    }
    List<Map<String, Object>> hitList = (List<Map<String, Object>>) hits.get("hits");
    if (hitList == null || hitList.isEmpty()) {
      return 0;
    }
    for (Map<String, Object> hit : hitList) {
      Map<String, Object> source = (Map<String, Object>) hit.get("_source");
      consumer.accept(parseManifestSource(source));
    }
    return hitList.size();
  }

  private ManifestEntry parseManifestSource(Map<String, Object> source) {
    return new ManifestEntry(
        (String) source.get("entityId"),
        (String) source.get("entityType"),
        ((Number) source.get("lastProcessedUpdatedAt")).longValue(),
        LocalDate.parse((String) source.get("lastSnapshotDate")));
  }
}
