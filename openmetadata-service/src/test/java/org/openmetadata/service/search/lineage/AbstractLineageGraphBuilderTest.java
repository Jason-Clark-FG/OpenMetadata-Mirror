package org.openmetadata.service.search.lineage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.api.lineage.EntityCountLineageRequest;
import org.openmetadata.schema.api.lineage.EsLineageData;
import org.openmetadata.schema.api.lineage.RelationshipRef;
import org.openmetadata.schema.api.lineage.SearchLineageResult;
import org.openmetadata.schema.type.lineage.NodeInformation;

class AbstractLineageGraphBuilderTest {

  private TestableLineageGraphBuilder builder;

  private static final String ROOT_FQN = "svc.db.schema.root_table";

  @BeforeEach
  void setUp() {
    builder = new TestableLineageGraphBuilder();
  }

  // --- applyEntityCountPagination tests ---

  @Test
  void applyEntityCountPaginationReturnsNullForNullResult() {
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(10);

    SearchLineageResult result = builder.applyEntityCountPagination(null, request);

    assertNull(result);
  }

  @Test
  void applyEntityCountPaginationReturnsResultWithNullNodes() {
    SearchLineageResult input = new SearchLineageResult();
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(10);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertNull(result.getNodes());
  }

  @Test
  void applyEntityCountPaginationFiltersNodesByDepthLessThanOrEqual() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("svc.db.schema.depth1", nodeAtDepth(1));
    nodes.put("svc.db.schema.depth2", nodeAtDepth(2));
    nodes.put("svc.db.schema.depth3", nodeAtDepth(3));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(50).withNodeDepth(2);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    assertTrue(result.getNodes().containsKey("svc.db.schema.depth1"));
    assertTrue(result.getNodes().containsKey("svc.db.schema.depth2"));
    assertFalse(result.getNodes().containsKey("svc.db.schema.depth3"));
  }

  @Test
  void applyEntityCountPaginationUsesAbsoluteValueForNegativeDepth() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("svc.db.schema.upstream1", nodeAtDepth(-1));
    nodes.put("svc.db.schema.upstream2", nodeAtDepth(-2));
    nodes.put("svc.db.schema.upstream3", nodeAtDepth(-3));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest()
            .withFqn(ROOT_FQN)
            .withFrom(0)
            .withSize(50)
            .withNodeDepth(-2);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    assertTrue(result.getNodes().containsKey("svc.db.schema.upstream1"));
    assertTrue(result.getNodes().containsKey("svc.db.schema.upstream2"));
    assertFalse(result.getNodes().containsKey("svc.db.schema.upstream3"));
  }

  @Test
  void applyEntityCountPaginationAlwaysIncludesRootInDepthFilter() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("svc.db.schema.depth2", nodeAtDepth(2));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(50).withNodeDepth(1);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    assertFalse(result.getNodes().containsKey("svc.db.schema.depth2"));
  }

  @Test
  void applyEntityCountPaginationPaginatesWithFromAndSize() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("a_depth1", nodeAtDepth(1));
    nodes.put("b_depth1", nodeAtDepth(1));
    nodes.put("c_depth2", nodeAtDepth(2));
    nodes.put("d_depth2", nodeAtDepth(2));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(2);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    int nonRootNodes = result.getNodes().size() - 1;
    assertEquals(2, nonRootNodes);
  }

  @Test
  void applyEntityCountPaginationReturnsOnlyRootWhenFromExceedsSize() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("svc.db.schema.depth1", nodeAtDepth(1));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(100).withSize(10);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertEquals(1, result.getNodes().size());
    assertTrue(result.getNodes().containsKey(ROOT_FQN));
  }

  @Test
  void applyEntityCountPaginationDefaultsFromAndSizeWhenNull() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    for (int i = 0; i < 60; i++) {
      nodes.put("node_" + i, nodeAtDepth(1));
    }

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request = new EntityCountLineageRequest().withFqn(ROOT_FQN);
    request.setFrom(null);
    request.setSize(null);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    int nonRootNodes = result.getNodes().size() - 1;
    assertEquals(50, nonRootNodes);
  }

  @Test
  void applyEntityCountPaginationSortsByDepthThenName() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("z_depth1", nodeAtDepth(1));
    nodes.put("a_depth2", nodeAtDepth(2));
    nodes.put("a_depth1", nodeAtDepth(1));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(2);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    assertTrue(result.getNodes().containsKey("a_depth1"));
    assertTrue(result.getNodes().containsKey("z_depth1"));
    assertFalse(result.getNodes().containsKey("a_depth2"));
  }

  @Test
  void applyEntityCountPaginationFiltersEdgesToMatchNodes() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("included_node", nodeAtDepth(1));
    nodes.put("excluded_node", nodeAtDepth(2));

    Map<String, EsLineageData> upstreamEdges = new HashMap<>();
    upstreamEdges.put("edge1", edge(ROOT_FQN, "included_node"));
    upstreamEdges.put("edge2", edge("included_node", "excluded_node"));

    Map<String, EsLineageData> downstreamEdges = new HashMap<>();
    downstreamEdges.put("edge3", edge(ROOT_FQN, "included_node"));
    downstreamEdges.put("edge4", edge("included_node", "excluded_node"));

    SearchLineageResult input = new SearchLineageResult();
    input.setNodes(nodes);
    input.setUpstreamEdges(upstreamEdges);
    input.setDownstreamEdges(downstreamEdges);

    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(1);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertNotNull(result.getUpstreamEdges());
    assertTrue(result.getUpstreamEdges().containsKey("edge1"));
    assertFalse(result.getUpstreamEdges().containsKey("edge2"));

    assertNotNull(result.getDownstreamEdges());
    assertTrue(result.getDownstreamEdges().containsKey("edge3"));
    assertFalse(result.getDownstreamEdges().containsKey("edge4"));
  }

  @Test
  void applyEntityCountPaginationHandlesNodeWithNullDepth() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put(
        "null_depth_node",
        new NodeInformation().withEntity(Map.of("fullyQualifiedName", "null_depth_node")));

    SearchLineageResult input = resultWithNodes(nodes);
    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(50).withNodeDepth(1);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getNodes().containsKey(ROOT_FQN));
    assertTrue(result.getNodes().containsKey("null_depth_node"));
  }

  @Test
  void applyEntityCountPaginationDepthFilterWithEdges() {
    Map<String, NodeInformation> nodes = new HashMap<>();
    nodes.put(ROOT_FQN, nodeAtDepth(0));
    nodes.put("depth1", nodeAtDepth(1));
    nodes.put("depth2", nodeAtDepth(2));

    Map<String, EsLineageData> upstream = new HashMap<>();
    upstream.put("e1", edge(ROOT_FQN, "depth1"));
    upstream.put("e2", edge("depth1", "depth2"));

    SearchLineageResult input = new SearchLineageResult();
    input.setNodes(nodes);
    input.setUpstreamEdges(upstream);
    input.setDownstreamEdges(new HashMap<>());

    EntityCountLineageRequest request =
        new EntityCountLineageRequest().withFqn(ROOT_FQN).withFrom(0).withSize(50).withNodeDepth(1);

    SearchLineageResult result = builder.applyEntityCountPagination(input, request);

    assertTrue(result.getUpstreamEdges().containsKey("e1"));
    assertFalse(result.getUpstreamEdges().containsKey("e2"));
  }

  // --- matchesNodeFilter tests ---

  @Test
  void matchesNodeFilterReturnsFalseForNullNode() {
    assertFalse(builder.matchesNodeFilter(null, "{\"term\": {\"tags.tagFQN.keyword\": \"PII\"}}"));
  }

  @Test
  void matchesNodeFilterReturnsFalseForNullEntity() {
    NodeInformation node = new NodeInformation();
    assertFalse(builder.matchesNodeFilter(node, "{\"term\": {\"tags.tagFQN.keyword\": \"PII\"}}"));
  }

  @Test
  void matchesNodeFilterReturnsFalseForEmptyQueryFilter() {
    NodeInformation node =
        new NodeInformation()
            .withEntity(Map.of("name", "test", "tags", List.of(Map.of("tagFQN", "PII"))));
    assertFalse(builder.matchesNodeFilter(node, ""));
    assertFalse(builder.matchesNodeFilter(node, null));
  }

  @Test
  void matchesNodeFilterMatchesTermQuery() {
    NodeInformation node =
        new NodeInformation()
            .withEntity(
                Map.of("tags", List.of(Map.of("tagFQN", "PII.Sensitive")), "name", "customers"));

    assertTrue(
        builder.matchesNodeFilter(
            node, "{\"term\": {\"tags.tagFQN.keyword\": \"PII.Sensitive\"}}"));
    assertFalse(
        builder.matchesNodeFilter(node, "{\"term\": {\"tags.tagFQN.keyword\": \"NonExistent\"}}"));
  }

  @Test
  void matchesNodeFilterMatchesQueryString() {
    NodeInformation node =
        new NodeInformation()
            .withEntity(Map.of("description", "Monthly sales report for finance team"));

    assertTrue(builder.matchesNodeFilter(node, "description:sales"));
    assertFalse(builder.matchesNodeFilter(node, "description:marketing"));
  }

  // --- Helper methods ---

  private NodeInformation nodeAtDepth(int depth) {
    return new NodeInformation()
        .withEntity(Map.of("fullyQualifiedName", "entity_" + depth))
        .withNodeDepth(depth);
  }

  private SearchLineageResult resultWithNodes(Map<String, NodeInformation> nodes) {
    SearchLineageResult result = new SearchLineageResult();
    result.setNodes(nodes);
    result.setUpstreamEdges(new HashMap<>());
    result.setDownstreamEdges(new HashMap<>());
    return result;
  }

  private EsLineageData edge(String fromFqn, String toFqn) {
    EsLineageData edgeData = new EsLineageData();
    edgeData.setFromEntity(
        new RelationshipRef().withId(UUID.randomUUID()).withFullyQualifiedName(fromFqn));
    edgeData.setToEntity(
        new RelationshipRef().withId(UUID.randomUUID()).withFullyQualifiedName(toFqn));
    return edgeData;
  }

  private static class TestableLineageGraphBuilder extends AbstractLineageGraphBuilder {

    TestableLineageGraphBuilder() {
      super();
    }

    @Override
    public int estimateGraphSize(LineageQueryContext context) throws IOException {
      return 0;
    }

    @Override
    public SearchLineageResult executeInMemory(LineageQueryContext context, int batchSize)
        throws IOException {
      return new SearchLineageResult();
    }

    @Override
    public SearchLineageResult executeWithScroll(LineageQueryContext context, int batchSize)
        throws IOException {
      return new SearchLineageResult();
    }
  }
}
