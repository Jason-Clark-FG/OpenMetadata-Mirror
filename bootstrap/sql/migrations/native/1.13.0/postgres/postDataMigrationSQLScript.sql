UPDATE ingestion_pipeline_entity
SET json = (json::jsonb #- '{sourceConfig,config,computeMetrics}')::json
WHERE json::jsonb -> 'sourceConfig' -> 'config' -> 'computeMetrics' IS NOT NULL
AND pipelineType = 'profiler';

-- Add Container permissions to AutoClassificationBotPolicy for storage auto-classification support
UPDATE policy_entity
SET json = jsonb_insert(
    json::jsonb,
    '{rules,1}',
    jsonb_build_object(
        'name', 'AutoClassificationBotRule-Allow-Container',
        'description', 'Allow adding tags and sample data to the containers',
        'resources', jsonb_build_array('Container'),
        'operations', jsonb_build_array('EditAll', 'ViewAll'),
        'effect', 'allow'
    )
)
WHERE json->>'name' = 'AutoClassificationBotPolicy'
  AND (json->'rules'->1->>'name' IS NULL OR json->'rules'->1->>'name' != 'AutoClassificationBotRule-Allow-Container');
