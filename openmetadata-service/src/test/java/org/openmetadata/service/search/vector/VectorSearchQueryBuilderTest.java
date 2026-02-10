package org.openmetadata.service.search.vector;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class VectorSearchQueryBuilderTest {

  @Test
  void testBasicKnnQuery() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, null);

    assertNotNull(query);
    assertTrue(query.contains("\"knn\""));
    assertTrue(query.contains("\"deleted\":false"));
    assertTrue(query.contains("\"excludes\":[\"embedding\"]"));
  }

  @Test
  void testKnnQueryWithEntityTypeFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("entityType", List.of("table"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertNotNull(query);
    assertTrue(query.contains("\"entityType\":\"table\""));
  }

  @Test
  void testKnnQueryWithMultipleEntityTypes() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("entityType", List.of("table", "topic"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"entityType\":[\"table\",\"topic\"]"));
  }

  @Test
  void testNestedTagFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("tags", List.of("PII.Sensitive"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"nested\""));
    assertTrue(query.contains("\"tags.tagFQN\""));
    assertTrue(query.contains("PII.Sensitive"));
  }

  @Test
  void testNestedOwnerFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("owners", List.of("admin"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"nested\""));
    assertTrue(query.contains("\"owners.name\""));
    assertTrue(query.contains("admin"));
  }

  @Test
  void testAnyMarkerFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("tags", List.of("__ANY__"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"exists\""));
    assertTrue(query.contains("\"tags.tagFQN\""));
  }

  @Test
  void testNoneMarkerFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("tags", List.of("__NONE__"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"must_not\""));
    assertTrue(query.contains("\"exists\""));
  }

  @Test
  void testFlatDomainFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("domains", List.of("engineering"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"domains.name\""));
    assertTrue(query.contains("engineering"));
  }

  @Test
  void testTierFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("tier", List.of("Tier.Tier1"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"tier.tagFQN\""));
    assertTrue(query.contains("Tier.Tier1"));
  }

  @Test
  void testCertificationFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("certification", List.of("Gold"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"certification.tagFQN\""));
    assertTrue(query.contains("Gold"));
  }

  @Test
  void testServiceTypeFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("serviceType", List.of("Snowflake"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"serviceType\""));
    assertTrue(query.contains("Snowflake"));
  }

  @Test
  void testCustomPropertyExactFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("department.name", List.of("finance"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"customProperties.department.name\""));
    assertTrue(query.contains("finance"));
    assertTrue(query.contains("\"term\""));
  }

  @Test
  void testCustomPropertyFuzzyFilter() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = Map.of("description_field", List.of("some text"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"customProperties.description_field\""));
    assertTrue(query.contains("\"fuzziness\":\"AUTO\""));
  }

  @Test
  void testMultipleFilters() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};
    Map<String, List<String>> filters = new HashMap<>();
    filters.put("entityType", List.of("table"));
    filters.put("tags", List.of("PII.Sensitive"));
    filters.put("owners", List.of("admin"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"entityType\""));
    assertTrue(query.contains("\"tags.tagFQN\""));
    assertTrue(query.contains("\"owners.name\""));
  }

  @Test
  void testEmptyFilters() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, Collections.emptyMap());

    assertNotNull(query);
    assertTrue(query.contains("\"deleted\":false"));
  }

  @Test
  void testNoEmbeddingInSourceExcludes() {
    float[] queryVector = new float[] {0.1f, 0.2f, 0.3f};

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, null);

    assertTrue(query.contains("\"_source\":{\"excludes\":[\"embedding\"]}"));
  }

  @Test
  void testAlwaysIncludesDeletedFalseFilter() {
    float[] queryVector = new float[] {0.1f};

    String query = VectorSearchQueryBuilder.build(queryVector, 5, 5, null);

    assertTrue(query.contains("\"deleted\":false"));
  }

  @Test
  void testEscapeSpecialCharacters() {
    String escaped = VectorSearchQueryBuilder.escape("hello \"world\"\nnewline");
    assertFalse(escaped.contains("\"world\""));
    assertTrue(escaped.contains("\\\"world\\\""));
    assertTrue(escaped.contains("\\n"));
  }

  @Test
  void testMixedSpecialValuesAndRegularValues() {
    float[] queryVector = new float[] {0.1f};
    Map<String, List<String>> filters = Map.of("entityType", List.of("table", "__ANY__"));

    String query = VectorSearchQueryBuilder.build(queryVector, 10, 10, filters);

    assertTrue(query.contains("\"should\""));
    assertTrue(query.contains("\"exists\""));
    assertTrue(query.contains("table"));
  }

  @Test
  void testEfficientKnnPreFilteringStructure() throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    float[] vector = {0.1f, 0.2f};
    int size = 10;
    int k = 100;
    Map<String, List<String>> filters = Map.of("entityType", List.of("table"));

    String query = VectorSearchQueryBuilder.build(vector, size, k, filters);

    JsonNode root = mapper.readTree(query);
    assertTrue(root.has("query"));
    JsonNode queryNode = root.get("query");

    assertTrue(queryNode.has("knn"));
    assertNotNull(queryNode.get("knn").get("embedding").get("filter"));

    JsonNode filter = queryNode.get("knn").get("embedding").get("filter");
    assertTrue(filter.has("bool"));
    assertTrue(filter.get("bool").has("must"));

    JsonNode mustFilters = filter.get("bool").get("must");
    assertEquals(2, mustFilters.size());
  }
}
