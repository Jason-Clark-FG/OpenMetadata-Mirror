UPDATE ingestion_pipeline_entity
SET json = JSON_REMOVE(json, '$.sourceConfig.config.computeMetrics')
WHERE JSON_EXTRACT(json, '$.sourceConfig.config.computeMetrics') IS NOT NULL
AND pipelineType = 'profiler';

WITH RECURSIVE
field_changes AS (
    SELECT e.id, e.extension, jt.field_name
    FROM entity_extension AS e
    JOIN JSON_TABLE(
        COALESCE(JSON_EXTRACT(e.json, '$.changeDescription.fieldsAdded'), JSON_ARRAY()),
        '$[*]' COLUMNS (field_name VARCHAR(1024) PATH '$.name')
    ) AS jt ON TRUE
    WHERE e.extension LIKE '%.version.%'

    UNION ALL

    SELECT e.id, e.extension, jt.field_name
    FROM entity_extension AS e
    JOIN JSON_TABLE(
        COALESCE(JSON_EXTRACT(e.json, '$.changeDescription.fieldsUpdated'), JSON_ARRAY()),
        '$[*]' COLUMNS (field_name VARCHAR(1024) PATH '$.name')
    ) AS jt ON TRUE
    WHERE e.extension LIKE '%.version.%'

    UNION ALL

    SELECT e.id, e.extension, jt.field_name
    FROM entity_extension AS e
    JOIN JSON_TABLE(
        COALESCE(JSON_EXTRACT(e.json, '$.changeDescription.fieldsDeleted'), JSON_ARRAY()),
        '$[*]' COLUMNS (field_name VARCHAR(1024) PATH '$.name')
    ) AS jt ON TRUE
    WHERE e.extension LIKE '%.version.%'
),
suffixes AS (
    SELECT id, extension, field_name AS suffix
    FROM field_changes
    WHERE field_name IS NOT NULL
      AND field_name <> ''

    UNION ALL

    SELECT id, extension, SUBSTRING(suffix, LOCATE('.', suffix) + 1)
    FROM suffixes
    WHERE LOCATE('.', suffix) > 0
),
distinct_suffixes AS (
    SELECT DISTINCT id, extension, suffix
    FROM suffixes
),
version_metadata AS (
    SELECT
        e.id,
        e.extension,
        CAST(SUBSTRING_INDEX(e.extension, '.version.', -1) AS DOUBLE) AS version_num,
        CASE
            WHEN COUNT(ds.suffix) = 0 THEN JSON_ARRAY()
            ELSE JSON_ARRAYAGG(ds.suffix)
        END AS changed_field_keys
    FROM entity_extension AS e
    LEFT JOIN distinct_suffixes AS ds
        ON ds.id = e.id AND ds.extension = e.extension
    WHERE e.extension LIKE '%.version.%'
    GROUP BY e.id, e.extension
)
UPDATE entity_extension AS e
JOIN version_metadata AS vm
    ON vm.id = e.id AND vm.extension = e.extension
SET e.versionNum = vm.version_num,
    e.changedFieldKeys = vm.changed_field_keys;
