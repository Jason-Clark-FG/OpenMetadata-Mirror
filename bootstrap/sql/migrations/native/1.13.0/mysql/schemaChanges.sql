-- Rename 'preview' to 'enabled' in apps, inverting the boolean value
-- preview=false (can be used) becomes enabled=true, preview=true becomes enabled=false
UPDATE apps_marketplace
SET json = JSON_SET(
    JSON_REMOVE(json, '$.preview'),
    '$.enabled',
    CASE
        WHEN JSON_EXTRACT(json, '$.preview') = true THEN CAST('false' AS JSON)
        ELSE CAST('true' AS JSON)
    END
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.preview');

UPDATE installed_apps
SET json = JSON_SET(
    JSON_REMOVE(json, '$.preview'),
    '$.enabled',
    CASE
        WHEN JSON_EXTRACT(json, '$.preview') = true THEN CAST('false' AS JSON)
        ELSE CAST('true' AS JSON)
    END
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.preview');

SET @version_col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entity_extension' AND COLUMN_NAME = 'versionNum');
SET @sql = IF(@version_col_exists = 0,
  'ALTER TABLE entity_extension ADD COLUMN versionNum DOUBLE NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @changed_fields_col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entity_extension' AND COLUMN_NAME = 'changedFieldKeys');
SET @sql = IF(@changed_fields_col_exists = 0,
  'ALTER TABLE entity_extension ADD COLUMN changedFieldKeys JSON NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @version_index_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entity_extension' AND INDEX_NAME = 'idx_entity_extension_version_order');
SET @sql = IF(@version_index_exists = 0,
  'CREATE INDEX idx_entity_extension_version_order ON entity_extension (id, versionNum)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @changed_fields_index_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'entity_extension' AND INDEX_NAME = 'idx_entity_extension_changed_field_keys');
SET @sql = IF(@changed_fields_index_exists = 0,
  'CREATE INDEX idx_entity_extension_changed_field_keys ON entity_extension ((CAST(changedFieldKeys->''$'' AS CHAR(512) ARRAY)))',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
