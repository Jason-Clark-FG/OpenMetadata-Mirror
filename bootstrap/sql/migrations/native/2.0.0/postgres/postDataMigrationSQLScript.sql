-- Update system-defined glossary term relation type colors to match the design system.
-- The old colors were Ant Design palette values; the new colors match the frontend RELATION_META constants.
-- Each CTE finds the 0-based array index of the named relation type, then jsonb_set updates its color.

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'relatedTo'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#1570ef"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'synonym'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#b42318"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'antonym'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#b54708"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'broader'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#067647"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'narrower'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#4e5ba6"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'partOf'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#026aa2"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'hasPart'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#155eef"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'calculatedFrom'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#6938ef"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'usedToCalculate'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#ba24d5"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';

WITH idx AS (
  SELECT (t.idx - 1) AS i
  FROM openmetadata_settings,
    jsonb_array_elements(json::jsonb->'relationTypes') WITH ORDINALITY AS t(elem, idx)
  WHERE configtype = 'glossaryTermRelationSettings'
    AND elem->>'name' = 'seeAlso'
)
UPDATE openmetadata_settings
SET json = jsonb_set(json::jsonb, ('{relationTypes,' || idx.i || ',color}')::text[], '"#c11574"')
FROM idx
WHERE configtype = 'glossaryTermRelationSettings';
