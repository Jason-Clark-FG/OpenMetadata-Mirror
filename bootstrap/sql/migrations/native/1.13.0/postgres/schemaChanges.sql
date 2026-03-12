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

-- Migrate apps_marketplace to new configuration structure
-- Add boundType and restructure configuration for apps that have old structure
UPDATE apps_marketplace
SET json = json || jsonb_build_object(
    'boundType', 'Global',
    'configuration', jsonb_build_object(
        'globalAppConfig', jsonb_build_object(
            'config', COALESCE(json -> 'appConfiguration', '{}'::jsonb),
            'schedule', json -> 'appSchedule',
            'privateConfig', json -> 'privateConfig'
        )
    )
)
WHERE jsonb_exists(json, 'appConfiguration')
   OR jsonb_exists(json, 'appSchedule');

-- Remove old fields from apps_marketplace
UPDATE apps_marketplace
SET json = json - 'appConfiguration' - 'appSchedule' - 'privateConfig'
WHERE jsonb_exists(json, 'appConfiguration')
   OR jsonb_exists(json, 'appSchedule')
   OR jsonb_exists(json, 'privateConfig');

-- Migrate installed_apps to new configuration structure
-- Add boundType and restructure configuration for apps that have old structure
UPDATE installed_apps
SET json = json || jsonb_build_object(
    'boundType', 'Global',
    'configuration', jsonb_build_object(
        'globalAppConfig', jsonb_build_object(
            'config', COALESCE(json -> 'appConfiguration', '{}'::jsonb),
            'schedule', json -> 'appSchedule',
            'privateConfig', json -> 'privateConfig'
        )
    )
)
WHERE jsonb_exists(json, 'appConfiguration')
   OR jsonb_exists(json, 'appSchedule');

-- Remove old fields from installed_apps
UPDATE installed_apps
SET json = json - 'appConfiguration' - 'appSchedule' - 'privateConfig'
WHERE jsonb_exists(json, 'appConfiguration')
   OR jsonb_exists(json, 'appSchedule')
   OR jsonb_exists(json, 'privateConfig');

-- Add boundType to any apps that still don't have it (safety fallback)
UPDATE apps_marketplace
SET json = jsonb_set(json, '{boundType}', '"Global"'::jsonb)
WHERE NOT jsonb_exists(json, 'boundType');

UPDATE installed_apps
SET json = jsonb_set(json, '{boundType}', '"Global"'::jsonb)
WHERE NOT jsonb_exists(json, 'boundType');

-- Add appBoundType virtual column to installed_apps table for fast querying by app type
ALTER TABLE installed_apps
ADD COLUMN IF NOT EXISTS appBoundType VARCHAR(256) GENERATED ALWAYS AS (json ->> 'boundType') STORED;

CREATE INDEX IF NOT EXISTS installed_apps_app_bound_type_index ON installed_apps(appBoundType);
