UPDATE ingestion_pipeline_entity
SET json = JSON_REMOVE(json, '$.sourceConfig.config.computeMetrics')
WHERE JSON_EXTRACT(json, '$.sourceConfig.config.computeMetrics') IS NOT NULL
AND pipelineType = 'profiler';

-- Add Container permissions to AutoClassificationBotPolicy for storage auto-classification support
UPDATE policy_entity
SET json = JSON_INSERT(
    json,
    '$.rules[1]',
    JSON_OBJECT(
        'name', 'AutoClassificationBotRule-Allow-Container',
        'description', 'Allow adding tags and sample data to the containers',
        'resources', JSON_ARRAY('Container'),
        'operations', JSON_ARRAY('EditAll', 'ViewAll'),
        'effect', 'allow'
    )
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(json, '$.name')) = 'AutoClassificationBotPolicy'
  AND JSON_EXTRACT(json, '$.rules[1].name') != 'AutoClassificationBotRule-Allow-Container';
