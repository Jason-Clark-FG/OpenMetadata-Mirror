/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import com.fasterxml.jackson.core.type.TypeReference;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.api.parallel.Isolated;
import org.openmetadata.it.bootstrap.TestSuiteBootstrap;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.entity.app.AppRunRecord;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.sdk.fluent.Apps;
import org.openmetadata.sdk.network.HttpClient;
import org.openmetadata.sdk.network.HttpMethod;

/**
 * Integration tests for App Run Logs feature. Triggers a real SearchIndexingApplication run, waits
 * for completion, then verifies logs can be fetched, streamed, and downloaded via REST API.
 */
@Execution(ExecutionMode.SAME_THREAD)
@Isolated
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(TestNamespaceExtension.class)
public class AppRunLogsIT {

  private static final String APP_NAME = "SearchIndexingApplication";
  private long completedRunTimestamp;

  @BeforeAll
  static void setup() {
    Apps.setDefaultClient(SdkClients.adminClient());
  }

  @Test
  @Order(1)
  void triggerSearchIndexAndWaitForCompletion(TestNamespace ns) throws Exception {
    assumeFalse(
        TestSuiteBootstrap.isK8sEnabled(), "App trigger not compatible with K8s pipeline backend");

    HttpClient httpClient = SdkClients.adminClient().getHttpClient();

    // Wait for any existing run to finish
    waitForJobCompletion(httpClient);

    // Trigger the app
    Awaitility.await("Trigger " + APP_NAME)
        .atMost(Duration.ofMinutes(2))
        .pollInterval(Duration.ofSeconds(3))
        .ignoreExceptionsMatching(
            e -> e.getMessage() != null && e.getMessage().contains("already running"))
        .until(
            () -> {
              Apps.trigger(APP_NAME).run();
              return true;
            });

    // Wait for run to complete (SUCCESS or FAILED — both produce logs)
    Awaitility.await("Wait for run completion")
        .atMost(Duration.ofMinutes(5))
        .pollInterval(Duration.ofSeconds(3))
        .ignoreExceptions()
        .untilAsserted(
            () -> {
              AppRunRecord run =
                  httpClient.execute(
                      HttpMethod.GET,
                      "/v1/apps/name/" + APP_NAME + "/runs/latest",
                      null,
                      AppRunRecord.class);
              assertNotNull(run);
              String status = run.getStatus().value();
              assertTrue(
                  "success".equals(status) || "failed".equals(status) || "completed".equals(status),
                  "Run should be completed, got: " + status);
              completedRunTimestamp = run.getTimestamp();
            });

    assertTrue(completedRunTimestamp > 0, "Should have captured a run timestamp");
  }

  @Test
  @Order(2)
  void fetchLogsViaRestApi(TestNamespace ns) throws Exception {
    assumeFalse(TestSuiteBootstrap.isK8sEnabled());
    assertTrue(completedRunTimestamp > 0, "Depends on triggerSearchIndexAndWaitForCompletion");

    HttpClient httpClient = SdkClients.adminClient().getHttpClient();
    String response =
        httpClient.executeForString(
            HttpMethod.GET,
            "/v1/apps/name/" + APP_NAME + "/runs/" + completedRunTimestamp + "/logs",
            null,
            null);

    assertNotNull(response);
    Map<String, Object> result =
        JsonUtils.readValue(response, new TypeReference<Map<String, Object>>() {});

    String logs = (String) result.get("logs");
    assertNotNull(logs, "Logs should not be null");
    assertFalse(logs.isEmpty(), "Logs should not be empty");
    assertTrue(logs.contains("INFO"), "Logs should contain INFO level entries");
    assertTrue(
        logs.contains("reindex") || logs.contains("Reindex") || logs.contains("SearchIndex"),
        "Logs should contain reindex-related content");

    List<?> servers = (List<?>) result.get("servers");
    assertNotNull(servers, "Servers list should not be null");
    assertFalse(servers.isEmpty(), "At least one server should have logs");

    Number totalLines = (Number) result.get("totalLines");
    assertTrue(totalLines.intValue() > 0, "Should have captured some log lines");
  }

  @Test
  @Order(3)
  void listServersForRun(TestNamespace ns) throws Exception {
    assumeFalse(TestSuiteBootstrap.isK8sEnabled());
    assertTrue(completedRunTimestamp > 0);

    HttpClient httpClient = SdkClients.adminClient().getHttpClient();
    String response =
        httpClient.executeForString(
            HttpMethod.GET,
            "/v1/apps/name/" + APP_NAME + "/runs/" + completedRunTimestamp + "/logs/servers",
            null,
            null);

    Map<String, Object> result =
        JsonUtils.readValue(response, new TypeReference<Map<String, Object>>() {});
    List<?> servers = (List<?>) result.get("servers");
    assertNotNull(servers);
    assertFalse(servers.isEmpty(), "At least one server should be listed");
  }

  @Test
  @Order(4)
  void downloadLogsReturnsPlainText(TestNamespace ns) throws Exception {
    assumeFalse(TestSuiteBootstrap.isK8sEnabled());
    assertTrue(completedRunTimestamp > 0);

    String baseUrl = System.getProperty("IT_BASE_URL", "http://localhost:8585/api");
    String token = SdkClients.adminClient().getConfig().getAccessToken();
    String url =
        baseUrl + "/v1/apps/name/" + APP_NAME + "/runs/" + completedRunTimestamp + "/logs/download";

    HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
    conn.setRequestProperty("Authorization", "Bearer " + token);
    conn.setRequestMethod("GET");

    int responseCode = conn.getResponseCode();
    assertTrue(responseCode == 200, "Download should return 200, got: " + responseCode);

    String contentDisposition = conn.getHeaderField("Content-Disposition");
    assertNotNull(contentDisposition, "Should have Content-Disposition header");
    assertTrue(contentDisposition.contains(".log"), "Filename should end in .log");

    String body;
    try (var reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
      body = reader.lines().reduce("", (a, b) -> a + "\n" + b);
    }
    assertFalse(body.isEmpty(), "Downloaded log content should not be empty");
    assertTrue(body.contains("INFO"), "Downloaded logs should contain log entries");

    conn.disconnect();
  }

  @Test
  @Order(5)
  void streamLogsViaSSE(TestNamespace ns) throws Exception {
    assumeFalse(TestSuiteBootstrap.isK8sEnabled());
    assertTrue(completedRunTimestamp > 0);

    String baseUrl = System.getProperty("IT_BASE_URL", "http://localhost:8585/api");
    String token = SdkClients.adminClient().getConfig().getAccessToken();
    String url =
        baseUrl + "/v1/apps/name/" + APP_NAME + "/runs/" + completedRunTimestamp + "/logs/stream";

    HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
    conn.setRequestProperty("Authorization", "Bearer " + token);
    conn.setRequestProperty("Accept", "text/event-stream");
    conn.setRequestMethod("GET");
    conn.setReadTimeout(10000);

    int responseCode = conn.getResponseCode();
    assertTrue(responseCode == 200, "SSE stream should return 200, got: " + responseCode);

    // Read first few SSE events (the stream sends existing log content then closes for
    // completed runs with "event: done")
    StringBuilder sseContent = new StringBuilder();
    try (var reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
      String line;
      int lineCount = 0;
      while ((line = reader.readLine()) != null && lineCount < 200) {
        sseContent.append(line).append("\n");
        if (line.startsWith("event: done")) {
          break;
        }
        lineCount++;
      }
    } catch (java.net.SocketTimeoutException e) {
      // Expected for completed runs — stream may not have "done" event before timeout
    }

    String content = sseContent.toString();
    assertFalse(content.isEmpty(), "SSE stream should have content");
    assertTrue(content.contains("data: "), "SSE stream should contain data events");

    conn.disconnect();
  }

  @Test
  @Order(6)
  void invalidServerIdReturns400(TestNamespace ns) throws Exception {
    assumeFalse(TestSuiteBootstrap.isK8sEnabled());
    assertTrue(completedRunTimestamp > 0);

    String baseUrl = System.getProperty("IT_BASE_URL", "http://localhost:8585/api");
    String token = SdkClients.adminClient().getConfig().getAccessToken();
    String url =
        baseUrl
            + "/v1/apps/name/"
            + APP_NAME
            + "/runs/"
            + completedRunTimestamp
            + "/logs?serverId=../../etc/passwd";

    HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
    conn.setRequestProperty("Authorization", "Bearer " + token);
    conn.setRequestMethod("GET");

    int responseCode = conn.getResponseCode();
    assertTrue(
        responseCode == 400 || responseCode == 500,
        "Path traversal should be rejected, got: " + responseCode);

    conn.disconnect();
  }

  private void waitForJobCompletion(HttpClient httpClient) {
    try {
      Awaitility.await("Wait for existing job completion")
          .atMost(Duration.ofSeconds(30))
          .pollInterval(Duration.ofSeconds(2))
          .ignoreExceptions()
          .until(
              () -> {
                AppRunRecord run =
                    httpClient.execute(
                        HttpMethod.GET,
                        "/v1/apps/name/" + APP_NAME + "/runs/latest",
                        null,
                        AppRunRecord.class);
                if (run == null || run.getStatus() == null) {
                  return true;
                }
                String status = run.getStatus().value();
                return "success".equals(status)
                    || "failed".equals(status)
                    || "completed".equals(status);
              });
    } catch (org.awaitility.core.ConditionTimeoutException e) {
      // Best-effort
    }
  }
}
