package org.openmetadata.service.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import org.jdbi.v3.core.Handle;
import org.jdbi.v3.core.Jdbi;
import org.openmetadata.service.jdbi3.locator.ConnectionType;

@Slf4j
public class DatabaseBackupRestore {

  private static final int BATCH_SIZE = 1000;
  private static final ObjectMapper MAPPER =
      new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

  private final Jdbi jdbi;
  private final ConnectionType connectionType;
  private final String databaseName;

  public DatabaseBackupRestore(Jdbi jdbi, ConnectionType connectionType, String databaseName) {
    this.jdbi = jdbi;
    this.connectionType = connectionType;
    this.databaseName = databaseName;
  }

  public List<String> discoverTables(Handle handle) {
    String sql;
    if (connectionType == ConnectionType.MYSQL) {
      sql =
          "SELECT table_name FROM information_schema.tables "
              + "WHERE table_type = 'BASE TABLE' AND table_schema = :db ORDER BY table_name";
      return handle.createQuery(sql).bind("db", databaseName).mapTo(String.class).list();
    } else {
      sql =
          "SELECT table_name FROM information_schema.tables "
              + "WHERE table_type = 'BASE TABLE' AND table_schema = 'public' ORDER BY table_name";
      return handle.createQuery(sql).mapTo(String.class).list();
    }
  }

  public List<String> discoverColumns(Handle handle, String tableName) {
    String sql;
    if (connectionType == ConnectionType.MYSQL) {
      sql =
          "SELECT column_name FROM information_schema.columns "
              + "WHERE table_schema = :db AND table_name = :table "
              + "AND (extra NOT LIKE '%GENERATED%' OR extra IS NULL) "
              + "ORDER BY ordinal_position";
      return handle
          .createQuery(sql)
          .bind("db", databaseName)
          .bind("table", tableName)
          .mapTo(String.class)
          .list();
    } else {
      sql =
          "SELECT column_name FROM information_schema.columns "
              + "WHERE table_schema = 'public' AND table_name = :table "
              + "AND (is_generated = 'NEVER' OR is_generated IS NULL) "
              + "AND (column_default NOT LIKE 'nextval%' OR column_default IS NULL) "
              + "ORDER BY ordinal_position";
      return handle.createQuery(sql).bind("table", tableName).mapTo(String.class).list();
    }
  }

  public static String extractDatabaseName(String jdbcUrl) {
    String url = jdbcUrl;
    int questionMark = url.indexOf('?');
    if (questionMark > 0) {
      url = url.substring(0, questionMark);
    }
    int lastSlash = url.lastIndexOf('/');
    if (lastSlash < 0 || lastSlash == url.length() - 1) {
      throw new IllegalArgumentException("Cannot extract database name from JDBC URL: " + jdbcUrl);
    }
    String dbName = url.substring(lastSlash + 1);
    if (dbName.isEmpty()) {
      throw new IllegalArgumentException("Cannot extract database name from JDBC URL: " + jdbcUrl);
    }
    return dbName;
  }

  public void backup(String backupPath) throws IOException {
    LOG.info("Starting database backup to {}", backupPath);
    try (FileOutputStream fos = new FileOutputStream(backupPath);
        BufferedOutputStream bos = new BufferedOutputStream(fos);
        GzipCompressorOutputStream gzos = new GzipCompressorOutputStream(bos);
        TarArchiveOutputStream taos = new TarArchiveOutputStream(gzos)) {

      taos.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);

      ObjectNode metadata = MAPPER.createObjectNode();
      metadata.put("timestamp", Instant.now().toString());
      metadata.put("version", System.getProperty("project.version", "unknown"));
      metadata.put("databaseType", connectionType.name());
      metadata.put("databaseName", databaseName);
      ObjectNode tablesMetadata = MAPPER.createObjectNode();

      jdbi.useHandle(
          handle -> {
            List<String> tables = discoverTables(handle);
            LOG.info("Discovered {} tables", tables.size());

            for (String tableName : tables) {
              backupTable(handle, tableName, taos, tablesMetadata);
            }
          });

      metadata.set("tables", tablesMetadata);
      byte[] metadataBytes = MAPPER.writeValueAsBytes(metadata);
      TarArchiveEntry metadataEntry = new TarArchiveEntry("metadata.json");
      metadataEntry.setSize(metadataBytes.length);
      taos.putArchiveEntry(metadataEntry);
      taos.write(metadataBytes);
      taos.closeArchiveEntry();

      LOG.info("Backup completed successfully");
    }
  }

  private void backupTable(
      Handle handle, String tableName, TarArchiveOutputStream taos, ObjectNode tablesMetadata)
      throws IOException {
    List<String> columns = discoverColumns(handle, tableName);
    if (columns.isEmpty()) {
      LOG.warn("No columns found for table {}, skipping", tableName);
      return;
    }

    String quotedColumns = quoteColumns(columns);
    String quotedTable = quoteIdentifier(tableName);

    int offset = 0;
    ArrayNode allRows = MAPPER.createArrayNode();

    while (true) {
      String sql =
          String.format(
              "SELECT %s FROM %s LIMIT %d OFFSET %d",
              quotedColumns, quotedTable, BATCH_SIZE, offset);
      List<Map<String, Object>> rows = handle.createQuery(sql).mapToMap().list();

      for (Map<String, Object> row : rows) {
        ObjectNode rowNode = MAPPER.createObjectNode();
        for (String col : columns) {
          Object val = row.get(col);
          if (val == null) {
            rowNode.putNull(col);
          } else if (val instanceof Number number) {
            if (val instanceof Long l) {
              rowNode.put(col, l);
            } else if (val instanceof Integer i) {
              rowNode.put(col, i);
            } else if (val instanceof Double d) {
              rowNode.put(col, d);
            } else if (val instanceof Float f) {
              rowNode.put(col, f);
            } else {
              rowNode.put(col, number.longValue());
            }
          } else if (val instanceof Boolean b) {
            rowNode.put(col, b);
          } else if (val instanceof byte[] bytes) {
            rowNode.put(col, bytes);
          } else {
            rowNode.put(col, val.toString());
          }
        }
        allRows.add(rowNode);
      }

      if (rows.size() < BATCH_SIZE) {
        break;
      }
      offset += BATCH_SIZE;
    }

    byte[] tableData = MAPPER.writeValueAsBytes(allRows);
    TarArchiveEntry entry = new TarArchiveEntry("tables/" + tableName + ".json");
    entry.setSize(tableData.length);
    taos.putArchiveEntry(entry);
    taos.write(tableData);
    taos.closeArchiveEntry();

    ObjectNode tableInfo = MAPPER.createObjectNode();
    ArrayNode columnsArray = MAPPER.createArrayNode();
    columns.forEach(columnsArray::add);
    tableInfo.set("columns", columnsArray);
    tableInfo.put("rowCount", allRows.size());
    tablesMetadata.set(tableName, tableInfo);

    LOG.info("Backed up table {} ({} rows, {} columns)", tableName, allRows.size(), columns.size());
  }

  public void restore(String backupPath, boolean force) throws IOException {
    LOG.info("Starting database restore from {}", backupPath);

    ObjectNode metadata = readMetadata(backupPath);
    String backupDbType = metadata.get("databaseType").asText();
    if (!backupDbType.equals(connectionType.name())) {
      throw new IllegalStateException(
          String.format(
              "Backup database type '%s' does not match current connection type '%s'",
              backupDbType, connectionType.name()));
    }

    LOG.info(
        "Backup info - version: {}, timestamp: {}, databaseType: {}",
        metadata.get("version").asText(),
        metadata.get("timestamp").asText(),
        backupDbType);

    ObjectNode tablesMetadata = (ObjectNode) metadata.get("tables");

    jdbi.useHandle(
        handle -> {
          if (force) {
            truncateAllTables(handle, tablesMetadata);
          } else {
            validateTablesEmpty(handle, tablesMetadata);
          }
        });

    try {
      jdbi.useHandle(this::disableForeignKeyChecks);
      restoreTablesFromArchive(backupPath, tablesMetadata);
      LOG.info("Restore completed successfully");
    } finally {
      jdbi.useHandle(this::enableForeignKeyChecks);
    }
  }

  private ObjectNode readMetadata(String backupPath) throws IOException {
    try (FileInputStream fis = new FileInputStream(backupPath);
        BufferedInputStream bis = new BufferedInputStream(fis);
        GzipCompressorInputStream gzis = new GzipCompressorInputStream(bis);
        TarArchiveInputStream tais = new TarArchiveInputStream(gzis)) {

      TarArchiveEntry entry;
      while ((entry = tais.getNextEntry()) != null) {
        if ("metadata.json".equals(entry.getName())) {
          byte[] content = tais.readAllBytes();
          return (ObjectNode) MAPPER.readTree(content);
        }
      }
    }
    throw new IOException("metadata.json not found in backup archive");
  }

  private void restoreTablesFromArchive(String backupPath, ObjectNode tablesMetadata)
      throws IOException {
    try (FileInputStream fis = new FileInputStream(backupPath);
        BufferedInputStream bis = new BufferedInputStream(fis);
        GzipCompressorInputStream gzis = new GzipCompressorInputStream(bis);
        TarArchiveInputStream tais = new TarArchiveInputStream(gzis)) {

      TarArchiveEntry entry;
      while ((entry = tais.getNextEntry()) != null) {
        String name = entry.getName();
        if (!name.startsWith("tables/") || !name.endsWith(".json")) {
          continue;
        }

        String tableName = name.substring("tables/".length(), name.length() - ".json".length());
        JsonNode tableMetaNode = tablesMetadata.get(tableName);
        if (tableMetaNode == null) {
          LOG.warn("No metadata found for table {}, skipping", tableName);
          continue;
        }

        List<String> columns = new ArrayList<>();
        tableMetaNode.get("columns").forEach(col -> columns.add(col.asText()));

        byte[] content = tais.readAllBytes();
        ArrayNode rows = (ArrayNode) MAPPER.readTree(content);

        if (rows.isEmpty()) {
          LOG.info("Table {} has no rows, skipping", tableName);
          continue;
        }

        LOG.info("Restoring table {} ({} rows)", tableName, rows.size());
        jdbi.useHandle(handle -> insertRows(handle, tableName, columns, rows));
      }
    }
  }

  private void validateTablesEmpty(Handle handle, ObjectNode tablesMetadata) {
    List<String> nonEmptyTables = new ArrayList<>();
    tablesMetadata
        .fieldNames()
        .forEachRemaining(
            tableName -> {
              String sql = String.format("SELECT COUNT(*) FROM %s", quoteIdentifier(tableName));
              int count = handle.createQuery(sql).mapTo(Integer.class).one();
              if (count > 0) {
                nonEmptyTables.add(tableName + " (" + count + " rows)");
              }
            });

    if (!nonEmptyTables.isEmpty()) {
      throw new IllegalStateException(
          "Cannot restore: the following tables are not empty. Use --force to truncate them: "
              + String.join(", ", nonEmptyTables));
    }
  }

  private void truncateAllTables(Handle handle, ObjectNode tablesMetadata) {
    LOG.info("Truncating all target tables (force mode)");
    disableForeignKeyChecks(handle);
    try {
      tablesMetadata
          .fieldNames()
          .forEachRemaining(
              tableName -> {
                String sql = String.format("TRUNCATE TABLE %s", quoteIdentifier(tableName));
                handle.execute(sql);
                LOG.info("Truncated table {}", tableName);
              });
    } finally {
      enableForeignKeyChecks(handle);
    }
  }

  void insertRows(Handle handle, String tableName, List<String> columns, ArrayNode rows) {
    String quotedColumns = quoteColumns(columns);
    String placeholders = columns.stream().map(c -> ":" + c).collect(Collectors.joining(", "));
    String sql =
        String.format(
            "INSERT INTO %s (%s) VALUES (%s)",
            quoteIdentifier(tableName), quotedColumns, placeholders);

    int totalRows = rows.size();
    for (int start = 0; start < totalRows; start += BATCH_SIZE) {
      int end = Math.min(start + BATCH_SIZE, totalRows);
      var batch = handle.prepareBatch(sql);
      for (int i = start; i < end; i++) {
        JsonNode row = rows.get(i);
        for (String col : columns) {
          JsonNode val = row.get(col);
          if (val == null || val.isNull()) {
            batch.bindNull(col, Types.VARCHAR);
          } else if (val.isNumber()) {
            if (val.isLong() || val.isInt() || val.isBigInteger()) {
              batch.bind(col, val.longValue());
            } else {
              batch.bind(col, val.doubleValue());
            }
          } else if (val.isBoolean()) {
            batch.bind(col, val.booleanValue());
          } else {
            batch.bind(col, val.asText());
          }
        }
        batch.add();
      }
      batch.execute();
    }
  }

  private void disableForeignKeyChecks(Handle handle) {
    if (connectionType == ConnectionType.MYSQL) {
      handle.execute("SET FOREIGN_KEY_CHECKS = 0");
    } else {
      handle.execute("SET session_replication_role = 'replica'");
    }
  }

  private void enableForeignKeyChecks(Handle handle) {
    if (connectionType == ConnectionType.MYSQL) {
      handle.execute("SET FOREIGN_KEY_CHECKS = 1");
    } else {
      handle.execute("SET session_replication_role = 'origin'");
    }
  }

  String quoteIdentifier(String identifier) {
    if (connectionType == ConnectionType.MYSQL) {
      return "`" + identifier + "`";
    }
    return "\"" + identifier + "\"";
  }

  String quoteColumns(List<String> columns) {
    return columns.stream().map(this::quoteIdentifier).collect(Collectors.joining(", "));
  }
}
