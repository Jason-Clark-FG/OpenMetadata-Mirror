package org.openmetadata.service.util;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
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
import java.io.OutputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
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

  public static final int DEFAULT_BATCH_SIZE = 1000;
  private static final long MAX_METADATA_SIZE = 10 * 1024 * 1024;
  private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
  private static final ObjectMapper MAPPER =
      new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

  private final Jdbi jdbi;
  private final ConnectionType connectionType;
  private final String databaseName;
  private final int batchSize;

  public DatabaseBackupRestore(Jdbi jdbi, ConnectionType connectionType, String databaseName) {
    this(jdbi, connectionType, databaseName, DEFAULT_BATCH_SIZE);
  }

  public DatabaseBackupRestore(
      Jdbi jdbi, ConnectionType connectionType, String databaseName, int batchSize) {
    this.jdbi = jdbi;
    this.connectionType = connectionType;
    this.databaseName = databaseName;
    this.batchSize = batchSize;
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
              + "WHERE table_type = 'BASE TABLE' AND table_schema = current_schema() "
              + "ORDER BY table_name";
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
              + "WHERE table_schema = current_schema() AND table_name = :table "
              + "AND (is_generated = 'NEVER' OR is_generated IS NULL) "
              + "AND (column_default NOT LIKE 'nextval%' OR column_default IS NULL) "
              + "ORDER BY ordinal_position";
      return handle.createQuery(sql).bind("table", tableName).mapTo(String.class).list();
    }
  }

  List<String> discoverPrimaryKeyColumns(Handle handle, String tableName) {
    String sql;
    if (connectionType == ConnectionType.MYSQL) {
      sql =
          "SELECT kcu.column_name FROM information_schema.key_column_usage kcu "
              + "WHERE kcu.table_schema = :db AND kcu.table_name = :table "
              + "AND kcu.constraint_name = 'PRIMARY' "
              + "ORDER BY kcu.ordinal_position";
      return handle
          .createQuery(sql)
          .bind("db", databaseName)
          .bind("table", tableName)
          .mapTo(String.class)
          .list();
    } else {
      sql =
          "SELECT kcu.column_name "
              + "FROM information_schema.table_constraints tc "
              + "JOIN information_schema.key_column_usage kcu "
              + "ON tc.constraint_name = kcu.constraint_name "
              + "AND tc.table_schema = kcu.table_schema "
              + "WHERE tc.table_schema = current_schema() AND tc.table_name = :table "
              + "AND tc.constraint_type = 'PRIMARY KEY' "
              + "ORDER BY kcu.ordinal_position";
      return handle.createQuery(sql).bind("table", tableName).mapTo(String.class).list();
    }
  }

  Set<String> discoverBinaryColumns(Handle handle, String tableName) {
    String sql;
    if (connectionType == ConnectionType.MYSQL) {
      sql =
          "SELECT column_name FROM information_schema.columns "
              + "WHERE table_schema = :db AND table_name = :table "
              + "AND data_type IN ('blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary')";
      return new HashSet<>(
          handle
              .createQuery(sql)
              .bind("db", databaseName)
              .bind("table", tableName)
              .mapTo(String.class)
              .list());
    } else {
      sql =
          "SELECT column_name FROM information_schema.columns "
              + "WHERE table_schema = current_schema() AND table_name = :table "
              + "AND data_type = 'bytea'";
      return new HashSet<>(
          handle.createQuery(sql).bind("table", tableName).mapTo(String.class).list());
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
            beginRepeatableReadTransaction(handle);
            try {
              List<String> tables = discoverTables(handle);
              LOG.info("Discovered {} tables", tables.size());

              for (String tableName : tables) {
                backupTable(handle, tableName, taos, tablesMetadata);
              }
            } finally {
              commitTransaction(handle);
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

  private void beginRepeatableReadTransaction(Handle handle) {
    if (connectionType == ConnectionType.MYSQL) {
      handle.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      handle.execute("START TRANSACTION");
    } else {
      handle.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    }
  }

  private void commitTransaction(Handle handle) {
    handle.execute("COMMIT");
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

    List<String> pkColumns = discoverPrimaryKeyColumns(handle, tableName);
    String orderByClause = buildOrderByClause(pkColumns, columns);
    Set<String> binaryColumns = discoverBinaryColumns(handle, tableName);

    Path tempFile = Files.createTempFile("backup_" + tableName + "_", ".json");
    int rowCount;
    try {
      rowCount =
          writeTableToTempFile(
              handle, quotedColumns, quotedTable, orderByClause, columns, tempFile);
      addTempFileToTar(taos, tempFile, "tables/" + tableName + ".json");
    } finally {
      Files.deleteIfExists(tempFile);
    }

    ObjectNode tableInfo = MAPPER.createObjectNode();
    ArrayNode columnsArray = MAPPER.createArrayNode();
    columns.forEach(columnsArray::add);
    tableInfo.set("columns", columnsArray);
    ArrayNode binaryColumnsArray = MAPPER.createArrayNode();
    binaryColumns.forEach(binaryColumnsArray::add);
    tableInfo.set("binaryColumns", binaryColumnsArray);
    tableInfo.put("rowCount", rowCount);
    tablesMetadata.set(tableName, tableInfo);

    LOG.info("Backed up table {} ({} rows, {} columns)", tableName, rowCount, columns.size());
  }

  private String buildOrderByClause(List<String> pkColumns, List<String> allColumns) {
    List<String> orderColumns = pkColumns.isEmpty() ? List.of(allColumns.get(0)) : pkColumns;
    return " ORDER BY "
        + orderColumns.stream().map(this::quoteIdentifier).collect(Collectors.joining(", "));
  }

  private int writeTableToTempFile(
      Handle handle,
      String quotedColumns,
      String quotedTable,
      String orderByClause,
      List<String> columns,
      Path tempFile)
      throws IOException {
    int rowCount = 0;
    try (OutputStream os = new BufferedOutputStream(new FileOutputStream(tempFile.toFile()));
        JsonGenerator gen = new JsonFactory().createGenerator(os)) {
      gen.setCodec(MAPPER);
      gen.writeStartArray();

      int offset = 0;
      while (true) {
        String sql =
            String.format(
                "SELECT %s FROM %s%s LIMIT %d OFFSET %d",
                quotedColumns, quotedTable, orderByClause, batchSize, offset);
        List<Map<String, Object>> rows = handle.createQuery(sql).mapToMap().list();

        for (Map<String, Object> row : rows) {
          gen.writeStartObject();
          for (String col : columns) {
            Object val = row.get(col);
            if (val == null) {
              gen.writeNullField(col);
            } else if (val instanceof Number number) {
              if (number instanceof Long l) {
                gen.writeNumberField(col, l);
              } else if (number instanceof Integer i) {
                gen.writeNumberField(col, i);
              } else if (number instanceof Double d) {
                gen.writeNumberField(col, d);
              } else if (number instanceof Float f) {
                gen.writeNumberField(col, f);
              } else if (number instanceof BigDecimal bd) {
                gen.writeNumberField(col, bd);
              } else {
                gen.writeNumberField(col, number.longValue());
              }
            } else if (val instanceof Boolean b) {
              gen.writeBooleanField(col, b);
            } else if (val instanceof byte[] bytes) {
              gen.writeBinaryField(col, bytes);
            } else {
              gen.writeStringField(col, val.toString());
            }
          }
          gen.writeEndObject();
          rowCount++;
        }

        if (rows.size() < batchSize) {
          break;
        }
        offset += batchSize;
      }

      gen.writeEndArray();
    }
    return rowCount;
  }

  private void addTempFileToTar(TarArchiveOutputStream taos, Path tempFile, String entryName)
      throws IOException {
    long fileSize = Files.size(tempFile);
    TarArchiveEntry entry = new TarArchiveEntry(entryName);
    entry.setSize(fileSize);
    taos.putArchiveEntry(entry);

    try (FileInputStream fis = new FileInputStream(tempFile.toFile())) {
      fis.transferTo(taos);
    }
    taos.closeArchiveEntry();
  }

  public void restore(String backupPath, boolean force) throws IOException {
    LOG.info("Starting database restore from {}", backupPath);

    ObjectNode metadata = readBackupMetadata(backupPath);
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

    Set<String> validTables = new HashSet<>();
    tablesMetadata.fieldNames().forEachRemaining(validTables::add);

    jdbi.useHandle(
        handle -> {
          disableForeignKeyChecks(handle);
          try {
            if (force) {
              truncateAllTables(handle, tablesMetadata);
            } else {
              validateTablesEmpty(handle, tablesMetadata);
            }
            restoreTablesFromArchive(handle, backupPath, tablesMetadata, validTables);
            LOG.info("Restore completed successfully");
          } finally {
            enableForeignKeyChecks(handle);
          }
        });
  }

  public static ObjectNode readBackupMetadata(String backupPath) throws IOException {
    try (FileInputStream fis = new FileInputStream(backupPath);
        BufferedInputStream bis = new BufferedInputStream(fis);
        GzipCompressorInputStream gzis = new GzipCompressorInputStream(bis);
        TarArchiveInputStream tais = new TarArchiveInputStream(gzis)) {

      TarArchiveEntry entry;
      while ((entry = tais.getNextEntry()) != null) {
        if ("metadata.json".equals(entry.getName())) {
          if (entry.getSize() > MAX_METADATA_SIZE) {
            throw new IOException(
                "metadata.json exceeds maximum allowed size of " + MAX_METADATA_SIZE + " bytes");
          }
          byte[] content = tais.readNBytes((int) entry.getSize());
          return (ObjectNode) MAPPER.readTree(content);
        }
      }
    }
    throw new IOException("metadata.json not found in backup archive");
  }

  private void restoreTablesFromArchive(
      Handle handle, String backupPath, ObjectNode tablesMetadata, Set<String> validTables)
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

        if (!validTables.contains(tableName)) {
          LOG.warn("Table {} from archive not in metadata, skipping", tableName);
          continue;
        }

        JsonNode tableMetaNode = tablesMetadata.get(tableName);
        if (tableMetaNode == null) {
          LOG.warn("No metadata found for table {}, skipping", tableName);
          continue;
        }

        List<String> columns = new ArrayList<>();
        tableMetaNode.get("columns").forEach(col -> columns.add(col.asText()));

        Set<String> binaryColumns = new HashSet<>();
        JsonNode binaryColumnsNode = tableMetaNode.get("binaryColumns");
        if (binaryColumnsNode != null) {
          binaryColumnsNode.forEach(col -> binaryColumns.add(col.asText()));
        }

        LOG.info("Restoring table {}", tableName);
        int rowCount = insertRowsStreaming(handle, tableName, columns, binaryColumns, tais);
        LOG.info("Restored table {} ({} rows)", tableName, rowCount);
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
    tablesMetadata
        .fieldNames()
        .forEachRemaining(
            tableName -> {
              String sql = String.format("TRUNCATE TABLE %s", quoteIdentifier(tableName));
              handle.execute(sql);
              LOG.info("Truncated table {}", tableName);
            });
  }

  int insertRowsStreaming(
      Handle handle,
      String tableName,
      List<String> columns,
      Set<String> binaryColumns,
      TarArchiveInputStream tais)
      throws IOException {
    String quotedColumns = quoteColumns(columns);
    String placeholders = columns.stream().map(c -> "?").collect(Collectors.joining(", "));
    String sql =
        String.format(
            "INSERT INTO %s (%s) VALUES (%s)",
            quoteIdentifier(tableName), quotedColumns, placeholders);

    int totalRows = 0;
    try (JsonParser parser = new JsonFactory().createParser(tais)) {
      JsonToken token = parser.nextToken();
      if (token != JsonToken.START_ARRAY) {
        return 0;
      }

      var batch = handle.prepareBatch(sql);
      int batchCount = 0;

      while (parser.nextToken() != JsonToken.END_ARRAY) {
        ObjectNode row = MAPPER.readTree(parser);
        for (int idx = 0; idx < columns.size(); idx++) {
          String col = columns.get(idx);
          JsonNode val = row.get(col);
          if (val == null || val.isNull()) {
            batch.bind(idx, (Object) null);
          } else if (binaryColumns.contains(col)) {
            batch.bind(idx, Base64.getDecoder().decode(val.asText()));
          } else if (val.isNumber()) {
            if (val.isLong() || val.isInt() || val.isBigInteger()) {
              batch.bind(idx, val.longValue());
            } else {
              batch.bind(idx, val.doubleValue());
            }
          } else if (val.isBoolean()) {
            batch.bind(idx, val.booleanValue());
          } else {
            batch.bind(idx, val.asText());
          }
        }
        batch.add();
        batchCount++;
        totalRows++;

        if (batchCount >= batchSize) {
          batch.execute();
          batch = handle.prepareBatch(sql);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        batch.execute();
      }
    }
    return totalRows;
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
    if (!SAFE_IDENTIFIER.matcher(identifier).matches()) {
      throw new IllegalArgumentException("Invalid SQL identifier: " + identifier);
    }
    if (connectionType == ConnectionType.MYSQL) {
      return "`" + identifier + "`";
    }
    return "\"" + identifier + "\"";
  }

  String quoteColumns(List<String> columns) {
    return columns.stream().map(this::quoteIdentifier).collect(Collectors.joining(", "));
  }
}
