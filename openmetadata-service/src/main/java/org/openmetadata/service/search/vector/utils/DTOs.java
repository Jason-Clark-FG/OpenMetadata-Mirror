package org.openmetadata.service.search.vector.utils;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public final class DTOs {
  private DTOs() {}

  @Data
  @NoArgsConstructor
  @AllArgsConstructor
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class VectorSearchRequest {
    public String query;
    public Map<String, List<String>> filters;
    public int size = 10;
    public int k = 10;
    public double threshold = 0.0;
  }

  @Data
  @NoArgsConstructor
  @AllArgsConstructor
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class VectorSearchResponse {
    public long tookMillis;
    public List<Map<String, Object>> hits;
  }

  @Data
  @NoArgsConstructor
  @AllArgsConstructor
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class FingerprintResponse {
    public String parentId;
    public String indexName;
    public String fingerprint;
    public String message;
  }

  @Data
  @Builder
  public static class VectorDocument {
    private String id;
    private String entityType;
    private String fullyQualifiedName;
    private String text;
    private String fingerprint;
    private float[] embedding;
    private Map<String, Object> filterFields;
  }

  @Data
  @Builder
  public static class VectorSearchResult {
    private String id;
    private String entityType;
    private String fullyQualifiedName;
    private double score;
    private Map<String, Object> source;
  }
}
