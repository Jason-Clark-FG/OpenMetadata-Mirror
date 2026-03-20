package org.openmetadata.service.apps.logging;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;

@Slf4j
public class S3AppRunLogStorage implements AppRunLogStorageProvider {
  private final S3Client s3Client;
  private final String bucketName;
  private final String prefix;

  public S3AppRunLogStorage(AppRunLogStorageConfig config) {
    this.bucketName = config.getS3BucketName();
    this.prefix = normalizePrefix(config.getS3Prefix());

    S3ClientBuilder builder = S3Client.builder();
    if (config.getS3Region() != null && !config.getS3Region().isEmpty()) {
      builder.region(Region.of(config.getS3Region()));
    }
    if (config.getS3AccessKeyId() != null && !config.getS3AccessKeyId().isEmpty()) {
      builder.credentialsProvider(
          StaticCredentialsProvider.create(
              AwsBasicCredentials.create(
                  config.getS3AccessKeyId(), config.getS3SecretAccessKey())));
    } else {
      builder.credentialsProvider(DefaultCredentialsProvider.create());
    }
    if (config.getS3EndpointUrl() != null && !config.getS3EndpointUrl().isEmpty()) {
      builder.endpointOverride(java.net.URI.create(config.getS3EndpointUrl()));
      builder.forcePathStyle(true);
    }
    this.s3Client = builder.build();
  }

  /**
   * Returns an OutputStream that buffers to a local temp file. On close(), the temp file is
   * uploaded to S3. This avoids the GET+PUT-every-3-seconds anti-pattern — we write locally during
   * the run and upload once when it finishes.
   */
  @Override
  public OutputStream getOutputStream(String appName, long runTimestamp, String serverId) {
    String key = s3Key(appName, runTimestamp, serverId);
    return new S3BufferedOutputStream(s3Client, bucketName, key);
  }

  @Override
  public String readLogs(String appName, long runTimestamp, String serverId) {
    String key = s3Key(appName, runTimestamp, serverId);
    try {
      byte[] bytes =
          s3Client
              .getObject(GetObjectRequest.builder().bucket(bucketName).key(key).build())
              .readAllBytes();
      return new String(bytes, StandardCharsets.UTF_8);
    } catch (NoSuchKeyException e) {
      return "";
    } catch (IOException e) {
      LOG.error("Failed to read S3 log s3://{}/{}", bucketName, key, e);
      return "";
    }
  }

  @Override
  public InputStream readLogsStream(String appName, long runTimestamp, String serverId) {
    String key = s3Key(appName, runTimestamp, serverId);
    return s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(key).build());
  }

  @Override
  public List<String> listServers(String appName, long runTimestamp) {
    List<String> servers = new ArrayList<>();
    String keyPrefix = prefix + appName + "/" + runTimestamp + "-";
    ListObjectsV2Iterable pages =
        s3Client.listObjectsV2Paginator(
            ListObjectsV2Request.builder().bucket(bucketName).prefix(keyPrefix).build());
    for (var page : pages) {
      for (S3Object obj : page.contents()) {
        String fileName = obj.key().substring(obj.key().lastIndexOf('/') + 1);
        String serverPrefix = runTimestamp + "-";
        if (fileName.startsWith(serverPrefix) && fileName.endsWith(".log")) {
          servers.add(fileName.substring(serverPrefix.length(), fileName.length() - 4));
        }
      }
    }
    return servers;
  }

  @Override
  public List<Long> listRunTimestamps(String appName) {
    Set<Long> timestamps = new TreeSet<>(Comparator.reverseOrder());
    String keyPrefix = prefix + appName + "/";
    ListObjectsV2Iterable pages =
        s3Client.listObjectsV2Paginator(
            ListObjectsV2Request.builder().bucket(bucketName).prefix(keyPrefix).build());
    for (var page : pages) {
      for (S3Object obj : page.contents()) {
        String fileName = obj.key().substring(obj.key().lastIndexOf('/') + 1);
        int dashIdx = fileName.indexOf('-');
        if (dashIdx > 0) {
          try {
            timestamps.add(Long.parseLong(fileName.substring(0, dashIdx)));
          } catch (NumberFormatException ignored) {
            // skip
          }
        }
      }
    }
    return new ArrayList<>(timestamps);
  }

  @Override
  public void deleteRun(String appName, long runTimestamp) {
    String keyPrefix = prefix + appName + "/" + runTimestamp + "-";
    ListObjectsV2Iterable pages =
        s3Client.listObjectsV2Paginator(
            ListObjectsV2Request.builder().bucket(bucketName).prefix(keyPrefix).build());
    for (var page : pages) {
      for (S3Object obj : page.contents()) {
        s3Client.deleteObject(
            DeleteObjectRequest.builder().bucket(bucketName).key(obj.key()).build());
      }
    }
  }

  @Override
  public boolean exists(String appName, long runTimestamp, String serverId) {
    String key = s3Key(appName, runTimestamp, serverId);
    try {
      s3Client.headObject(HeadObjectRequest.builder().bucket(bucketName).key(key).build());
      return true;
    } catch (NoSuchKeyException e) {
      return false;
    }
  }

  @Override
  public String getStorageType() {
    return "s3";
  }

  private String s3Key(String appName, long runTimestamp, String serverId) {
    return prefix + appName + "/" + runTimestamp + "-" + serverId + ".log";
  }

  private static String normalizePrefix(String p) {
    if (p == null || p.isEmpty()) {
      return "app-run-logs/";
    }
    return p.endsWith("/") ? p : p + "/";
  }

  /**
   * Buffers writes to a local temp file, then uploads to S3 on close(). This avoids the
   * GET+PUT-every-flush anti-pattern. The RunLogBuffer flushes every 3s to this OutputStream, but
   * the actual S3 upload only happens once when the run completes and close() is called.
   */
  private static class S3BufferedOutputStream extends OutputStream {
    private final S3Client client;
    private final String bucket;
    private final String key;
    private final Path tempFile;
    private final OutputStream fileStream;

    S3BufferedOutputStream(S3Client client, String bucket, String key) {
      this.client = client;
      this.bucket = bucket;
      this.key = key;
      try {
        this.tempFile = Files.createTempFile("app-run-log-", ".log");
        this.fileStream =
            Files.newOutputStream(tempFile, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
      } catch (IOException e) {
        throw new RuntimeException("Failed to create temp file for S3 log buffering", e);
      }
    }

    @Override
    public void write(int b) throws IOException {
      fileStream.write(b);
    }

    @Override
    public void write(byte[] b, int off, int len) throws IOException {
      fileStream.write(b, off, len);
    }

    @Override
    public void flush() throws IOException {
      fileStream.flush();
    }

    @Override
    public void close() throws IOException {
      fileStream.close();
      try {
        if (Files.size(tempFile) > 0) {
          client.putObject(
              PutObjectRequest.builder().bucket(bucket).key(key).build(),
              RequestBody.fromFile(tempFile));
        }
      } finally {
        Files.deleteIfExists(tempFile);
      }
    }
  }
}
