/*
 *  Copyright 2021 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  applications under the License.
 */

package org.openmetadata.service.resources.learning;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.openmetadata.service.util.TestUtils.ADMIN_AUTH_HEADERS;
import static org.openmetadata.service.util.TestUtils.get;

import jakarta.ws.rs.client.WebTarget;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.openmetadata.schema.entity.learning.LearningResource;
import org.openmetadata.schema.utils.ResultList;
import org.openmetadata.service.OpenMetadataApplicationTest;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LearningResourceResourceTest extends OpenMetadataApplicationTest {

  private static final String LEARNING_RESOURCES = "learning/resources";
  private static final String FIELDS = "categories,contexts,difficulty,estimatedDuration,owners";

  private WebTarget listTarget(int limit) {
    return getResource(LEARNING_RESOURCES).queryParam("limit", limit).queryParam("fields", FIELDS);
  }

  @Test
  void testListAll() throws Exception {
    ResultList<LearningResource> result =
        get(listTarget(1000), ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    assertNotNull(result.getData());
  }

  @Test
  void testFilterByTypeArticle() throws Exception {
    WebTarget target = listTarget(1000).queryParam("type", "Article");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Article".equals(r.getResourceType()),
          "Expected resourceType=Article, got " + r.getResourceType());
    }
  }

  @Test
  void testFilterByTypeVideo() throws Exception {
    WebTarget target = listTarget(1000).queryParam("type", "Video");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Video".equals(r.getResourceType()),
          "Expected resourceType=Video, got " + r.getResourceType());
    }
  }

  @Test
  void testFilterByTypeStorylane() throws Exception {
    WebTarget target = listTarget(1000).queryParam("type", "Storylane");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Storylane".equals(r.getResourceType()),
          "Expected resourceType=Storylane, got " + r.getResourceType());
    }
  }

  @Test
  void testFilterByMultipleTypes() throws Exception {
    WebTarget target = listTarget(1000).queryParam("type", "Article").queryParam("type", "Video");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Article".equals(r.getResourceType()) || "Video".equals(r.getResourceType()),
          "Expected resourceType in [Article,Video], got " + r.getResourceType());
    }
  }

  @Test
  void testFilterByStatusActive() throws Exception {
    WebTarget target = listTarget(1000).queryParam("status", "Active");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Active".equals(r.getStatus().value()), "Expected status=Active, got " + r.getStatus());
    }
  }

  @Test
  void testFilterByStatusDraft() throws Exception {
    WebTarget target = listTarget(1000).queryParam("status", "Draft");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue(
          "Draft".equals(r.getStatus().value()), "Expected status=Draft, got " + r.getStatus());
    }
  }

  @Test
  void testFilterByMultipleStatuses() throws Exception {
    WebTarget target =
        listTarget(1000).queryParam("status", "Active").queryParam("status", "Draft");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      String status = r.getStatus() != null ? r.getStatus().value() : null;
      assertTrue(
          "Active".equals(status) || "Draft".equals(status),
          "Expected status in [Active,Draft], got " + status);
    }
  }

  @Test
  void testFilterByCategory() throws Exception {
    WebTarget target = listTarget(1000).queryParam("category", "DataGovernance");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testFilterByMultipleCategories() throws Exception {
    WebTarget target =
        listTarget(1000)
            .queryParam("category", "DataGovernance")
            .queryParam("category", "Discovery");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testFilterByPageId() throws Exception {
    WebTarget target = listTarget(1000).queryParam("pageId", "glossary");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testFilterByMultiplePageIds() throws Exception {
    WebTarget target =
        listTarget(1000).queryParam("pageId", "glossary").queryParam("pageId", "domains");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testFilterByComponentId() throws Exception {
    WebTarget target = listTarget(1000).queryParam("componentId", "glossary-list");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testFilterByDifficulty() throws Exception {
    WebTarget target = listTarget(1000).queryParam("difficulty", "Intro");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testSearchFilter() throws Exception {
    WebTarget target = listTarget(1000).queryParam("q", "glossary");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testCombinedFiltersTypeAndStatus() throws Exception {
    WebTarget target =
        listTarget(1000).queryParam("type", "Article").queryParam("status", "Active");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
    for (LearningResource r : result.getData()) {
      assertTrue("Article".equals(r.getResourceType()));
      assertTrue("Active".equals(r.getStatus().value()));
    }
  }

  @Test
  void testCombinedFiltersTypeAndCategory() throws Exception {
    WebTarget target =
        listTarget(1000).queryParam("type", "Article").queryParam("category", "DataGovernance");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }

  @Test
  void testCombinedFiltersTypeAndPageId() throws Exception {
    WebTarget target =
        listTarget(1000).queryParam("type", "Article").queryParam("pageId", "glossary");
    ResultList<LearningResource> result = get(target, ResultList.class, ADMIN_AUTH_HEADERS);
    assertNotNull(result);
  }
}
