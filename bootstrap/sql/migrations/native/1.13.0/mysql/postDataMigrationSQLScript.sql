UPDATE ingestion_pipeline_entity
SET json = JSON_REMOVE(json, '$.sourceConfig.config.computeMetrics')
WHERE JSON_EXTRACT(json, '$.sourceConfig.config.computeMetrics') IS NOT NULL
AND pipelineType = 'profiler';

-- Soft-delete ingestion pipelines for Iceberg services (must run before service migration)
UPDATE ingestion_pipeline_entity ipe
JOIN dbservice_entity dse
  ON JSON_UNQUOTE(JSON_EXTRACT(ipe.json, '$.service.id')) = dse.id
SET ipe.json = JSON_SET(ipe.json, '$.deleted', CAST('true' AS JSON))
WHERE dse.serviceType = 'Iceberg'
  AND JSON_EXTRACT(ipe.json, '$.service.type') = 'databaseService';

-- Migrate Iceberg database services to CustomDatabase (connector removed)
-- serviceType is a GENERATED column derived from json, so only update json
UPDATE dbservice_entity
SET json = JSON_SET(
      json,
      '$.serviceType', 'CustomDatabase',
      '$.connection.config.type', 'CustomDatabase'
    )
WHERE serviceType = 'Iceberg';

