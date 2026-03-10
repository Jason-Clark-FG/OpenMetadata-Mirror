UPDATE ingestion_pipeline_entity
SET json = JSON_REMOVE(json, '$.sourceConfig.config.computeMetrics')
WHERE JSON_EXTRACT(json, '$.sourceConfig.config.computeMetrics') IS NOT NULL
AND pipelineType = 'profiler';

-- Soft-delete Iceberg database service instances (connector removed)
UPDATE dbservice_entity
SET json = JSON_SET(json, '$.deleted', CAST('true' AS JSON))
WHERE serviceType = 'Iceberg'
  AND (JSON_EXTRACT(json, '$.deleted') IS NULL OR JSON_EXTRACT(json, '$.deleted') = CAST('false' AS JSON));

-- Soft-delete ingestion pipelines orphaned by the Iceberg service removal
UPDATE ingestion_pipeline_entity ipe
JOIN dbservice_entity dse
  ON JSON_UNQUOTE(JSON_EXTRACT(ipe.json, '$.service.id')) = dse.id
SET ipe.json = JSON_SET(ipe.json, '$.deleted', CAST('true' AS JSON))
WHERE dse.serviceType = 'Iceberg'
  AND JSON_EXTRACT(ipe.json, '$.service.type') = 'databaseService';

