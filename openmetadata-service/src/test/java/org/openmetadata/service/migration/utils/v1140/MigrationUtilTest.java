package org.openmetadata.service.migration.utils.v1140;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.governance.workflows.WorkflowDefinition;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.EntityDAO;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.WorkflowDefinitionRepository;
import org.openmetadata.service.util.EntityUtil;

class MigrationUtilTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  // ─── migrateWorkflowJson ───────────────────────────────────────────────

  @Test
  void migrateWorkflowJson_returnsSameInstanceWhenTriggerAlreadyHasEntityList() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {
            "output": ["entityList", "relatedEntity", "updatedBy"]
          },
          "nodes": []
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);
    assertSame(root, result, "Should return the same instance when no changes needed");
  }

  @Test
  void migrateWorkflowJson_addsEntityListFirstWhenMissingFromTrigger() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {
            "output": ["relatedEntity", "updatedBy"]
          },
          "nodes": []
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    assertFalse(result == root, "Should return a new instance when changes are needed");
    JsonNode output = result.get("trigger").get("output");
    assertEquals("entityList", output.get(0).asText());
    assertEquals("relatedEntity", output.get(1).asText());
    assertEquals("updatedBy", output.get(2).asText());
    assertEquals(3, output.size());
  }

  @Test
  void migrateWorkflowJson_handlesNoTriggerNode() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "nodes": []
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);
    assertSame(root, result);
  }

  @Test
  void migrateWorkflowJson_handlesNullRoot() throws Exception {
    JsonNode result = MigrationUtil.migrateWorkflowJson(null);
    assertNull(result);
  }

  @Test
  void migrateWorkflowJson_handlesTriggerWithNoOutputArray() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {
            "type": "manual"
          },
          "nodes": []
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);
    assertSame(root, result);
  }

  @Test
  void migrateWorkflowJson_migratesBatchNodeNamespaceMap() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {
            "output": ["entityList"]
          },
          "nodes": [
            {
              "type": "automatedTask",
              "subType": "setEntityAttributeTask",
              "name": "MyTask",
              "inputNamespaceMap": {
                "relatedEntity": "global"
              }
            }
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    assertFalse(result == root);
    JsonNode node = result.get("nodes").get(0);
    JsonNode nsMap = node.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"));
    assertFalse(nsMap.has("relatedEntity"));
    assertEquals("global", nsMap.get("entityList").asText());
  }

  @Test
  void migrateWorkflowJson_preservesUpdatedByWhenMigratingRelatedEntity() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {"output": ["entityList"]},
          "nodes": [
            {
              "type": "automatedTask",
              "subType": "setEntityAttributeTask",
              "name": "SetApproved",
              "inputNamespaceMap": {
                "relatedEntity": "global",
                "updatedBy": "ApprovalForUpdates"
              }
            }
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    JsonNode nsMap = result.get("nodes").get(0).get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"), "entityList should be added");
    assertFalse(nsMap.has("relatedEntity"), "relatedEntity should be removed");
    assertEquals("global", nsMap.get("entityList").asText());
    assertTrue(nsMap.has("updatedBy"), "updatedBy should be preserved");
    assertEquals("ApprovalForUpdates", nsMap.get("updatedBy").asText());
  }

  @Test
  void migrateWorkflowJson_skipsNonBatchNodes() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {
            "output": ["entityList"]
          },
          "nodes": [
            {
              "type": "userTask",
              "subType": "userApprovalTask",
              "name": "ApproveIt",
              "inputNamespaceMap": {
                "relatedEntity": "global"
              }
            }
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    assertSame(root, result);
    JsonNode nsMap = result.get("nodes").get(0).get("inputNamespaceMap");
    assertTrue(nsMap.has("relatedEntity"), "Non-batch node should not be migrated");
    assertFalse(nsMap.has("entityList"));
  }

  @Test
  void migrateWorkflowJson_migratesAllBatchNodeSubtypes() throws Exception {
    String[] subtypes = {
      "checkEntityAttributesTask",
      "checkChangeDescriptionTask",
      "setEntityAttributeTask",
      "rollbackEntityTask",
      "sinkTask",
      "dataCompletenessTask"
    };

    for (String subtype : subtypes) {
      String json =
          String.format(
              """
              {
                "id": "00000000-0000-0000-0000-000000000001",
                "fullyQualifiedName": "wf",
                "trigger": {"output": ["entityList"]},
                "nodes": [
                  {
                    "type": "automatedTask",
                    "subType": "%s",
                    "name": "node1",
                    "inputNamespaceMap": {"relatedEntity": "global"}
                  }
                ]
              }
              """,
              subtype);
      JsonNode root = MAPPER.readTree(json);
      JsonNode result = MigrationUtil.migrateWorkflowJson(root);

      JsonNode nsMap = result.get("nodes").get(0).get("inputNamespaceMap");
      assertTrue(nsMap.has("entityList"), "Expected entityList for subtype: " + subtype);
      assertFalse(nsMap.has("relatedEntity"), "Expected no relatedEntity for subtype: " + subtype);
    }
  }

  @Test
  void migrateWorkflowJson_migratesInputArrayRelatedEntityToo() throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {"output": ["entityList"]},
          "nodes": [
            {
              "type": "automatedTask",
              "subType": "setEntityAttributeTask",
              "name": "n1",
              "inputNamespaceMap": {"entityList": "global"},
              "input": ["relatedEntity", "updatedBy"]
            }
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    JsonNode input = result.get("nodes").get(0).get("input");
    assertEquals("entityList", input.get(0).asText());
    assertEquals("updatedBy", input.get(1).asText());
    assertEquals(2, input.size());
  }

  @Test
  void migrateWorkflowJson_assignsTrueEntityListToNodeDownstreamOfCheckNodeOnTrueEdge()
      throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {"output": ["entityList"]},
          "nodes": [
            {
              "type": "automatedTask",
              "subType": "checkEntityAttributesTask",
              "name": "CheckOwner",
              "inputNamespaceMap": {"entityList": "global"}
            },
            {
              "type": "automatedTask",
              "subType": "setEntityAttributeTask",
              "name": "SetGold",
              "inputNamespaceMap": {"relatedEntity": "global"}
            }
          ],
          "edges": [
            {"from": "CheckOwner", "to": "SetGold", "condition": "true"}
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    JsonNode nsMap = result.get("nodes").get(1).get("inputNamespaceMap");
    assertTrue(nsMap.has("true_entityList"), "Should have true_entityList key");
    assertEquals("CheckOwner", nsMap.get("true_entityList").asText());
    assertFalse(nsMap.has("entityList"), "Should not have plain entityList");
    assertFalse(nsMap.has("relatedEntity"), "relatedEntity should be removed");
  }

  @Test
  void migrateWorkflowJson_assignsFalseEntityListToNodeDownstreamOfCheckNodeOnFalseEdge()
      throws Exception {
    String json =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "workflow1",
          "trigger": {"output": ["entityList"]},
          "nodes": [
            {
              "type": "automatedTask",
              "subType": "checkEntityAttributesTask",
              "name": "CheckOwner",
              "inputNamespaceMap": {"entityList": "global"}
            },
            {
              "type": "automatedTask",
              "subType": "setEntityAttributeTask",
              "name": "SetNone",
              "inputNamespaceMap": {"relatedEntity": "global"}
            }
          ],
          "edges": [
            {"from": "CheckOwner", "to": "SetNone", "condition": "false"}
          ]
        }
        """;
    JsonNode root = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateWorkflowJson(root);

    JsonNode nsMap = result.get("nodes").get(1).get("inputNamespaceMap");
    assertTrue(nsMap.has("false_entityList"), "Should have false_entityList key");
    assertEquals("CheckOwner", nsMap.get("false_entityList").asText());
    assertFalse(nsMap.has("relatedEntity"));
  }

  // ─── addEntityListToNamespaceMap ──────────────────────────────────────

  @Test
  void addEntityListToNamespaceMap_returnsSameWhenAlreadyHasEntityListNoRelatedEntity()
      throws Exception {
    String json =
        """
        {
          "name": "node",
          "inputNamespaceMap": {
            "entityList": "global",
            "updatedBy": "global"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());
    assertSame(node, result);
  }

  @Test
  void addEntityListToNamespaceMap_replacesRelatedEntityWithEntityListGlobal() throws Exception {
    String json =
        """
        {
          "name": "node",
          "inputNamespaceMap": {
            "relatedEntity": "myNamespace"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"));
    assertFalse(nsMap.has("relatedEntity"));
    assertEquals("global", nsMap.get("entityList").asText());
  }

  @Test
  void addEntityListToNamespaceMap_removesRelatedEntityWhenBothPresent() throws Exception {
    String json =
        """
        {
          "name": "node",
          "inputNamespaceMap": {
            "entityList": "global",
            "relatedEntity": "myNamespace",
            "updatedBy": "approvalNode"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"), "entityList should be preserved");
    assertFalse(nsMap.has("relatedEntity"), "relatedEntity should be removed");
    assertEquals("global", nsMap.get("entityList").asText(), "original entityList value kept");
    assertEquals("approvalNode", nsMap.get("updatedBy").asText(), "updatedBy preserved");
  }

  @Test
  void addEntityListToNamespaceMap_preservesUpdatedByWhenOnlyRelatedEntityPresent()
      throws Exception {
    String json =
        """
        {
          "name": "node",
          "inputNamespaceMap": {
            "relatedEntity": "global",
            "updatedBy": "ApprovalForUpdates"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"), "entityList should be added");
    assertFalse(nsMap.has("relatedEntity"), "relatedEntity should be removed");
    assertEquals("global", nsMap.get("entityList").asText());
    assertTrue(nsMap.has("updatedBy"), "updatedBy should be preserved");
    assertEquals("ApprovalForUpdates", nsMap.get("updatedBy").asText());
  }

  @Test
  void addEntityListToNamespaceMap_doesNotOverwriteEntityListWhenIncomingEdgesFromCheckNode()
      throws Exception {
    String json =
        """
        {
          "name": "SetField",
          "inputNamespaceMap": {
            "entityList": "global",
            "relatedEntity": "legacy",
            "updatedBy": "approvalNode"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    List<String[]> incoming = Collections.singletonList(new String[] {"CheckOwner", "true"});
    Map<String, String> nodeSubType = Map.of("CheckOwner", "checkEntityAttributesTask");
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, incoming, nodeSubType);

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"), "existing entityList should be preserved");
    assertEquals("global", nsMap.get("entityList").asText(), "entityList value must not change");
    assertFalse(
        nsMap.has("true_entityList"), "must not add conditional key when entityList exists");
    assertFalse(nsMap.has("relatedEntity"), "relatedEntity should be removed");
    assertEquals("approvalNode", nsMap.get("updatedBy").asText(), "updatedBy preserved");
  }

  @Test
  void addEntityListToNamespaceMap_usesGlobalWhenNoRelatedEntityPresent() throws Exception {
    String json =
        """
        {
          "name": "node",
          "inputNamespaceMap": {
            "updatedBy": "someNode"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"));
    assertEquals("global", nsMap.get("entityList").asText());
    assertFalse(nsMap.has("relatedEntity"));
  }

  @Test
  void addEntityListToNamespaceMap_setsTrueEntityListFromCheckNodeOnTrueCondition()
      throws Exception {
    String json =
        """
        {
          "name": "SetGold",
          "inputNamespaceMap": {
            "relatedEntity": "global"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    List<String[]> incoming = Collections.singletonList(new String[] {"CheckOwner", "true"});
    Map<String, String> nodeSubType = Map.of("CheckOwner", "checkEntityAttributesTask");
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, incoming, nodeSubType);

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("true_entityList"));
    assertEquals("CheckOwner", nsMap.get("true_entityList").asText());
    assertFalse(nsMap.has("entityList"));
    assertFalse(nsMap.has("relatedEntity"));
  }

  @Test
  void addEntityListToNamespaceMap_setsFalseEntityListFromCheckNodeOnFalseCondition()
      throws Exception {
    String json =
        """
        {
          "name": "SetNone",
          "inputNamespaceMap": {
            "relatedEntity": "global"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    List<String[]> incoming = Collections.singletonList(new String[] {"CheckOwner", "false"});
    Map<String, String> nodeSubType = Map.of("CheckOwner", "checkEntityAttributesTask");
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, incoming, nodeSubType);

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("false_entityList"));
    assertEquals("CheckOwner", nsMap.get("false_entityList").asText());
    assertFalse(nsMap.has("relatedEntity"));
  }

  @Test
  void addEntityListToNamespaceMap_setsBandEntityListFromDataCompletenessNode() throws Exception {
    String json =
        """
        {
          "name": "SetGoldCert",
          "inputNamespaceMap": {
            "relatedEntity": "global"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    List<String[]> incoming =
        Collections.singletonList(new String[] {"DataCompletenessNode", "gold"});
    Map<String, String> nodeSubType = Map.of("DataCompletenessNode", "dataCompletenessTask");
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, incoming, nodeSubType);

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("gold_entityList"));
    assertEquals("DataCompletenessNode", nsMap.get("gold_entityList").asText());
    assertFalse(nsMap.has("relatedEntity"));
  }

  @Test
  void addEntityListToNamespaceMap_usesGlobalWhenSourceIsNonCheckNode() throws Exception {
    String json =
        """
        {
          "name": "SetField",
          "inputNamespaceMap": {
            "relatedEntity": "global"
          }
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    List<String[]> incoming = Collections.singletonList(new String[] {"StartEvent", null});
    Map<String, String> nodeSubType = Map.of("StartEvent", "startEvent");
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, incoming, nodeSubType);

    JsonNode nsMap = result.get("inputNamespaceMap");
    assertTrue(nsMap.has("entityList"));
    assertEquals("global", nsMap.get("entityList").asText());
    assertFalse(nsMap.has("relatedEntity"));
  }

  @Test
  void addEntityListToNamespaceMap_returnsSameWhenNoInputNamespaceMap() throws Exception {
    String json = """
        {"name": "node"}
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.addEntityListToNamespaceMap(node, null, Map.of());
    assertSame(node, result);
  }

  // ─── migrateInputArray ────────────────────────────────────────────────

  @Test
  void migrateInputArray_replacesRelatedEntityWithEntityList() throws Exception {
    String json =
        """
        {
          "name": "node",
          "input": ["relatedEntity", "updatedBy"]
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateInputArray(node);

    JsonNode input = result.get("input");
    assertEquals(2, input.size());
    assertEquals("entityList", input.get(0).asText());
    assertEquals("updatedBy", input.get(1).asText());
  }

  @Test
  void migrateInputArray_deduplicatesMultipleRelatedEntityOccurrences() throws Exception {
    String json =
        """
        {
          "name": "node",
          "input": ["relatedEntity", "relatedEntity", "updatedBy"]
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateInputArray(node);

    JsonNode input = result.get("input");
    assertEquals(2, input.size());
    assertEquals("entityList", input.get(0).asText());
    assertEquals("updatedBy", input.get(1).asText());
  }

  @Test
  void migrateInputArray_returnsSameWhenNoRelatedEntity() throws Exception {
    String json =
        """
        {
          "name": "node",
          "input": ["entityList", "updatedBy"]
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateInputArray(node);
    assertSame(node, result);
  }

  @Test
  void migrateInputArray_returnsSameWhenNoInputArray() throws Exception {
    String json = """
        {"name": "node"}
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateInputArray(node);
    assertSame(node, result);
  }

  @Test
  void migrateInputArray_returnsSameWhenInputIsNotArray() throws Exception {
    String json =
        """
        {
          "name": "node",
          "input": "relatedEntity"
        }
        """;
    JsonNode node = MAPPER.readTree(json);
    JsonNode result = MigrationUtil.migrateInputArray(node);
    assertSame(node, result);
  }

  // ─── migrateWorkflowInputNamespaceMap (public, uses Entity) ──────────

  @Test
  @SuppressWarnings("unchecked")
  void migrateWorkflowInputNamespaceMap_phase2LoadsAllWorkflowsAfterPhase1() throws Exception {
    WorkflowDefinitionRepository repository = mock(WorkflowDefinitionRepository.class);
    EntityDAO<WorkflowDefinition> mockDao = mock(EntityDAO.class);

    WorkflowDefinition wf1 = buildMinimalWorkflowDefinition("wf1");
    WorkflowDefinition wf2 = buildMinimalWorkflowDefinition("wf2");

    when(repository.getDao()).thenReturn(mockDao);
    when(mockDao.listAfterWithOffset(anyInt(), anyInt())).thenReturn(List.of());
    when(repository.listAll(eq(EntityUtil.Fields.EMPTY_FIELDS), any(ListFilter.class)))
        .thenReturn(List.of(wf1, wf2));

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION))
          .thenReturn(repository);

      MigrationUtil.migrateWorkflowInputNamespaceMap();
    }

    verify(repository).listAll(eq(EntityUtil.Fields.EMPTY_FIELDS), any(ListFilter.class));
  }

  @Test
  @SuppressWarnings("unchecked")
  void migrateWorkflowInputNamespaceMap_updatesRawJsonWhenEntityListMissing() throws Exception {
    WorkflowDefinitionRepository repository = mock(WorkflowDefinitionRepository.class);
    EntityDAO<WorkflowDefinition> mockDao = mock(EntityDAO.class);

    UUID workflowId = UUID.fromString("00000000-0000-0000-0000-000000000001");
    String rawJsonNeedsMigration =
        String.format(
            """
            {
              "id": "%s",
              "fullyQualifiedName": "wf1",
              "trigger": {"output": ["relatedEntity", "updatedBy"]},
              "nodes": []
            }
            """,
            workflowId);

    when(repository.getDao()).thenReturn(mockDao);
    when(mockDao.listAfterWithOffset(anyInt(), eq(0))).thenReturn(List.of(rawJsonNeedsMigration));
    when(mockDao.listAfterWithOffset(anyInt(), eq(100))).thenReturn(List.of());
    doNothing().when(mockDao).update(eq(workflowId), eq("wf1"), anyString());
    when(repository.listAll(any(), any())).thenReturn(List.of());

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION))
          .thenReturn(repository);

      MigrationUtil.migrateWorkflowInputNamespaceMap();
    }

    verify(mockDao).update(eq(workflowId), eq("wf1"), anyString());
  }

  @Test
  @SuppressWarnings("unchecked")
  void migrateWorkflowInputNamespaceMap_handlesInvalidJsonGracefully() throws Exception {
    WorkflowDefinitionRepository repository = mock(WorkflowDefinitionRepository.class);
    EntityDAO<WorkflowDefinition> mockDao = mock(EntityDAO.class);

    when(repository.getDao()).thenReturn(mockDao);
    when(mockDao.listAfterWithOffset(anyInt(), anyInt()))
        .thenReturn(List.of("{invalid-json}"))
        .thenReturn(List.of());
    when(repository.listAll(any(), any())).thenReturn(List.of());

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION))
          .thenReturn(repository);

      MigrationUtil.migrateWorkflowInputNamespaceMap();
    }

    verify(mockDao, never()).update(any(UUID.class), anyString(), anyString());
  }

  @Test
  @SuppressWarnings("unchecked")
  void migrateWorkflowInputNamespaceMap_handlesRedeployExceptionGracefully() throws Exception {
    WorkflowDefinitionRepository repository = mock(WorkflowDefinitionRepository.class);
    EntityDAO<WorkflowDefinition> mockDao = mock(EntityDAO.class);
    WorkflowDefinition failingWorkflow = buildMinimalWorkflowDefinition("wf-fail");

    when(repository.getDao()).thenReturn(mockDao);
    when(mockDao.listAfterWithOffset(anyInt(), anyInt())).thenReturn(List.of());
    when(repository.listAll(any(), any())).thenReturn(List.of(failingWorkflow));

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION))
          .thenReturn(repository);

      MigrationUtil.migrateWorkflowInputNamespaceMap();
    }
  }

  @Test
  @SuppressWarnings("unchecked")
  void migrateWorkflowInputNamespaceMap_skipsUpdateWhenJsonUnchanged() throws Exception {
    WorkflowDefinitionRepository repository = mock(WorkflowDefinitionRepository.class);
    EntityDAO<WorkflowDefinition> mockDao = mock(EntityDAO.class);

    String alreadyMigratedJson =
        """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "fullyQualifiedName": "wf1",
          "trigger": {"output": ["entityList", "relatedEntity"]},
          "nodes": []
        }
        """;

    when(repository.getDao()).thenReturn(mockDao);
    when(mockDao.listAfterWithOffset(anyInt(), eq(0))).thenReturn(List.of(alreadyMigratedJson));
    when(mockDao.listAfterWithOffset(anyInt(), eq(100))).thenReturn(List.of());
    when(repository.listAll(any(), any())).thenReturn(List.of());

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityRepository(Entity.WORKFLOW_DEFINITION))
          .thenReturn(repository);

      MigrationUtil.migrateWorkflowInputNamespaceMap();
    }

    verify(mockDao, never()).update(any(UUID.class), anyString(), anyString());
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private static WorkflowDefinition buildMinimalWorkflowDefinition(String name) {
    WorkflowDefinition wf = new WorkflowDefinition();
    wf.setName(name);
    wf.setFullyQualifiedName(name);
    return wf;
  }
}
