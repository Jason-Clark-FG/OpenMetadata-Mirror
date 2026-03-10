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
UPDATE ingestion_pipeline_entity ipe
SET json = (ipe.json::jsonb || '{"deleted": true}'::jsonb)::json
FROM dbservice_entity dse
WHERE dse.serviceType = 'Iceberg'
  AND ipe.json::jsonb -> 'service' ->> 'type' = 'databaseService'
  AND ipe.json::jsonb -> 'service' ->> 'id' = dse.id;
