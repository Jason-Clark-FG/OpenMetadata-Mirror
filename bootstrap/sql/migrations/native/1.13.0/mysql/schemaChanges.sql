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

ALTER TABLE entity_extension
  ADD COLUMN versionNum DOUBLE NULL,
  ADD COLUMN changedFieldKeys JSON NULL;

CREATE INDEX idx_entity_extension_version_order
  ON entity_extension (id, versionNum);

CREATE INDEX idx_entity_extension_changed_field_keys
  ON entity_extension ((CAST(changedFieldKeys->'$' AS CHAR(512) ARRAY)));
