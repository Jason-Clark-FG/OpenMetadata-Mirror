package org.openmetadata.it.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.ThreadLocalRandom;
import org.jdbi.v3.core.Jdbi;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.openmetadata.it.bootstrap.TestSuiteBootstrap;
import org.openmetadata.service.OpenMetadataApplicationConfig;
import org.openmetadata.service.jdbi3.locator.ConnectionType;
import org.openmetadata.service.migration.api.MigrationWorkflow;

class ContinuousMigrationIT {

  @TempDir Path tempDir;

  @Test
  void continuousMigrationReprocessesOnlyNewSql() throws Exception {
    ConnectionType connectionType = currentConnectionType();
    String version = "0.0." + ThreadLocalRandom.current().nextInt(9000, 9999);
    String tableName =
        "it_continuous_migration_"
            + Integer.toUnsignedString(ThreadLocalRandom.current().nextInt(), 36);
    Path nativeRoot = Files.createDirectories(tempDir.resolve("native"));
    writeMigrationFiles(
        nativeRoot, connectionType, version, "CREATE TABLE " + tableName + " (id INT);");

    Jdbi jdbi = TestSuiteBootstrap.getJdbi();

    try {
      runWorkflow(jdbi, nativeRoot, connectionType);
      assertTrue(columnExists(jdbi, connectionType, tableName, "id"));

      appendSchemaStatement(
          nativeRoot,
          connectionType,
          version,
          "ALTER TABLE " + tableName + " ADD COLUMN name VARCHAR(64);");

      runWorkflow(jdbi, nativeRoot, connectionType);

      assertTrue(columnExists(jdbi, connectionType, tableName, "id"));
      assertTrue(columnExists(jdbi, connectionType, tableName, "name"));
      assertEquals(1, countByVersion(jdbi, "SERVER_CHANGE_LOG", version));
      assertEquals(2, countByVersion(jdbi, "SERVER_MIGRATION_SQL_LOGS", version));
    } finally {
      cleanupArtifacts(jdbi, version, tableName);
    }
  }

  private void runWorkflow(Jdbi jdbi, Path nativeRoot, ConnectionType connectionType) {
    MigrationWorkflow workflow =
        new MigrationWorkflow(
            jdbi,
            nativeRoot.toString(),
            connectionType,
            null,
            "",
            new OpenMetadataApplicationConfig(),
            false);
    workflow.loadMigrations();
    workflow.runMigrationWorkflows(false);
  }

  private void writeMigrationFiles(
      Path nativeRoot, ConnectionType connectionType, String version, String schemaSql)
      throws Exception {
    Path dbDir =
        Files.createDirectories(
            nativeRoot
                .resolve(version)
                .resolve(connectionType == ConnectionType.MYSQL ? "mysql" : "postgres"));
    Files.writeString(dbDir.resolve("schemaChanges.sql"), schemaSql);
    Files.writeString(dbDir.resolve("postDataMigrationSQLScript.sql"), "");
  }

  private void appendSchemaStatement(
      Path nativeRoot, ConnectionType connectionType, String version, String schemaSql)
      throws Exception {
    Path schemaFile =
        nativeRoot
            .resolve(version)
            .resolve(connectionType == ConnectionType.MYSQL ? "mysql" : "postgres")
            .resolve("schemaChanges.sql");
    Files.writeString(schemaFile, System.lineSeparator() + schemaSql, StandardOpenOption.APPEND);
  }

  private boolean columnExists(
      Jdbi jdbi, ConnectionType connectionType, String tableName, String columnName) {
    String query =
        connectionType == ConnectionType.MYSQL
            ? "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :tableName AND column_name = :columnName"
            : "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :tableName AND column_name = :columnName";
    return jdbi.withHandle(
            handle ->
                handle
                    .createQuery(query)
                    .bind("tableName", tableName)
                    .bind("columnName", columnName)
                    .mapTo(Integer.class)
                    .one())
        == 1;
  }

  private int countByVersion(Jdbi jdbi, String tableName, String version) {
    return jdbi.withHandle(
        handle ->
            handle
                .createQuery("SELECT COUNT(*) FROM " + tableName + " WHERE version = :version")
                .bind("version", version)
                .mapTo(Integer.class)
                .one());
  }

  private void cleanupArtifacts(Jdbi jdbi, String version, String tableName) {
    jdbi.useHandle(
        handle -> {
          handle.execute("DROP TABLE IF EXISTS " + tableName);
          handle
              .createUpdate("DELETE FROM SERVER_MIGRATION_SQL_LOGS WHERE version = :version")
              .bind("version", version)
              .execute();
          handle
              .createUpdate("DELETE FROM SERVER_CHANGE_LOG WHERE version = :version")
              .bind("version", version)
              .execute();
        });
  }

  private ConnectionType currentConnectionType() {
    return "mysql".equalsIgnoreCase(System.getProperty("databaseType", "postgres"))
        ? ConnectionType.MYSQL
        : ConnectionType.POSTGRES;
  }
}
