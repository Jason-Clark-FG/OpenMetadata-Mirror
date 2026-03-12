package org.openmetadata.service.migration.api;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jdbi.v3.core.Handle;
import org.jdbi.v3.core.Jdbi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.openmetadata.service.OpenMetadataApplicationConfig;
import org.openmetadata.service.jdbi3.MigrationDAO;
import org.openmetadata.service.jdbi3.locator.ConnectionType;
import org.openmetadata.service.migration.QueryStatus;
import org.openmetadata.service.migration.context.MigrationContext;
import org.openmetadata.service.migration.context.MigrationWorkflowContext;

class MigrationWorkflowTest {

  @TempDir Path tempDir;

  private Jdbi jdbi;
  private MigrationDAO migrationDAO;
  private Handle handle;
  private OpenMetadataApplicationConfig config;

  @BeforeEach
  void setUp() {
    jdbi = mock(Jdbi.class);
    migrationDAO = mock(MigrationDAO.class);
    handle = mock(Handle.class, RETURNS_DEEP_STUBS);
    config = mock(OpenMetadataApplicationConfig.class);

    when(jdbi.onDemand(MigrationDAO.class)).thenReturn(migrationDAO);
    when(jdbi.open()).thenReturn(handle);
    when(handle.createQuery(anyString()).mapTo(Integer.class).one()).thenReturn(0);
  }

  @Test
  void loadMigrationsFiltersAlreadyExecutedNativeVersions() throws Exception {
    Path nativeRoot = Files.createDirectories(tempDir.resolve("native"));
    createMigrationDir(nativeRoot, "1.0.0", "SELECT 1;");
    createMigrationDir(nativeRoot, "1.1.0", "SELECT 2;");
    when(migrationDAO.getMigrationVersions()).thenReturn(List.of("1.0.0"));

    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi, nativeRoot.toString(), ConnectionType.POSTGRES, null, null, config, false);

    workflow.loadMigrations();

    assertEquals(List.of("1.1.0"), getMigrationVersions(workflow));
    assertEquals(Optional.of("1.0.0"), getCurrentMaxVersion(workflow));
  }

  @Test
  void loadMigrationsIncludesUnexecutedExtensionVersions() throws Exception {
    Path nativeRoot = Files.createDirectories(tempDir.resolve("native"));
    Path extensionRoot = Files.createDirectories(tempDir.resolve("extension"));
    createMigrationDir(nativeRoot, "1.2.0", "SELECT 1;");
    createMigrationDir(extensionRoot, "1.0.1", "SELECT 2;");
    when(migrationDAO.getMigrationVersions()).thenReturn(List.of("1.2.0"));

    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi,
            nativeRoot.toString(),
            ConnectionType.POSTGRES,
            extensionRoot.toString(),
            null,
            config,
            false);

    workflow.loadMigrations();

    assertEquals(List.of("1.0.1"), getMigrationVersions(workflow));
    assertEquals(Optional.of("1.2.0"), getCurrentMaxVersion(workflow));
  }

  @Test
  void loadMigrationsFallsBackToRunningEverythingWhenMigrationLookupFails() throws Exception {
    Path nativeRoot = Files.createDirectories(tempDir.resolve("native"));
    createMigrationDir(nativeRoot, "1.0.0", "SELECT 1;");
    createMigrationDir(nativeRoot, "1.1.0", "SELECT 2;");
    when(migrationDAO.getMigrationVersions()).thenThrow(new IllegalStateException("missing table"));

    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi, nativeRoot.toString(), ConnectionType.POSTGRES, null, null, config, false);

    workflow.loadMigrations();

    assertEquals(List.of("1.0.0", "1.1.0"), getMigrationVersions(workflow));
    assertEquals(Optional.empty(), getCurrentMaxVersion(workflow));
  }

  @Test
  void validateMigrationsForServerReflectsPendingState() throws Exception {
    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi, tempDir.toString(), ConnectionType.POSTGRES, null, null, config, false);

    setMigrations(workflow, List.of(mock(MigrationProcess.class)));
    assertThrows(IllegalStateException.class, workflow::validateMigrationsForServer);

    setMigrations(workflow, List.of());
    assertDoesNotThrow(workflow::validateMigrationsForServer);
  }

  @Test
  void prePopulateFlywayMigrationSqlLogsImportsEachStatementOnce() throws Exception {
    Path flywayRoot = Files.createDirectories(tempDir.resolve("flyway"));
    Path postgresDir = Files.createDirectories(flywayRoot.resolve("org.postgresql.Driver"));
    Files.writeString(
        postgresDir.resolve("v001__baseline.sql"),
        "CREATE TABLE sample(id INTEGER);\nINSERT INTO sample VALUES (1);");

    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi,
            tempDir.resolve("native").toString(),
            ConnectionType.POSTGRES,
            null,
            flywayRoot.toString(),
            config,
            false);

    when(migrationDAO.checkIfQueryPreviouslyRan(anyString())).thenReturn(null);

    invokePrivate(workflow, "prePopulateFlywayMigrationSQLLogs");

    verify(migrationDAO)
        .upsertServerMigrationSQL(eq("0.0.1"), eq("CREATE TABLE sample(id INTEGER)"), anyString());
    verify(migrationDAO)
        .upsertServerMigrationSQL(eq("0.0.1"), eq("INSERT INTO sample VALUES (1)"), anyString());
  }

  @Test
  void migrateFlywayToServerChangeLogsSkipsWhenAlreadyMigrated() throws Exception {
    when(handle.createQuery(anyString()).mapTo(Integer.class).one()).thenReturn(1);

    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi,
            tempDir.resolve("native").toString(),
            ConnectionType.POSTGRES,
            null,
            tempDir.resolve("flyway").toString(),
            config,
            false);

    invokePrivate(workflow, "migrateFlywayToServerChangeLogs");

    verify(handle, never()).createUpdate(anyString());
  }

  @Test
  void runMigrationWorkflowsExecutesStepsAndPersistsMetrics() throws Exception {
    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi,
            tempDir.resolve("native").toString(),
            ConnectionType.POSTGRES,
            null,
            null,
            config,
            false);
    MigrationProcess process = mock(MigrationProcess.class);
    when(process.getVersion()).thenReturn("1.1.0");
    when(process.getDatabaseConnectionType()).thenReturn("postgres");
    when(process.getMigrationsPath()).thenReturn("/tmp/1.1.0");
    when(process.runSchemaChanges(false))
        .thenReturn(Map.of("ALTER TABLE", new QueryStatus(QueryStatus.Status.SUCCESS, "ok")));
    when(process.runPostDDLScripts(false))
        .thenReturn(Map.of("CREATE INDEX", new QueryStatus(QueryStatus.Status.SUCCESS, "ok")));

    setMigrations(workflow, List.of(process));
    setCurrentMaxVersion(workflow, Optional.of("1.0.0"));

    try (var contextConstruction =
        mockConstruction(
            MigrationWorkflowContext.class,
            (contextMock, ignored) -> {
              HashMap<String, MigrationContext> contexts = new HashMap<>();
              when(contextMock.getMigrationContext()).thenReturn(contexts);
              doAnswer(
                      invocation -> {
                        String version = invocation.getArgument(0);
                        MigrationContext context = mock(MigrationContext.class);
                        when(context.getResults()).thenReturn(new HashMap<>());
                        contexts.put(version, context);
                        return null;
                      })
                  .when(contextMock)
                  .computeInitialContext(anyString());
              doAnswer(
                      invocation -> {
                        MigrationProcess invokedProcess = invocation.getArgument(0);
                        MigrationContext context = mock(MigrationContext.class);
                        HashMap<String, Long> results = new HashMap<>();
                        results.put("rows", 1L);
                        when(context.getResults()).thenReturn(results);
                        contexts.put(invokedProcess.getVersion(), context);
                        return null;
                      })
                  .when(contextMock)
                  .computeMigrationContext(any(MigrationProcess.class), anyBoolean());
            })) {
      workflow.runMigrationWorkflows(false);
    }

    verify(process).initialize(handle, jdbi);
    verify(process).runSchemaChanges(false);
    verify(process).runDataMigration();
    verify(process).runPostDDLScripts(false);
    verify(migrationDAO)
        .upsertServerMigration(eq("1.1.0"), eq("/tmp/1.1.0"), anyString(), anyString());
  }

  private void createMigrationDir(Path root, String version, String sql) throws Exception {
    Path postgresDir = Files.createDirectories(root.resolve(version).resolve("postgres"));
    Files.writeString(postgresDir.resolve("schemaChanges.sql"), sql);
    Files.writeString(postgresDir.resolve("postDataMigrationSQLScript.sql"), "");
  }

  @SuppressWarnings("unchecked")
  private List<String> getMigrationVersions(MigrationWorkflow workflow) throws Exception {
    Field field = MigrationWorkflow.class.getDeclaredField("migrations");
    field.setAccessible(true);
    List<MigrationProcess> migrations = (List<MigrationProcess>) field.get(workflow);
    return migrations.stream().map(MigrationProcess::getVersion).toList();
  }

  @SuppressWarnings("unchecked")
  private Optional<String> getCurrentMaxVersion(MigrationWorkflow workflow) throws Exception {
    Field field = MigrationWorkflow.class.getDeclaredField("currentMaxMigrationVersion");
    field.setAccessible(true);
    return (Optional<String>) field.get(workflow);
  }

  private void setMigrations(MigrationWorkflow workflow, List<MigrationProcess> migrations)
      throws Exception {
    Field field = MigrationWorkflow.class.getDeclaredField("migrations");
    field.setAccessible(true);
    field.set(workflow, migrations);
  }

  private void setCurrentMaxVersion(MigrationWorkflow workflow, Optional<String> version)
      throws Exception {
    Field field = MigrationWorkflow.class.getDeclaredField("currentMaxMigrationVersion");
    field.setAccessible(true);
    field.set(workflow, version);
  }

  private void invokePrivate(MigrationWorkflow workflow, String methodName) throws Exception {
    Method method = MigrationWorkflow.class.getDeclaredMethod(methodName);
    method.setAccessible(true);
    method.invoke(workflow);
  }
}
