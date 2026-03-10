UPDATE ingestion_pipeline_entity
SET json = (json::jsonb #- '{sourceConfig,config,computeMetrics}')::json
WHERE json::jsonb -> 'sourceConfig' -> 'config' -> 'computeMetrics' IS NOT NULL
AND pipelineType = 'profiler';

-- Soft-delete Iceberg database service instances (connector removed)
UPDATE dbservice_entity
SET json = json || '{"deleted": true}'::jsonb
WHERE serviceType = 'Iceberg'
  AND (json ->> 'deleted' IS NULL OR json ->> 'deleted' = 'false');
