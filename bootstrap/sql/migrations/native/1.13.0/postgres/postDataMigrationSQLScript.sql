UPDATE ingestion_pipeline_entity
SET json = (json::jsonb #- '{sourceConfig,config,computeMetrics}')::json
WHERE json::jsonb -> 'sourceConfig' -> 'config' -> 'computeMetrics' IS NOT NULL
AND pipelineType = 'profiler';

-- Soft-delete Iceberg database service instances (connector removed)
UPDATE dbservice_entity
SET json = json || '{"deleted": true}'::jsonb
WHERE serviceType = 'Iceberg'
  AND (json ->> 'deleted' IS NULL OR json ->> 'deleted' = 'false');

-- Soft-delete ingestion pipelines orphaned by the Iceberg service removal
UPDATE ingestion_pipeline_entity
SET json = (json::jsonb || '{"deleted": true}'::jsonb)::json
WHERE json::jsonb -> 'service' ->> 'type' = 'databaseService'
  AND (json::jsonb -> 'service' ->> 'id') IN (
    SELECT id FROM dbservice_entity WHERE serviceType = 'Iceberg'
  );
