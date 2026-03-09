package org.openmetadata.service.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.dropwizard.configuration.EnvironmentVariableSubstitutor;
import io.dropwizard.configuration.FileConfigurationSourceProvider;
import io.dropwizard.configuration.SubstitutingSourceProvider;
import io.dropwizard.configuration.YamlConfigurationFactory;
import io.dropwizard.jackson.Jackson;
import jakarta.validation.Validation;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.openmetadata.service.OpenMetadataApplicationConfig;
import org.openmetadata.service.events.AuditExcludeFilterFactory;
import org.openmetadata.service.events.AuditOnlyFilterFactory;

class LoggingConfigurationYamlTest {

  @Test
  void parsesJsonLoggingConfigurations() {
    for (String path :
        List.of(
            "../conf/openmetadata.yaml",
            "../docker/development/distributed-test/local/server1.yaml",
            "../openmetadata-integration-tests/src/test/resources/openmetadata-secure-test.yaml")) {
      assertDoesNotThrow(() -> parse(path), path);
    }
  }

  private OpenMetadataApplicationConfig parse(String path) throws Exception {
    ObjectMapper objectMapper = Jackson.newObjectMapper();
    objectMapper.registerSubtypes(AuditExcludeFilterFactory.class, AuditOnlyFilterFactory.class);
    YamlConfigurationFactory<OpenMetadataApplicationConfig> factory =
        new YamlConfigurationFactory<>(
            OpenMetadataApplicationConfig.class,
            Validation.buildDefaultValidatorFactory().getValidator(),
            objectMapper,
            "dw");

    return factory.build(
        new SubstitutingSourceProvider(
            new FileConfigurationSourceProvider(), new EnvironmentVariableSubstitutor(false)),
        path);
  }
}
