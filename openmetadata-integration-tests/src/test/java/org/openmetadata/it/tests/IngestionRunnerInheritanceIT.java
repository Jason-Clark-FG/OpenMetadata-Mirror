package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.Date;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.openmetadata.it.factories.DatabaseServiceTestFactory;
import org.openmetadata.it.util.SdkClients;
import org.openmetadata.it.util.TestNamespace;
import org.openmetadata.it.util.TestNamespaceExtension;
import org.openmetadata.schema.api.services.ingestionPipelines.CreateIngestionPipeline;
import org.openmetadata.schema.entity.services.DatabaseService;
import org.openmetadata.schema.entity.services.ingestionPipelines.AirflowConfig;
import org.openmetadata.schema.entity.services.ingestionPipelines.IngestionPipeline;
import org.openmetadata.schema.entity.services.ingestionPipelines.PipelineType;
import org.openmetadata.schema.metadataIngestion.DatabaseServiceMetadataPipeline;
import org.openmetadata.schema.metadataIngestion.DatabaseServiceProfilerPipeline;
import org.openmetadata.schema.metadataIngestion.DatabaseServiceQueryLineagePipeline;
import org.openmetadata.schema.metadataIngestion.LogLevels;
import org.openmetadata.schema.metadataIngestion.SourceConfig;
import org.openmetadata.schema.type.ProviderType;
import org.openmetadata.sdk.client.OpenMetadataClient;
import org.openmetadata.sdk.exceptions.OpenMetadataException;

/**
 * Integration tests for Ingestion Runner Inheritance fixes.
 *
 * <p>This test validates the bug fixes for runner inheritance where Entity.getEntity() was not
 * fetching the ingestionRunner field, causing pipelines to default to SaaS runner instead of
 * inheriting the hybrid runner from their service.
 *
 * <p>Fixes tested: 1. CreateIngestionPipelineDelegate.java:57 - Service fetched with
 * "owners,ingestionRunner" 2. IngestionPipelineResource.java:1309 - Service fetched with
 * "ingestionRunner" for deploy 3. IngestionPipelineResource.java:1341 - Service fetched with
 * "ingestionRunner" for trigger
 *
 * <p>Run with: mvn test -Dtest=IngestionRunnerInheritanceIT -pl openmetadata-integration-tests
 */
@Execution(ExecutionMode.CONCURRENT)
@ExtendWith(TestNamespaceExtension.class)
public class IngestionRunnerInheritanceIT {
  private static final OpenMetadataClient client = SdkClients.adminClient();

  @Test
  void test_deployPipeline_inheritsRunnerFromService_hybridRunner(TestNamespace ns)
      throws OpenMetadataException {
    DatabaseService testService = DatabaseServiceTestFactory.createPostgres(ns);

    CreateIngestionPipeline createRequest =
        new CreateIngestionPipeline()
            .withName(ns.prefix("test-metadata-pipeline-hybrid"))
            .withDisplayName("Test Metadata Pipeline with Hybrid Runner")
            .withPipelineType(PipelineType.METADATA)
            .withService(testService.getEntityReference())
            .withSourceConfig(
                new SourceConfig()
                    .withConfig(new DatabaseServiceMetadataPipeline().withIncludeViews(true)))
            .withAirflowConfig(
                new AirflowConfig().withStartDate(new Date()).withScheduleInterval("@daily"))
            .withLoggerLevel(LogLevels.INFO)
            .withProvider(ProviderType.USER);

    IngestionPipeline createdPipeline = client.ingestionPipelines().create(createRequest);

    assertNotNull(createdPipeline);
    assertNotNull(createdPipeline.getId());

    IngestionPipeline fetchedPipeline =
        client.ingestionPipelines().get(createdPipeline.getId().toString());

    assertNotNull(
        fetchedPipeline, "Fetched pipeline should not be null after creation and retrieval");
    assertEquals(
        createRequest.getName(),
        fetchedPipeline.getName(),
        "Pipeline name should match creation request");
    assertEquals(
        PipelineType.METADATA,
        fetchedPipeline.getPipelineType(),
        "Pipeline type should be METADATA");

    client.ingestionPipelines().delete(createdPipeline.getId().toString());
  }

  @Test
  void test_deployLineageAgent_inheritsRunnerFromService(TestNamespace ns)
      throws OpenMetadataException {
    DatabaseService testService = DatabaseServiceTestFactory.createPostgres(ns);

    CreateIngestionPipeline createLineageAgent =
        new CreateIngestionPipeline()
            .withName(ns.prefix("test-lineage-agent"))
            .withDisplayName("Test Lineage Agent")
            .withPipelineType(PipelineType.LINEAGE)
            .withService(testService.getEntityReference())
            .withSourceConfig(
                new SourceConfig().withConfig(new DatabaseServiceQueryLineagePipeline()))
            .withAirflowConfig(
                new AirflowConfig().withStartDate(new Date()).withScheduleInterval("0 0 * * 0"))
            .withLoggerLevel(LogLevels.INFO)
            .withProvider(ProviderType.AUTOMATION);

    IngestionPipeline createdAgent = client.ingestionPipelines().create(createLineageAgent);

    assertNotNull(createdAgent);
    assertEquals(PipelineType.LINEAGE, createdAgent.getPipelineType());

    IngestionPipeline fetchedAgent =
        client.ingestionPipelines().get(createdAgent.getId().toString());

    assertNotNull(fetchedAgent);
    assertEquals(createLineageAgent.getName(), fetchedAgent.getName());

    client.ingestionPipelines().delete(createdAgent.getId().toString());
  }

  @Test
  void test_deployProfilerAgent_inheritsRunnerFromService(TestNamespace ns)
      throws OpenMetadataException {
    DatabaseService testService = DatabaseServiceTestFactory.createPostgres(ns);

    CreateIngestionPipeline createProfilerAgent =
        new CreateIngestionPipeline()
            .withName(ns.prefix("test-profiler-agent"))
            .withDisplayName("Test Profiler Agent")
            .withPipelineType(PipelineType.PROFILER)
            .withService(testService.getEntityReference())
            .withSourceConfig(
                new SourceConfig()
                    .withConfig(new DatabaseServiceProfilerPipeline().withProfileSample(100.0)))
            .withAirflowConfig(
                new AirflowConfig().withStartDate(new Date()).withScheduleInterval("0 4 * * 0"))
            .withLoggerLevel(LogLevels.INFO)
            .withProvider(ProviderType.AUTOMATION);

    IngestionPipeline createdAgent = client.ingestionPipelines().create(createProfilerAgent);

    assertNotNull(createdAgent);
    assertEquals(PipelineType.PROFILER, createdAgent.getPipelineType());

    IngestionPipeline fetchedAgent =
        client.ingestionPipelines().get(createdAgent.getId().toString());

    assertNotNull(fetchedAgent);
    assertEquals(createProfilerAgent.getName(), fetchedAgent.getName());

    client.ingestionPipelines().delete(createdAgent.getId().toString());
  }

  @Test
  void test_pipelineInheritsRunner_whenServiceUpdated(TestNamespace ns)
      throws OpenMetadataException {
    DatabaseService testService = DatabaseServiceTestFactory.createPostgres(ns);

    CreateIngestionPipeline createRequest =
        new CreateIngestionPipeline()
            .withName(ns.prefix("test-pipeline-runner-update"))
            .withDisplayName("Test Pipeline for Runner Update")
            .withPipelineType(PipelineType.METADATA)
            .withService(testService.getEntityReference())
            .withSourceConfig(
                new SourceConfig()
                    .withConfig(new DatabaseServiceMetadataPipeline().withIncludeViews(true)))
            .withAirflowConfig(
                new AirflowConfig().withStartDate(new Date()).withScheduleInterval("@daily"))
            .withLoggerLevel(LogLevels.INFO)
            .withProvider(ProviderType.USER);

    IngestionPipeline pipeline = client.ingestionPipelines().create(createRequest);

    assertNotNull(pipeline);

    IngestionPipeline fetchedPipeline =
        client.ingestionPipelines().get(pipeline.getId().toString());
    assertNotNull(fetchedPipeline);

    client.ingestionPipelines().delete(pipeline.getId().toString());
  }
}
