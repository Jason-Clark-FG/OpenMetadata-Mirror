package org.openmetadata.service.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.dropwizard.configuration.EnvironmentVariableSubstitutor;
import io.dropwizard.configuration.FileConfigurationSourceProvider;
import io.dropwizard.configuration.SubstitutingSourceProvider;
import io.dropwizard.configuration.YamlConfigurationFactory;
import io.dropwizard.jackson.Jackson;
import jakarta.validation.Validation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.openmetadata.service.OpenMetadataApplicationConfig;
import org.openmetadata.service.events.AuditExcludeFilterFactory;
import org.openmetadata.service.events.AuditOnlyFilterFactory;
import org.openmetadata.service.logging.SwitchableAccessLayoutFactory;
import org.openmetadata.service.logging.SwitchableEventLayoutFactory;

class LoggingConfigurationYamlTest {
  private static final List<String> CONFIG_PATHS =
      List.of(
          "../conf/openmetadata.yaml",
          "../docker/development/distributed-test/local/server1.yaml",
          "../docker/development/distributed-test/local/server2.yaml",
          "../docker/development/distributed-test/local/server3.yaml",
          "../openmetadata-integration-tests/src/test/resources/openmetadata-secure-test.yaml");

  @Test
  void parsesTextLoggingConfigurations() {
    for (String path : CONFIG_PATHS) {
      assertDoesNotThrow(() -> parse(path), path);
    }
  }

  @Test
  void parsesJsonLoggingConfigurations() {
    for (String path : CONFIG_PATHS) {
      assertDoesNotThrow(() -> parse(path, "json"), path);
    }
  }

  private OpenMetadataApplicationConfig parse(String path) throws Exception {
    return parse(path, null);
  }

  private OpenMetadataApplicationConfig parse(String path, String formatOverride) throws Exception {
    ObjectMapper objectMapper = Jackson.newObjectMapper();
    objectMapper.registerSubtypes(
        AuditExcludeFilterFactory.class,
        AuditOnlyFilterFactory.class,
        SwitchableEventLayoutFactory.class,
        SwitchableAccessLayoutFactory.class);
    YamlConfigurationFactory<OpenMetadataApplicationConfig> factory =
        new YamlConfigurationFactory<>(
            OpenMetadataApplicationConfig.class,
            Validation.buildDefaultValidatorFactory().getValidator(),
            objectMapper,
            "dw");

    String configPath = path;
    if (formatOverride != null) {
      Path tempFile = Files.createTempFile("logging-config-", ".yaml");
      Files.writeString(
          tempFile, Files.readString(Path.of(path)).replace("${LOG_FORMAT:-text}", formatOverride));
      configPath = tempFile.toString();
    }

    return factory.build(
        new SubstitutingSourceProvider(
            new FileConfigurationSourceProvider(), new EnvironmentVariableSubstitutor(false)),
        configPath);
  }
}
