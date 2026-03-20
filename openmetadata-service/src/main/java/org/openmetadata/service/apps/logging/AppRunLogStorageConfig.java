package org.openmetadata.service.apps.logging;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AppRunLogStorageConfig {

  public enum StorageType {
    LOCAL,
    S3
  }

  @JsonProperty("type")
  private StorageType type = StorageType.LOCAL;

  @JsonProperty("localDirectory")
  private String localDirectory = "./logs/app-runs";

  @JsonProperty("maxRunsPerApp")
  private int maxRunsPerApp = 5;

  @JsonProperty("maxLinesPerRun")
  private int maxLinesPerRun = 100_000;

  @JsonProperty("s3BucketName")
  private String s3BucketName;

  @JsonProperty("s3Prefix")
  private String s3Prefix = "app-run-logs/";

  @JsonProperty("s3Region")
  private String s3Region;

  @JsonProperty("s3AccessKeyId")
  private String s3AccessKeyId;

  @JsonProperty("s3SecretAccessKey")
  private String s3SecretAccessKey;

  @JsonProperty("s3EndpointUrl")
  private String s3EndpointUrl;

  public AppRunLogStorageProvider createProvider() {
    return switch (type) {
      case S3 -> new S3AppRunLogStorage(this);
      case LOCAL -> new LocalAppRunLogStorage(localDirectory);
    };
  }
}
