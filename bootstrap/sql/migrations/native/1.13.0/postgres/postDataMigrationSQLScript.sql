UPDATE ingestion_pipeline_entity
SET json = (json::jsonb #- '{sourceConfig,config,computeMetrics}')::json
WHERE json::jsonb -> 'sourceConfig' -> 'config' -> 'computeMetrics' IS NOT NULL
AND pipelineType = 'profiler';

-- Soft-delete ingestion pipelines for Iceberg services (must run before service migration)
UPDATE ingestion_pipeline_entity ipe
SET json = (ipe.json::jsonb || '{"deleted": true}'::jsonb)::json
FROM dbservice_entity dse
WHERE dse.serviceType = 'Iceberg'
  AND ipe.json::jsonb -> 'service' ->> 'type' = 'databaseService'
  AND ipe.json::jsonb -> 'service' ->> 'id' = dse.id;

-- Migrate Iceberg database services to CustomDatabase (connector removed)
UPDATE dbservice_entity
SET serviceType = 'CustomDatabase',
    json = jsonb_set(
      jsonb_set(
        json::jsonb,
        '{serviceType}', '"CustomDatabase"'
      ),
      '{connection,config,type}', '"CustomDatabase"'
    )::json
WHERE serviceType = 'Iceberg';
