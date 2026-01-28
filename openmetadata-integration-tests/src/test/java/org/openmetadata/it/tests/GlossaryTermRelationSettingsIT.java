package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.factories.GlossaryTermTestFactory;
import org.openmetadata.it.factories.GlossaryTestFactory;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.entity.data.Glossary;
import org.openmetadata.schema.entity.data.GlossaryTerm;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Integration tests for Glossary Term Relation Settings migration.
 *
 * <p>Verifies that the 2.0.0 migration properly creates default glossary term relation settings,
 * and that delete protection works correctly for relation types that are in use.
 */
@Execution(ExecutionMode.CONCURRENT)
@ExtendWith(TestNamespaceExtension.class)
public class GlossaryTermRelationSettingsIT {

  private static final Logger LOG = LoggerFactory.getLogger(GlossaryTermRelationSettingsIT.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final HttpClient HTTP_CLIENT =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

  @Test
  void test_glossaryTermRelationSettingsExist() throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    String settingsJson =
        client
            .getHttpClient()
            .executeForString(
                HttpMethod.GET,
                "/v1/system/settings/glossaryTermRelationSettings",
                null,
                RequestOptions.builder().build());

    System.out.println("Response body: " + settingsJson);

    assertNotNull(settingsJson, "Settings response should not be null");
    assertFalse(settingsJson.isEmpty(), "Settings response should not be empty");

    JsonNode settings = MAPPER.readTree(settingsJson);
    assertNotNull(settings, "Settings JSON should be parseable");

    assertEquals(
        "glossaryTermRelationSettings",
        settings.get("config_type").asText(),
        "Config type should be glossaryTermRelationSettings");

    JsonNode configValue = settings.get("config_value");
    assertNotNull(configValue, "Config value should not be null");

    JsonNode relationTypes = configValue.get("relationTypes");
    assertNotNull(relationTypes, "relationTypes should not be null");
    assertTrue(relationTypes.isArray(), "relationTypes should be an array");
    assertFalse(relationTypes.isEmpty(), "relationTypes should not be empty");

    System.out.println("Found " + relationTypes.size() + " relation types");

    boolean hasRelatedTo = false;
    boolean hasSynonym = false;
    boolean hasBroader = false;

    for (JsonNode relationType : relationTypes) {
      String name = relationType.get("name").asText();
      System.out.println("  - " + name + ": " + relationType.get("displayName").asText());

      if ("relatedTo".equals(name)) hasRelatedTo = true;
      if ("synonym".equals(name)) hasSynonym = true;
      if ("broader".equals(name)) hasBroader = true;

      assertNotNull(relationType.get("displayName"), "displayName should exist for " + name);
      assertNotNull(relationType.get("category"), "category should exist for " + name);
      assertNotNull(relationType.get("isSymmetric"), "isSymmetric should exist for " + name);
      assertNotNull(relationType.get("isTransitive"), "isTransitive should exist for " + name);
    }

    assertTrue(hasRelatedTo, "Should have 'relatedTo' relation type");
    assertTrue(hasSynonym, "Should have 'synonym' relation type");
    assertTrue(hasBroader, "Should have 'broader' relation type");
  }

  @Test
  void test_relationTypesHaveColors() throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();

    String settingsJson =
        client
            .getHttpClient()
            .executeForString(
                HttpMethod.GET,
                "/v1/system/settings/glossaryTermRelationSettings",
                null,
                RequestOptions.builder().build());

    assertNotNull(settingsJson, "Settings response should not be null");
    assertFalse(settingsJson.isEmpty(), "Settings response should not be empty");

    JsonNode settings = MAPPER.readTree(settingsJson);
    JsonNode relationTypes = settings.get("config_value").get("relationTypes");

    for (JsonNode relationType : relationTypes) {
      String name = relationType.get("name").asText();
      JsonNode colorNode = relationType.get("color");
      assertNotNull(colorNode, "color should exist for " + name);

      String color = colorNode.asText();
      assertTrue(
          color.matches("^#[0-9a-fA-F]{6}$"),
          "color should be a valid hex color for " + name + ", got: " + color);
    }
  }

  @Test
  void test_usageCountsApiReturnsValidData() throws Exception {
    String baseUrl = SdkClients.getServerUrl();
    String token = SdkClients.getAdminToken();

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/glossaryTerms/relationTypes/usage"))
            .header("Authorization", "Bearer " + token)
            .header("Accept", "application/json")
            .timeout(Duration.ofSeconds(30))
            .GET()
            .build();

    HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

    assertEquals(200, response.statusCode(), "Usage counts API should return 200");
    assertNotNull(response.body(), "Response body should not be null");

    @SuppressWarnings("unchecked")
    Map<String, Integer> usageCounts =
        MAPPER.readValue(
            response.body(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Integer>>() {});
    assertNotNull(usageCounts, "Usage counts should be parseable");
    LOG.info("Usage counts: {}", usageCounts);
  }

  @Test
  void test_deleteRelationTypeProtection(TestNamespace ns) throws Exception {
    String customTypeName = "testCustomType" + System.currentTimeMillis();

    JsonNode currentSettings = getSettings();
    ArrayNode relationTypes = (ArrayNode) currentSettings.get("config_value").get("relationTypes");

    ObjectNode newType = MAPPER.createObjectNode();
    newType.put("name", customTypeName);
    newType.put("displayName", "Test Custom Type");
    newType.put("description", "A test custom relation type for delete protection testing");
    newType.put("isSymmetric", true);
    newType.put("isTransitive", false);
    newType.put("isCrossGlossaryAllowed", true);
    newType.put("category", "associative");
    newType.put("isSystemDefined", false);
    newType.put("color", "#ff5733");
    relationTypes.add(newType);

    ObjectNode newSettings = MAPPER.createObjectNode();
    newSettings.set("relationTypes", relationTypes);
    updateSettings(newSettings);
    LOG.info("Created custom relation type: {}", customTypeName);

    Glossary glossary = GlossaryTestFactory.createSimple(ns);
    GlossaryTerm term1 = GlossaryTermTestFactory.createWithName(ns, glossary, "termA");
    GlossaryTerm term2 = GlossaryTermTestFactory.createWithName(ns, glossary, "termB");

    GlossaryTerm updatedTerm =
        addTermRelation(term1.getId().toString(), term2.getId().toString(), customTypeName);
    assertNotNull(updatedTerm, "Should successfully add relation with custom type");
    LOG.info(
        "Created relation between {} and {} with type {}",
        term1.getName(),
        term2.getName(),
        customTypeName);

    JsonNode settingsWithRelationInUse = getSettings();
    ArrayNode typesWithRelationInUse =
        (ArrayNode) settingsWithRelationInUse.get("config_value").get("relationTypes");

    ArrayNode typesWithoutCustom = MAPPER.createArrayNode();
    for (JsonNode type : typesWithRelationInUse) {
      if (!customTypeName.equals(type.get("name").asText())) {
        typesWithoutCustom.add(type);
      }
    }

    ObjectNode settingsWithoutCustomType = MAPPER.createObjectNode();
    settingsWithoutCustomType.set("relationTypes", typesWithoutCustom);

    int deleteStatusCode = updateSettingsAndGetStatus(settingsWithoutCustomType);
    LOG.info("Delete attempt status code: {}", deleteStatusCode);

    assertTrue(
        deleteStatusCode >= 400,
        "Delete should fail when relation type is in use. Got status: " + deleteStatusCode);

    removeTermRelation(term1.getId().toString(), term2.getId().toString(), customTypeName);
    removeTermRelation(term2.getId().toString(), term1.getId().toString(), customTypeName);
    LOG.info(
        "Removed relation between {} and {} (both directions)", term1.getName(), term2.getName());

    int deleteAfterRemovalStatusCode = updateSettingsAndGetStatus(settingsWithoutCustomType);
    LOG.info("Delete after removal status code: {}", deleteAfterRemovalStatusCode);

    assertEquals(
        200, deleteAfterRemovalStatusCode, "Delete should succeed after relations are removed");

    JsonNode finalSettings = getSettings();
    ArrayNode finalTypes = (ArrayNode) finalSettings.get("config_value").get("relationTypes");
    boolean customTypeExists = false;
    for (JsonNode type : finalTypes) {
      if (customTypeName.equals(type.get("name").asText())) {
        customTypeExists = true;
        break;
      }
    }
    assertFalse(customTypeExists, "Custom type should be deleted from settings");
    LOG.info("Successfully verified delete protection for relation type: {}", customTypeName);
  }

  private JsonNode getSettings() throws Exception {
    OpenMetadataClient client = SdkClients.adminClient();
    String settingsJson =
        client
            .getHttpClient()
            .executeForString(
                HttpMethod.GET,
                "/v1/system/settings/glossaryTermRelationSettings",
                null,
                RequestOptions.builder().build());
    return MAPPER.readTree(settingsJson);
  }

  private void updateSettings(ObjectNode settings) throws Exception {
    String baseUrl = SdkClients.getServerUrl();
    String token = SdkClients.getAdminToken();

    ObjectNode payload = MAPPER.createObjectNode();
    payload.put("config_type", "glossaryTermRelationSettings");
    payload.set("config_value", settings);

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/system/settings"))
            .header("Authorization", "Bearer " + token)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(30))
            .PUT(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(payload)))
            .build();

    HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() != 200) {
      throw new RuntimeException(
          "Failed to update settings: status="
              + response.statusCode()
              + ", body="
              + response.body());
    }
  }

  private int updateSettingsAndGetStatus(ObjectNode settings) throws Exception {
    String baseUrl = SdkClients.getServerUrl();
    String token = SdkClients.getAdminToken();

    ObjectNode payload = MAPPER.createObjectNode();
    payload.put("config_type", "glossaryTermRelationSettings");
    payload.set("config_value", settings);

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/system/settings"))
            .header("Authorization", "Bearer " + token)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(30))
            .PUT(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(payload)))
            .build();

    HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
    return response.statusCode();
  }

  private GlossaryTerm addTermRelation(String fromTermId, String toTermId, String relationType)
      throws Exception {
    String baseUrl = SdkClients.getServerUrl();
    String token = SdkClients.getAdminToken();

    String url = String.format("%s/v1/glossaryTerms/%s/relations", baseUrl, fromTermId);

    String jsonBody =
        String.format(
            "{\"term\":{\"id\":\"%s\",\"type\":\"glossaryTerm\"},\"relationType\":\"%s\"}",
            toTermId, relationType);

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer " + token)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(30))
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
            .build();

    HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

    if (response.statusCode() != 200) {
      LOG.warn(
          "Failed to add term relation: status={}, body={}",
          response.statusCode(),
          response.body());
      return null;
    }

    return MAPPER.readValue(response.body(), GlossaryTerm.class);
  }

  private void removeTermRelation(String fromTermId, String toTermId, String relationType)
      throws Exception {
    String baseUrl = SdkClients.getServerUrl();
    String token = SdkClients.getAdminToken();

    String url =
        String.format(
            "%s/v1/glossaryTerms/%s/relations/%s?relationType=%s",
            baseUrl, fromTermId, toTermId, relationType);

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer " + token)
            .timeout(Duration.ofSeconds(30))
            .DELETE()
            .build();

    HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

    if (response.statusCode() != 200) {
      LOG.warn(
          "Failed to remove term relation: status={}, body={}",
          response.statusCode(),
          response.body());
    }
  }
}
