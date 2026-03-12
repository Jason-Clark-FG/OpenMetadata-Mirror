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

-- Migrate apps_marketplace to new configuration structure
-- Add boundType and restructure configuration for apps that have old structure
UPDATE apps_marketplace
SET json = JSON_SET(
    json,
    '$.boundType', 'Global',
    '$.configuration', JSON_OBJECT(
        'globalAppConfig', JSON_OBJECT(
            'config', COALESCE(JSON_EXTRACT(json, '$.appConfiguration'), JSON_OBJECT()),
            'schedule', JSON_EXTRACT(json, '$.appSchedule'),
            'privateConfig', JSON_EXTRACT(json, '$.privateConfig')
        )
    )
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.appConfiguration')
   OR JSON_CONTAINS_PATH(json, 'one', '$.appSchedule');

-- Remove old fields from apps_marketplace
UPDATE apps_marketplace
SET json = JSON_REMOVE(json, '$.appConfiguration', '$.appSchedule', '$.privateConfig')
WHERE JSON_CONTAINS_PATH(json, 'one', '$.appConfiguration')
   OR JSON_CONTAINS_PATH(json, 'one', '$.appSchedule')
   OR JSON_CONTAINS_PATH(json, 'one', '$.privateConfig');

-- Migrate installed_apps to new configuration structure
-- Add boundType and restructure configuration for apps that have old structure
UPDATE installed_apps
SET json = JSON_SET(
    json,
    '$.boundType', 'Global',
    '$.configuration', JSON_OBJECT(
        'globalAppConfig', JSON_OBJECT(
            'config', COALESCE(JSON_EXTRACT(json, '$.appConfiguration'), JSON_OBJECT()),
            'schedule', JSON_EXTRACT(json, '$.appSchedule'),
            'privateConfig', JSON_EXTRACT(json, '$.privateConfig')
        )
    )
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.appConfiguration')
   OR JSON_CONTAINS_PATH(json, 'one', '$.appSchedule');

-- Remove old fields from installed_apps
UPDATE installed_apps
SET json = JSON_REMOVE(json, '$.appConfiguration', '$.appSchedule', '$.privateConfig')
WHERE JSON_CONTAINS_PATH(json, 'one', '$.appConfiguration')
   OR JSON_CONTAINS_PATH(json, 'one', '$.appSchedule')
   OR JSON_CONTAINS_PATH(json, 'one', '$.privateConfig');

-- Add boundType to any apps that still don't have it (safety fallback)
UPDATE apps_marketplace
SET json = JSON_SET(json, '$.boundType', 'Global')
WHERE NOT JSON_CONTAINS_PATH(json, 'one', '$.boundType');

UPDATE installed_apps
SET json = JSON_SET(json, '$.boundType', 'Global')
WHERE NOT JSON_CONTAINS_PATH(json, 'one', '$.boundType');

-- Add appBoundType virtual column to installed_apps table for fast querying by app type
ALTER TABLE installed_apps
ADD COLUMN IF NOT EXISTS appBoundType VARCHAR(256) GENERATED ALWAYS AS (json ->> '$.boundType') STORED;

CREATE INDEX IF NOT EXISTS installed_apps_app_bound_type_index ON installed_apps(appBoundType);
