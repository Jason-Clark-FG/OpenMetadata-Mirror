-- Post data migration script for Task System Redesign - OpenMetadata 2.0.0
-- This script runs after the data migration completes

-- =====================================================
-- NOTE: Suggestion migration (suggestions → task_entity),
-- thread-based task migration (thread_entity → task_entity),
-- and legacy system activity migration
-- (thread_entity generated feed rows → activity_stream)
-- are handled in Java MigrationUtil because they require
-- entity-link aware transformation logic.
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
-- PHASE 2E: Rename legacy thread storage to fail stale references
-- =====================================================
ALTER TABLE IF EXISTS thread_entity RENAME TO thread_entity_legacy;

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
      'ui:handler', jsonb_build_object(
        'type', 'approval',
        'permission', 'EDIT_ALL'
      ),
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
      'properties', jsonb_build_object(
        'rootCause', jsonb_build_object('type', 'string', 'title', 'Root Cause'),
        'resolution', jsonb_build_object('type', 'string', 'title', 'Resolution')
      )
    ),
    'uiSchema', jsonb_build_object(
      'ui:handler', jsonb_build_object(
        'type', 'incident'
      ),
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

INSERT INTO task_form_schema_entity (id, json, fqnhash)
SELECT * FROM (
  SELECT
    gen_random_uuid() AS id,
    jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'DescriptionUpdate',
      'fullyQualifiedName', 'DescriptionUpdate',
      'displayName', 'Description Update',
      'taskType', 'DescriptionUpdate',
      'taskCategory', 'MetadataUpdate',
      'formSchema', jsonb_build_object(
        'type', 'object',
        'additionalProperties', true,
        'properties', jsonb_build_object(
          'fieldPath', jsonb_build_object('type', 'string', 'title', 'Field Path'),
          'currentDescription', jsonb_build_object('type', 'string', 'title', 'Current Description'),
          'newDescription', jsonb_build_object('type', 'string', 'title', 'New Description'),
          'source', jsonb_build_object('type', 'string', 'title', 'Source'),
          'confidence', jsonb_build_object('type', 'number', 'title', 'Confidence')
        )
      ),
      'uiSchema', jsonb_build_object(
        'ui:handler', jsonb_build_object(
          'type', 'descriptionUpdate',
          'permission', 'EDIT_DESCRIPTION',
          'fieldPathField', 'fieldPath',
          'valueField', 'newDescription'
        ),
        'ui:editablePayload', jsonb_build_object(
          'fieldPathField', 'fieldPath',
          'currentValueField', 'currentDescription',
          'editedValueField', 'newDescription'
        ),
        'ui:resolution', jsonb_build_object(
          'mode', 'field',
          'valueField', 'newDescription'
        ),
        'ui:order', jsonb_build_array('newDescription', 'fieldPath', 'currentDescription', 'source', 'confidence'),
        'fieldPath', jsonb_build_object('ui:widget', 'hidden'),
        'currentDescription', jsonb_build_object('ui:widget', 'hidden'),
        'source', jsonb_build_object('ui:widget', 'hidden'),
        'confidence', jsonb_build_object('ui:widget', 'hidden'),
        'newDescription', jsonb_build_object('ui:widget', 'descriptionTabs')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT),
      'deleted', false
    ) AS json,
    md5('DescriptionUpdate') AS fqnhash
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('DescriptionUpdate'))
) seed_description_update
UNION ALL
SELECT * FROM (
  SELECT
    gen_random_uuid() AS id,
    jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'TagUpdate',
      'fullyQualifiedName', 'TagUpdate',
      'displayName', 'Tag Update',
      'taskType', 'TagUpdate',
      'taskCategory', 'MetadataUpdate',
      'formSchema', jsonb_build_object(
        'type', 'object',
        'additionalProperties', true,
        'properties', jsonb_build_object(
          'fieldPath', jsonb_build_object('type', 'string', 'title', 'Field Path'),
          'currentTags', jsonb_build_object(
            'type', 'array',
            'title', 'Current Tags',
            'items', jsonb_build_object('type', 'object', 'additionalProperties', true)
          ),
          'tagsToAdd', jsonb_build_object(
            'type', 'array',
            'title', 'Tags To Add',
            'items', jsonb_build_object('type', 'object', 'additionalProperties', true)
          ),
          'tagsToRemove', jsonb_build_object(
            'type', 'array',
            'title', 'Tags To Remove',
            'items', jsonb_build_object('type', 'object', 'additionalProperties', true)
          ),
          'operation', jsonb_build_object('type', 'string', 'title', 'Operation'),
          'source', jsonb_build_object('type', 'string', 'title', 'Source'),
          'confidence', jsonb_build_object('type', 'number', 'title', 'Confidence')
        )
      ),
      'uiSchema', jsonb_build_object(
        'ui:handler', jsonb_build_object(
          'type', 'tagUpdate',
          'permission', 'EDIT_TAGS',
          'fieldPathField', 'fieldPath',
          'currentTagsField', 'currentTags',
          'addTagsField', 'tagsToAdd',
          'removeTagsField', 'tagsToRemove'
        ),
        'ui:editablePayload', jsonb_build_object(
          'fieldPathField', 'fieldPath',
          'currentTagsField', 'currentTags',
          'addTagsField', 'tagsToAdd',
          'removeTagsField', 'tagsToRemove'
        ),
        'ui:resolution', jsonb_build_object(
          'mode', 'tagMerge',
          'currentField', 'currentTags',
          'addField', 'tagsToAdd',
          'removeField', 'tagsToRemove'
        ),
        'ui:order', jsonb_build_array('tagsToAdd', 'fieldPath', 'currentTags', 'tagsToRemove', 'operation', 'source', 'confidence'),
        'fieldPath', jsonb_build_object('ui:widget', 'hidden'),
        'currentTags', jsonb_build_object('ui:widget', 'hidden'),
        'tagsToRemove', jsonb_build_object('ui:widget', 'hidden'),
        'operation', jsonb_build_object('ui:widget', 'hidden'),
        'source', jsonb_build_object('ui:widget', 'hidden'),
        'confidence', jsonb_build_object('ui:widget', 'hidden'),
        'tagsToAdd', jsonb_build_object('ui:widget', 'tagsTabs')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT),
      'deleted', false
    ) AS json,
    md5('TagUpdate') AS fqnhash
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnhash = md5('TagUpdate'))
) seed_tag_update;
