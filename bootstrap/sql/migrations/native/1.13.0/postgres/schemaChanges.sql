-- Rename 'preview' to 'enabled' in apps, inverting the boolean value
-- preview=false (can be used) becomes enabled=true, preview=true becomes enabled=false
UPDATE apps_marketplace
SET json = (json - 'preview') || jsonb_build_object(
    'enabled',
    CASE
        WHEN json -> 'preview' = 'null'::jsonb THEN true
        WHEN (json -> 'preview')::boolean = true THEN false
        ELSE true
    END
)
WHERE jsonb_exists(json, 'preview');

UPDATE installed_apps
SET json = (json - 'preview') || jsonb_build_object(
    'enabled',
    CASE
        WHEN json -> 'preview' = 'null'::jsonb THEN true
        WHEN (json -> 'preview')::boolean = true THEN false
        ELSE true
    END
)
WHERE jsonb_exists(json, 'preview');

ALTER TABLE entity_extension
  ADD COLUMN IF NOT EXISTS versionNum DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS changedFieldKeys JSONB;

CREATE INDEX IF NOT EXISTS idx_entity_extension_version_order
  ON entity_extension (id, versionNum DESC)
  WHERE versionNum IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_extension_changed_field_keys
  ON entity_extension USING GIN (changedFieldKeys)
  WHERE changedFieldKeys IS NOT NULL;
