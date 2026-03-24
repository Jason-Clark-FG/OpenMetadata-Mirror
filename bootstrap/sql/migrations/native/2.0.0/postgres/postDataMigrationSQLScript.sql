-- Post data migration script for Task System Redesign - OpenMetadata 2.0.0
-- This script runs after the data migration completes

-- =====================================================
-- NOTE: Suggestion migration (suggestions → task_entity) and
-- thread-based task migration (thread_entity → task_entity)
-- are handled in Java MigrationUtil.migrateSuggestionsToTaskEntity()
-- and MigrationUtil.migrateThreadTasksToTaskEntity() because they
-- require proper aboutFqnHash computation using FullyQualifiedName.buildHash()
-- =====================================================

-- =====================================================
-- PHASE 2D: Migrate announcements from thread_entity → announcement_entity
-- =====================================================

INSERT INTO announcement_entity (id, json, fqnhash)
SELECT
  json->>'id' AS id,
  jsonb_build_object(
    'id', json->>'id',
    'name', 'announcement-' || (json->>'id'),
    'fullyQualifiedName', 'announcement-' || (json->>'id'),
    'description', COALESCE(
      json->'announcement'->>'description',
      json->>'message',
      ''
    ),
    'entityLink', json->>'about',
    'startTime', (json->'announcement'->>'startTime')::bigint,
    'endTime', (json->'announcement'->>'endTime')::bigint,
    'status', CASE
                WHEN (json->'announcement'->>'endTime')::bigint < (extract(epoch from now()) * 1000)::bigint
                  THEN 'Expired'
                WHEN (json->'announcement'->>'startTime')::bigint > (extract(epoch from now()) * 1000)::bigint
                  THEN 'Scheduled'
                ELSE 'Active'
              END,
    'createdBy', json->>'createdBy',
    'updatedBy', COALESCE(json->>'updatedBy', json->>'createdBy'),
    'createdAt', (json->>'threadTs')::bigint,
    'updatedAt', (json->>'updatedAt')::bigint,
    'deleted', false,
    'version', 0.1,
    'reactions', COALESCE(json->'reactions', '[]'::jsonb)
  ) AS json,
  md5('announcement-' || (json->>'id')) AS fqnhash
FROM thread_entity t
WHERE json->>'type' = 'Announcement'
AND NOT EXISTS (
  SELECT 1 FROM announcement_entity a WHERE a.id = t.json->>'id'
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PHASE 3D: Seed default TaskFormSchema entries
-- =====================================================

INSERT INTO task_form_schema_entity (id, json, fqnhash)
SELECT
  gen_random_uuid()::text AS id,
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'DescriptionSuggestion',
    'fullyQualifiedName', 'DescriptionSuggestion',
    'displayName', 'Description Suggestion',
    'taskType', 'Suggestion',
    'taskCategory', 'MetadataUpdate',
    'formSchema', jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('suggestedValue'),
      'properties', jsonb_build_object(
        'suggestedValue', jsonb_build_object('type', 'string', 'title', 'Suggested Description'),
        'reasoning', jsonb_build_object('type', 'string', 'title', 'Reason for suggestion')
      )
    ),
    'uiSchema', jsonb_build_object(
      'suggestedValue', jsonb_build_object('ui:widget', 'textarea'),
      'reasoning', jsonb_build_object('ui:widget', 'textarea')
    ),
    'version', 0.1,
    'updatedBy', 'system',
    'updatedAt', (extract(epoch from now()) * 1000)::bigint,
    'deleted', false
  ) AS json,
  md5('DescriptionSuggestion') AS fqnhash
WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('DescriptionSuggestion'))
UNION ALL
SELECT
  gen_random_uuid()::text,
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'TagSuggestion',
    'fullyQualifiedName', 'TagSuggestion',
    'displayName', 'Tag Suggestion',
    'taskType', 'Suggestion',
    'taskCategory', 'MetadataUpdate',
    'formSchema', jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('suggestedValue'),
      'properties', jsonb_build_object(
        'suggestedValue', jsonb_build_object('type', 'string', 'title', 'Suggested Tags (JSON)'),
        'reasoning', jsonb_build_object('type', 'string', 'title', 'Reason for suggestion')
      )
    ),
    'uiSchema', jsonb_build_object(
      'suggestedValue', jsonb_build_object('ui:widget', 'tagSelector'),
      'reasoning', jsonb_build_object('ui:widget', 'textarea')
    ),
    'version', 0.1,
    'updatedBy', 'system',
    'updatedAt', (extract(epoch from now()) * 1000)::bigint,
    'deleted', false
  ),
  md5('TagSuggestion')
WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('TagSuggestion'))
UNION ALL
SELECT
  gen_random_uuid()::text,
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'GlossaryApproval',
    'fullyQualifiedName', 'GlossaryApproval',
    'displayName', 'Glossary Approval',
    'taskType', 'GlossaryApproval',
    'taskCategory', 'Approval',
    'formSchema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'comment', jsonb_build_object('type', 'string', 'title', 'Approval Comment')
      )
    ),
    'uiSchema', jsonb_build_object(
      'comment', jsonb_build_object('ui:widget', 'textarea')
    ),
    'version', 0.1,
    'updatedBy', 'system',
    'updatedAt', (extract(epoch from now()) * 1000)::bigint,
    'deleted', false
  ),
  md5('GlossaryApproval')
WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('GlossaryApproval'))
UNION ALL
SELECT
  gen_random_uuid()::text,
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'TestCaseResolution',
    'fullyQualifiedName', 'TestCaseResolution',
    'displayName', 'Test Case Resolution',
    'taskType', 'TestCaseResolution',
    'taskCategory', 'Incident',
    'formSchema', jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('rootCause'),
      'properties', jsonb_build_object(
        'rootCause', jsonb_build_object('type', 'string', 'title', 'Root Cause'),
        'resolution', jsonb_build_object('type', 'string', 'title', 'Resolution')
      )
    ),
    'uiSchema', jsonb_build_object(
      'rootCause', jsonb_build_object('ui:widget', 'textarea'),
      'resolution', jsonb_build_object('ui:widget', 'textarea')
    ),
    'version', 0.1,
    'updatedBy', 'system',
    'updatedAt', (extract(epoch from now()) * 1000)::bigint,
    'deleted', false
  ),
  md5('TestCaseResolution')
WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('TestCaseResolution'));
