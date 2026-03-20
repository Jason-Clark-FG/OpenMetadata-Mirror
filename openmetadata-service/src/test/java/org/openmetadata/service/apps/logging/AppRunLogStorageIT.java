package org.openmetadata.service.apps.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.HttpWaitStrategy;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Integration tests for both LocalAppRunLogStorage and S3AppRunLogStorage. The S3 tests use a real
 * MinIO container via Testcontainers to verify end-to-end S3 compatibility.
 */
class AppRunLogStorageIT {

  /** Shared contract tests that both providers must pass. */
  private static void runStorageContractTests(AppRunLogStorageProvider storage) throws Exception {
    // --- write and read ---
    try (OutputStream os = storage.getOutputStream("TestApp", 1000L, "server1")) {
      os.write("line one\nline two\n".getBytes(StandardCharsets.UTF_8));
      os.flush();
    }

    String content = storage.readLogs("TestApp", 1000L, "server1");
    assertTrue(content.contains("line one"));
    assertTrue(content.contains("line two"));

    // --- exists ---
    assertTrue(storage.exists("TestApp", 1000L, "server1"));
    assertFalse(storage.exists("TestApp", 1000L, "nonexistent"));
    assertFalse(storage.exists("NoApp", 9999L, "server1"));

    // --- listServers ---
    try (OutputStream os = storage.getOutputStream("TestApp", 1000L, "server2")) {
      os.write("server2 log\n".getBytes(StandardCharsets.UTF_8));
      os.flush();
    }

    List<String> servers = storage.listServers("TestApp", 1000L);
    assertTrue(servers.contains("server1"));
    assertTrue(servers.contains("server2"));
    assertEquals(2, servers.size());

    // --- listRunTimestamps (descending order) ---
    try (OutputStream os = storage.getOutputStream("TestApp", 2000L, "server1")) {
      os.write("run 2\n".getBytes(StandardCharsets.UTF_8));
      os.flush();
    }
    try (OutputStream os = storage.getOutputStream("TestApp", 3000L, "server1")) {
      os.write("run 3\n".getBytes(StandardCharsets.UTF_8));
      os.flush();
    }

    List<Long> timestamps = storage.listRunTimestamps("TestApp");
    assertEquals(3, timestamps.size());
    assertEquals(3000L, timestamps.get(0));
    assertEquals(2000L, timestamps.get(1));
    assertEquals(1000L, timestamps.get(2));

    // --- readLogsStream ---
    try (InputStream is = storage.readLogsStream("TestApp", 1000L, "server1")) {
      String streamContent = new String(is.readAllBytes(), StandardCharsets.UTF_8);
      assertTrue(streamContent.contains("line one"));
    }

    // --- isValidServer ---
    assertTrue(storage.isValidServer("TestApp", 1000L, "server1"));
    assertFalse(storage.isValidServer("TestApp", 1000L, "hacker"));

    // --- deleteRun ---
    storage.deleteRun("TestApp", 1000L);
    assertFalse(storage.exists("TestApp", 1000L, "server1"));
    assertFalse(storage.exists("TestApp", 1000L, "server2"));
    assertTrue(storage.exists("TestApp", 2000L, "server1"));

    // --- readLogs for nonexistent returns empty ---
    assertEquals("", storage.readLogs("TestApp", 9999L, "nope"));
  }

  @Nested
  class LocalStorageTest {
    @TempDir Path tempDir;

    @Test
    void localStoragePassesContractTests() throws Exception {
      LocalAppRunLogStorage storage = new LocalAppRunLogStorage(tempDir.toString());
      assertEquals("local", storage.getStorageType());
      runStorageContractTests(storage);
    }

    @Test
    void localStorageRejectsPathTraversal() {
      LocalAppRunLogStorage storage = new LocalAppRunLogStorage(tempDir.toString());
      try {
        storage.readLogs("../../etc", 1L, "passwd");
        // Should not reach here
        assertFalse(true, "Expected IllegalArgumentException");
      } catch (IllegalArgumentException e) {
        assertTrue(e.getMessage().contains("Invalid path"));
      }
    }

    @Test
    void appendModeWorksCorrectly() throws Exception {
      LocalAppRunLogStorage storage = new LocalAppRunLogStorage(tempDir.toString());

      try (OutputStream os = storage.getOutputStream("AppendApp", 100L, "s1")) {
        os.write("batch 1\n".getBytes(StandardCharsets.UTF_8));
        os.flush();
      }
      try (OutputStream os = storage.getOutputStream("AppendApp", 100L, "s1")) {
        os.write("batch 2\n".getBytes(StandardCharsets.UTF_8));
        os.flush();
      }

      String content = storage.readLogs("AppendApp", 100L, "s1");
      assertTrue(content.contains("batch 1"));
      assertTrue(content.contains("batch 2"));
    }
  }

  @Nested
  @Testcontainers
  @TestInstance(TestInstance.Lifecycle.PER_CLASS)
  class S3StorageTest {

    static final String MINIO_ACCESS_KEY = "minioadmin";
    static final String MINIO_SECRET_KEY = "minioadmin";
    static final String BUCKET_NAME = "test-app-logs";

    @Container
    static final GenericContainer<?> minio =
        new GenericContainer<>("minio/minio:latest")
            .withCommand("server /data")
            .withExposedPorts(9000)
            .withEnv("MINIO_ROOT_USER", MINIO_ACCESS_KEY)
            .withEnv("MINIO_ROOT_PASSWORD", MINIO_SECRET_KEY)
            .waitingFor(
                new HttpWaitStrategy()
                    .forPath("/minio/health/ready")
                    .forPort(9000)
                    .withStartupTimeout(Duration.ofMinutes(1)));

    private S3AppRunLogStorage createS3Storage() {
      String endpoint = "http://" + minio.getHost() + ":" + minio.getMappedPort(9000);

      // Create bucket first
      software.amazon.awssdk.services.s3.S3Client client =
          software.amazon.awssdk.services.s3.S3Client.builder()
              .endpointOverride(java.net.URI.create(endpoint))
              .forcePathStyle(true)
              .region(software.amazon.awssdk.regions.Region.US_EAST_1)
              .credentialsProvider(
                  software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(
                      software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create(
                          MINIO_ACCESS_KEY, MINIO_SECRET_KEY)))
              .build();

      try {
        client.createBucket(
            software.amazon.awssdk.services.s3.model.CreateBucketRequest.builder()
                .bucket(BUCKET_NAME)
                .build());
      } catch (software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException ignored) {
      }
      client.close();

      AppRunLogStorageConfig config = new AppRunLogStorageConfig();
      config.setType(AppRunLogStorageConfig.StorageType.S3);
      config.setS3BucketName(BUCKET_NAME);
      config.setS3Prefix("logs/");
      config.setS3Region("us-east-1");
      config.setS3AccessKeyId(MINIO_ACCESS_KEY);
      config.setS3SecretAccessKey(MINIO_SECRET_KEY);
      config.setS3EndpointUrl(endpoint);

      return new S3AppRunLogStorage(config);
    }

    @Test
    void s3StoragePassesContractTests() throws Exception {
      S3AppRunLogStorage storage = createS3Storage();
      assertEquals("s3", storage.getStorageType());
      runStorageContractTests(storage);
    }

    @Test
    void s3AppendViaPutUpdatesContent() throws Exception {
      S3AppRunLogStorage storage = createS3Storage();

      try (OutputStream os = storage.getOutputStream("S3Append", 500L, "s1")) {
        os.write("first write\n".getBytes(StandardCharsets.UTF_8));
      }
      try (OutputStream os = storage.getOutputStream("S3Append", 500L, "s1")) {
        os.write("second write\n".getBytes(StandardCharsets.UTF_8));
      }

      String content = storage.readLogs("S3Append", 500L, "s1");
      assertTrue(content.contains("first write"));
      assertTrue(content.contains("second write"));
    }
  }

  @Nested
  class ConfigFactoryTest {

    @TempDir Path tempDir;

    @Test
    void localConfigCreatesLocalProvider() {
      AppRunLogStorageConfig config = new AppRunLogStorageConfig();
      config.setType(AppRunLogStorageConfig.StorageType.LOCAL);
      config.setLocalDirectory(tempDir.toString());

      AppRunLogStorageProvider provider = config.createProvider();
      assertEquals("local", provider.getStorageType());
      assertTrue(provider instanceof LocalAppRunLogStorage);
    }

    @Test
    void defaultConfigIsLocal() {
      AppRunLogStorageConfig config = new AppRunLogStorageConfig();
      assertEquals(AppRunLogStorageConfig.StorageType.LOCAL, config.getType());
    }
  }
}
