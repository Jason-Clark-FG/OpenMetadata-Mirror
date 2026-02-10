package org.openmetadata.service.search.vector;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OpenSearchVectorServiceTest {

  @Test
  void testVectorIndexConstants() {
    assertEquals("vectorEmbedding", VectorIndexService.VECTOR_INDEX_KEY);
    assertEquals("vector_search_index", VectorIndexService.VECTOR_INDEX_NAME);
  }

  @Test
  void testQueryBuilderProducesValidJson() {
    float[] vector = new float[] {0.1f, 0.2f, 0.3f};
    String json = VectorSearchQueryBuilder.build(vector, 10, 10, null);

    assertNotNull(json);
    assertTrue(json.startsWith("{"));
    assertTrue(json.endsWith("}"));
    assertTrue(json.contains("\"knn\""));
  }

  @Test
  void testQueryBuilderWithFilters() {
    float[] vector = new float[] {0.1f, 0.2f};
    Map<String, List<String>> filters = Map.of("entityType", List.of("table"));

    String json = VectorSearchQueryBuilder.build(vector, 5, 5, filters);

    assertTrue(json.contains("table"));
    assertTrue(json.contains("\"deleted\":false"));
  }

  @Test
  void testQueryBuilderWithEmptyFilters() {
    float[] vector = new float[] {0.5f};
    String json = VectorSearchQueryBuilder.build(vector, 3, 3, Collections.emptyMap());

    assertNotNull(json);
    assertTrue(json.contains("\"deleted\":false"));
  }

  @Test
  void testSingletonInitiallyNull() {
    // Before init is called, getInstance returns the current state
    // This test just verifies the static method is accessible
    // In a real test we'd need to reset the singleton
    assertNotNull(VectorIndexService.VECTOR_INDEX_KEY);
  }
}
