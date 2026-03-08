package org.openmetadata.service.migration.utils.v1130;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.Handle;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.locator.ConnectionType;
import org.openmetadata.service.util.EntityUtil;
import org.openmetadata.service.util.VersionFieldChangeUtil;

@Slf4j
public class MigrationUtil {
  private static final int BATCH_SIZE = 500;
  private static final String MYSQL_SELECT_VERSION_HISTORY =
      "SELECT id, extension, CAST(json AS CHAR) AS json "
          + "FROM entity_extension "
          + "WHERE extension LIKE :extensionPattern "
          + "AND (:lastId = '' OR id > :lastId OR (id = :lastId AND extension > :lastExtension)) "
          + "ORDER BY id ASC, extension ASC "
          + "LIMIT :limit";
  private static final String POSTGRES_SELECT_VERSION_HISTORY =
      "SELECT id, extension, CAST(json AS TEXT) AS json "
          + "FROM entity_extension "
          + "WHERE extension LIKE :extensionPattern "
          + "AND (:lastId = '' OR id > :lastId OR (id = :lastId AND extension > :lastExtension)) "
          + "ORDER BY id ASC, extension ASC "
          + "LIMIT :limit";

  private final Handle handle;
  private final ConnectionType connectionType;
  private final CollectionDAO.EntityExtensionDAO entityExtensionDAO;

  public MigrationUtil(Handle handle, ConnectionType connectionType) {
    this.handle = handle;
    this.connectionType = connectionType;
    this.entityExtensionDAO = handle.attach(CollectionDAO.class).entityExtensionDAO();
  }

  public void backfillVersionFieldChanges() {
    String lastId = "";
    String lastExtension = "";
    int processedVersions = 0;
    int updatedRows = 0;

    while (true) {
      List<Map<String, Object>> rows =
          handle
              .createQuery(
                  connectionType == ConnectionType.MYSQL
                      ? MYSQL_SELECT_VERSION_HISTORY
                      : POSTGRES_SELECT_VERSION_HISTORY)
              .bind("extensionPattern", "%.version.%")
              .bind("lastId", lastId)
              .bind("lastExtension", lastExtension)
              .bind("limit", BATCH_SIZE)
              .mapToMap()
              .list();

      if (rows.isEmpty()) {
        break;
      }

      List<VersionFieldChangeUtil.VersionExtensionMetadata> versionExtensionMetadata =
          new ArrayList<>();
      for (Map<String, Object> row : rows) {
        String id = row.get("id").toString();
        String extension = row.get("extension").toString();
        String json = row.get("json").toString();
        versionExtensionMetadata.add(
            new VersionFieldChangeUtil.VersionExtensionMetadata(
                java.util.UUID.fromString(id),
                extension,
                EntityUtil.getVersion(extension),
                VersionFieldChangeUtil.getChangedFieldKeysJson(json)));
      }

      if (!versionExtensionMetadata.isEmpty()) {
        entityExtensionDAO.updateVersionExtensionMetadata(versionExtensionMetadata);
        updatedRows += versionExtensionMetadata.size();
      }

      Map<String, Object> lastRow = rows.get(rows.size() - 1);
      lastId = lastRow.get("id").toString();
      lastExtension = lastRow.get("extension").toString();
      processedVersions += rows.size();
    }

    LOG.info(
        "Backfilled {} version history rows and updated {} searchable metadata rows on entity_extension",
        processedVersions,
        updatedRows);
  }
}
