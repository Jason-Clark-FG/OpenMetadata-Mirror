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
INSERT INTO announcement_entity (id, json, fqnHash)
SELECT
  a_id AS id,
  a_json AS json,
  a_fqnHash AS fqnHash
FROM (
  SELECT
    JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id')) AS a_id,
    JSON_OBJECT(
      'id', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id')),
      'name', CONCAT('announcement-', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id'))),
      'fullyQualifiedName', CONCAT('announcement-', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id'))),
      'description', COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.announcement.description')),
        JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.message')),
        ''
      ),
      'entityLink', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.about')),
      'startTime', CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.announcement.startTime')) AS UNSIGNED),
      'endTime', CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.announcement.endTime')) AS UNSIGNED),
      'status', CASE
                  WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.announcement.endTime')) AS UNSIGNED) < UNIX_TIMESTAMP() * 1000
                    THEN 'Expired'
                  WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.announcement.startTime')) AS UNSIGNED) > UNIX_TIMESTAMP() * 1000
                    THEN 'Scheduled'
                  ELSE 'Active'
                END,
      'createdBy', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.createdBy')),
      'updatedBy', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.updatedBy')), JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.createdBy'))),
      'createdAt', CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.threadTs')) AS UNSIGNED),
      'updatedAt', CAST(JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.updatedAt')) AS UNSIGNED),
      'deleted', false,
      'version', 0.1,
      'reactions', COALESCE(JSON_EXTRACT(t.json, '$.reactions'), JSON_ARRAY())
    ) AS a_json,
    MD5(CONCAT('announcement-', JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id')))) AS a_fqnHash
  FROM thread_entity t
  WHERE JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.type')) = 'Announcement'
  AND NOT EXISTS (
    SELECT 1 FROM announcement_entity a WHERE a.id = JSON_UNQUOTE(JSON_EXTRACT(t.json, '$.id'))
  )
) migrated;

-- =====================================================
-- PHASE 3D: Seed default TaskFormSchema entries
-- =====================================================
INSERT INTO task_form_schema_entity (id, json, fqnHash)
SELECT * FROM (
  SELECT
    UUID() AS id,
    JSON_OBJECT(
      'id', @desc_id := UUID(),
      'name', 'DescriptionSuggestion',
      'fullyQualifiedName', 'DescriptionSuggestion',
      'displayName', 'Description Suggestion',
      'taskType', 'Suggestion',
      'taskCategory', 'MetadataUpdate',
      'formSchema', JSON_OBJECT(
        'type', 'object',
        'required', JSON_ARRAY('suggestedValue'),
        'properties', JSON_OBJECT(
          'suggestedValue', JSON_OBJECT('type', 'string', 'title', 'Suggested Description'),
          'reasoning', JSON_OBJECT('type', 'string', 'title', 'Reason for suggestion')
        )
      ),
      'uiSchema', JSON_OBJECT(
        'suggestedValue', JSON_OBJECT('ui:widget', 'textarea'),
        'reasoning', JSON_OBJECT('ui:widget', 'textarea')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', UNIX_TIMESTAMP() * 1000,
      'deleted', false
    ) AS json,
    MD5('DescriptionSuggestion') AS fqnHash
  FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnHash = MD5('DescriptionSuggestion'))
) seed_desc
UNION ALL
SELECT * FROM (
  SELECT
    UUID() AS id,
    JSON_OBJECT(
      'id', @tag_id := UUID(),
      'name', 'TagSuggestion',
      'fullyQualifiedName', 'TagSuggestion',
      'displayName', 'Tag Suggestion',
      'taskType', 'Suggestion',
      'taskCategory', 'MetadataUpdate',
      'formSchema', JSON_OBJECT(
        'type', 'object',
        'required', JSON_ARRAY('suggestedValue'),
        'properties', JSON_OBJECT(
          'suggestedValue', JSON_OBJECT('type', 'string', 'title', 'Suggested Tags (JSON)'),
          'reasoning', JSON_OBJECT('type', 'string', 'title', 'Reason for suggestion')
        )
      ),
      'uiSchema', JSON_OBJECT(
        'suggestedValue', JSON_OBJECT('ui:widget', 'tagSelector'),
        'reasoning', JSON_OBJECT('ui:widget', 'textarea')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', UNIX_TIMESTAMP() * 1000,
      'deleted', false
    ) AS json,
    MD5('TagSuggestion') AS fqnHash
  FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnHash = MD5('TagSuggestion'))
) seed_tag
UNION ALL
SELECT * FROM (
  SELECT
    UUID() AS id,
    JSON_OBJECT(
      'id', @glossary_id := UUID(),
      'name', 'GlossaryApproval',
      'fullyQualifiedName', 'GlossaryApproval',
      'displayName', 'Glossary Approval',
      'taskType', 'GlossaryApproval',
      'taskCategory', 'Approval',
      'formSchema', JSON_OBJECT(
        'type', 'object',
        'properties', JSON_OBJECT(
          'comment', JSON_OBJECT('type', 'string', 'title', 'Approval Comment')
        )
      ),
      'uiSchema', JSON_OBJECT(
        'comment', JSON_OBJECT('ui:widget', 'textarea')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', UNIX_TIMESTAMP() * 1000,
      'deleted', false
    ) AS json,
    MD5('GlossaryApproval') AS fqnHash
  FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnHash = MD5('GlossaryApproval'))
) seed_glossary
UNION ALL
SELECT * FROM (
  SELECT
    UUID() AS id,
    JSON_OBJECT(
      'id', @tcr_id := UUID(),
      'name', 'TestCaseResolution',
      'fullyQualifiedName', 'TestCaseResolution',
      'displayName', 'Test Case Resolution',
      'taskType', 'TestCaseResolution',
      'taskCategory', 'Incident',
      'formSchema', JSON_OBJECT(
        'type', 'object',
        'required', JSON_ARRAY('rootCause'),
        'properties', JSON_OBJECT(
          'rootCause', JSON_OBJECT('type', 'string', 'title', 'Root Cause'),
          'resolution', JSON_OBJECT('type', 'string', 'title', 'Resolution')
        )
      ),
      'uiSchema', JSON_OBJECT(
        'rootCause', JSON_OBJECT('ui:widget', 'textarea'),
        'resolution', JSON_OBJECT('ui:widget', 'textarea')
      ),
      'version', 0.1,
      'updatedBy', 'system',
      'updatedAt', UNIX_TIMESTAMP() * 1000,
      'deleted', false
    ) AS json,
    MD5('TestCaseResolution') AS fqnHash
  FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM task_form_schema_entity WHERE fqnHash = MD5('TestCaseResolution'))
) seed_tcr;
