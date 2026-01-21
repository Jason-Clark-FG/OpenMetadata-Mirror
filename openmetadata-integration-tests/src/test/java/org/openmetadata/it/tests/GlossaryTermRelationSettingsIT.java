package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.network.HttpMethod;
import org.openmetadata.sdk.network.RequestOptions;

/**
 * Integration tests for Glossary Term Relation Settings migration.
 *
 * <p>Verifies that the 2.0.0 migration properly creates default glossary term relation settings.
 */
@Execution(ExecutionMode.CONCURRENT)
public class GlossaryTermRelationSettingsIT {

  private static final ObjectMapper MAPPER = new ObjectMapper();

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
}
