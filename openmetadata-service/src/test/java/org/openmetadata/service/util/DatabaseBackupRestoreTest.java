package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.openmetadata.service.jdbi3.locator.ConnectionType;

class DatabaseBackupRestoreTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void testExtractDatabaseNameMySQL() {
    assertEquals(
        "openmetadata_db",
        DatabaseBackupRestore.extractDatabaseName(
            "jdbc:mysql://localhost:3306/openmetadata_db?useSSL=false"));
  }

  @Test
  void testExtractDatabaseNamePostgres() {
    assertEquals(
        "openmetadata_db",
        DatabaseBackupRestore.extractDatabaseName(
            "jdbc:postgresql://localhost:5432/openmetadata_db?sslmode=disable"));
  }

  @Test
  void testExtractDatabaseNameNoParams() {
    assertEquals(
        "mydb", DatabaseBackupRestore.extractDatabaseName("jdbc:mysql://localhost:3306/mydb"));
  }

  @Test
  void testExtractDatabaseNameEmptyThrows() {
    assertThrows(
        IllegalArgumentException.class,
        () -> DatabaseBackupRestore.extractDatabaseName("jdbc:mysql://localhost:3306/"));
  }

  @Test
  void testQuoteIdentifierMySQL() {
    DatabaseBackupRestore mysqlInstance =
        new DatabaseBackupRestore(null, ConnectionType.MYSQL, "testdb");
    assertEquals("`foo`", mysqlInstance.quoteIdentifier("foo"));
  }

  @Test
  void testQuoteIdentifierPostgres() {
    DatabaseBackupRestore pgInstance =
        new DatabaseBackupRestore(null, ConnectionType.POSTGRES, "testdb");
    assertEquals("\"foo\"", pgInstance.quoteIdentifier("foo"));
  }

  @Test
  void testQuoteIdentifierMySQLWithEmbeddedBacktick() {
    DatabaseBackupRestore mysqlInstance =
        new DatabaseBackupRestore(null, ConnectionType.MYSQL, "testdb");
    assertEquals("`col``name`", mysqlInstance.quoteIdentifier("col`name"));
  }

  @Test
  void testQuoteIdentifierPostgresWithEmbeddedDoubleQuote() {
    DatabaseBackupRestore pgInstance =
        new DatabaseBackupRestore(null, ConnectionType.POSTGRES, "testdb");
    assertEquals("\"col\"\"name\"", pgInstance.quoteIdentifier("col\"name"));
  }

  @Test
  void testQuoteColumnsMySQL() {
    DatabaseBackupRestore mysqlInstance =
        new DatabaseBackupRestore(null, ConnectionType.MYSQL, "testdb");
    String result = mysqlInstance.quoteColumns(List.of("id", "name", "email"));
    assertEquals("`id`, `name`, `email`", result);
  }

  @Test
  void testQuoteColumnsPostgres() {
    DatabaseBackupRestore pgInstance =
        new DatabaseBackupRestore(null, ConnectionType.POSTGRES, "testdb");
    String result = pgInstance.quoteColumns(List.of("id", "name", "email"));
    assertEquals("\"id\", \"name\", \"email\"", result);
  }

  @Test
  void testQuoteColumnsSingleColumn() {
    DatabaseBackupRestore mysqlInstance =
        new DatabaseBackupRestore(null, ConnectionType.MYSQL, "testdb");
    assertEquals("`id`", mysqlInstance.quoteColumns(List.of("id")));
  }

  @Test
  void testReadBackupMetadataMissingThrows(@TempDir Path tempDir) throws IOException {
    Path archivePath = tempDir.resolve("no-metadata.tar.gz");
    try (FileOutputStream fos = new FileOutputStream(archivePath.toFile());
        BufferedOutputStream bos = new BufferedOutputStream(fos);
        GzipCompressorOutputStream gzos = new GzipCompressorOutputStream(bos);
        TarArchiveOutputStream taos = new TarArchiveOutputStream(gzos)) {
      byte[] content = "some data".getBytes(StandardCharsets.UTF_8);
      TarArchiveEntry entry = new TarArchiveEntry("tables/users.json");
      entry.setSize(content.length);
      taos.putArchiveEntry(entry);
      taos.write(content);
      taos.closeArchiveEntry();
    }

    IOException ex =
        assertThrows(
            IOException.class,
            () -> DatabaseBackupRestore.readBackupMetadata(archivePath.toString()));
    assertTrue(ex.getMessage().contains("metadata.json not found"));
  }

  @Test
  void testReadBackupMetadataSuccess(@TempDir Path tempDir) throws IOException {
    Path archivePath = tempDir.resolve("with-metadata.tar.gz");

    ObjectNode metadata = MAPPER.createObjectNode();
    metadata.put("timestamp", "2026-01-15T10:30:00Z");
    metadata.put("version", "1.6.0");
    metadata.put("databaseType", "MYSQL");
    metadata.put("databaseName", "openmetadata_db");

    byte[] metadataBytes = MAPPER.writeValueAsBytes(metadata);

    try (FileOutputStream fos = new FileOutputStream(archivePath.toFile());
        BufferedOutputStream bos = new BufferedOutputStream(fos);
        GzipCompressorOutputStream gzos = new GzipCompressorOutputStream(bos);
        TarArchiveOutputStream taos = new TarArchiveOutputStream(gzos)) {
      TarArchiveEntry entry = new TarArchiveEntry("metadata.json");
      entry.setSize(metadataBytes.length);
      taos.putArchiveEntry(entry);
      taos.write(metadataBytes);
      taos.closeArchiveEntry();
    }

    ObjectNode result = DatabaseBackupRestore.readBackupMetadata(archivePath.toString());
    assertNotNull(result);
    assertEquals("2026-01-15T10:30:00Z", result.get("timestamp").asText());
    assertEquals("1.6.0", result.get("version").asText());
    assertEquals("MYSQL", result.get("databaseType").asText());
    assertEquals("openmetadata_db", result.get("databaseName").asText());
  }

  @Test
  void testReadBackupMetadataRoundTrip(@TempDir Path tempDir) throws IOException {
    Path archivePath = tempDir.resolve("round-trip.tar.gz");

    ObjectNode tablesMetadata = MAPPER.createObjectNode();
    ObjectNode usersTable = MAPPER.createObjectNode();
    usersTable.putArray("columns").add("id").add("name").add("email");
    usersTable.putArray("binaryColumns");
    usersTable.put("rowCount", 42);
    tablesMetadata.set("users", usersTable);

    ObjectNode metadata = MAPPER.createObjectNode();
    metadata.put("timestamp", "2026-03-19T08:00:00Z");
    metadata.put("version", "1.6.0");
    metadata.put("databaseType", "POSTGRES");
    metadata.put("databaseName", "om_db");
    metadata.set("tables", tablesMetadata);

    byte[] metadataBytes = MAPPER.writeValueAsBytes(metadata);

    try (FileOutputStream fos = new FileOutputStream(archivePath.toFile());
        BufferedOutputStream bos = new BufferedOutputStream(fos);
        GzipCompressorOutputStream gzos = new GzipCompressorOutputStream(bos);
        TarArchiveOutputStream taos = new TarArchiveOutputStream(gzos)) {
      TarArchiveEntry entry = new TarArchiveEntry("metadata.json");
      entry.setSize(metadataBytes.length);
      taos.putArchiveEntry(entry);
      taos.write(metadataBytes);
      taos.closeArchiveEntry();
    }

    ObjectNode result = DatabaseBackupRestore.readBackupMetadata(archivePath.toString());
    assertNotNull(result);
    assertEquals("POSTGRES", result.get("databaseType").asText());
    assertEquals("om_db", result.get("databaseName").asText());

    ObjectNode resultTables = (ObjectNode) result.get("tables");
    assertNotNull(resultTables);
    assertNotNull(resultTables.get("users"));
    assertEquals(42, resultTables.get("users").get("rowCount").asInt());
    assertEquals(3, resultTables.get("users").get("columns").size());
    assertEquals("id", resultTables.get("users").get("columns").get(0).asText());
    assertEquals("name", resultTables.get("users").get("columns").get(1).asText());
    assertEquals("email", resultTables.get("users").get("columns").get(2).asText());
  }
}
