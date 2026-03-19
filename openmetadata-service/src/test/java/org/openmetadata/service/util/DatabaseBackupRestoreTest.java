package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class DatabaseBackupRestoreTest {

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
}
