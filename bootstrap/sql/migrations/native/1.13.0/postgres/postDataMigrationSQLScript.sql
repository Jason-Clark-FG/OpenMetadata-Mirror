UPDATE ingestion_pipeline_entity
SET json = (json::jsonb #- '{sourceConfig,config,computeMetrics}')::json
WHERE json::jsonb -> 'sourceConfig' -> 'config' -> 'computeMetrics' IS NOT NULL
AND pipelineType = 'profiler';

WITH version_metadata AS (
    SELECT
        e.id,
        e.extension,
        split_part(e.extension, '.version.', 2)::DOUBLE PRECISION AS version_num,
        COALESCE(
            (
                SELECT jsonb_agg(suffix ORDER BY suffix)
                FROM (
                    SELECT DISTINCT
                        array_to_string(
                            ARRAY(
                                SELECT part
                                FROM unnest(field_paths.path_parts) WITH ORDINALITY AS parts(part, ord)
                                WHERE ord >= indexes.path_index
                                ORDER BY ord
                            ),
                            '.'
                        ) AS suffix
                    FROM (
                        SELECT string_to_array(field_name, '.') AS path_parts
                        FROM (
                            SELECT field_change ->> 'name' AS field_name
                            FROM jsonb_array_elements(
                                COALESCE(e.json -> 'changeDescription' -> 'fieldsAdded', '[]'::jsonb)
                            ) AS field_change
                            UNION ALL
                            SELECT field_change ->> 'name' AS field_name
                            FROM jsonb_array_elements(
                                COALESCE(e.json -> 'changeDescription' -> 'fieldsUpdated', '[]'::jsonb)
                            ) AS field_change
                            UNION ALL
                            SELECT field_change ->> 'name' AS field_name
                            FROM jsonb_array_elements(
                                COALESCE(e.json -> 'changeDescription' -> 'fieldsDeleted', '[]'::jsonb)
                            ) AS field_change
                        ) AS field_changes
                        WHERE field_name IS NOT NULL
                          AND field_name <> ''
                    ) AS field_paths
                    CROSS JOIN LATERAL generate_subscripts(field_paths.path_parts, 1) AS indexes(path_index)
                ) AS suffixes
            ),
            '[]'::jsonb
        ) AS changed_field_keys
    FROM entity_extension AS e
    WHERE e.extension LIKE '%.version.%'
)
UPDATE entity_extension AS e
SET versionNum = version_metadata.version_num,
    changedFieldKeys = version_metadata.changed_field_keys
FROM version_metadata
WHERE e.id = version_metadata.id
  AND e.extension = version_metadata.extension;
