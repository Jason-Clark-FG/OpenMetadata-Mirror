-- Update system-defined glossary term relation type colors to match the design system.
-- The old colors were Ant Design palette values; the new colors match the frontend RELATION_META constants.
-- Each statement uses JSON_SEARCH to locate the named relation type by index, then JSON_SET to update its color.
-- REGEXP_REPLACE('[^0-9]', '') strips the "$[N]" path syntax returned by JSON_SEARCH down to the bare index N.

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'relatedTo')), '[^0-9]', ''), '].color'),
  '#1570ef')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'relatedTo') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'synonym')), '[^0-9]', ''), '].color'),
  '#b42318')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'synonym') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'antonym')), '[^0-9]', ''), '].color'),
  '#b54708')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'antonym') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'broader')), '[^0-9]', ''), '].color'),
  '#067647')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'broader') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'narrower')), '[^0-9]', ''), '].color'),
  '#4e5ba6')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'narrower') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'partOf')), '[^0-9]', ''), '].color'),
  '#026aa2')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'partOf') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'hasPart')), '[^0-9]', ''), '].color'),
  '#155eef')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'hasPart') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'calculatedFrom')), '[^0-9]', ''), '].color'),
  '#6938ef')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'calculatedFrom') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'usedToCalculate')), '[^0-9]', ''), '].color'),
  '#ba24d5')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'usedToCalculate') IS NOT NULL;

UPDATE openmetadata_settings
SET json = JSON_SET(json,
  CONCAT('$.relationTypes[', REGEXP_REPLACE(JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'seeAlso')), '[^0-9]', ''), '].color'),
  '#c11574')
WHERE configType = 'glossaryTermRelationSettings'
  AND JSON_SEARCH(JSON_EXTRACT(json, '$.relationTypes[*].name'), 'one', 'seeAlso') IS NOT NULL;
