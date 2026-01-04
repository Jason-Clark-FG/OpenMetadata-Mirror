-- Task System Redesign - OpenMetadata 2.0.0
-- This migration creates the new Task entity tables and related infrastructure

-- =====================================================
-- TASK ENTITY TABLE
-- First-class entity for all task/workflow operations
-- =====================================================
CREATE TABLE IF NOT EXISTS task_entity (
    id VARCHAR(36) NOT NULL,
    json JSON NOT NULL,
    fqnHash VARCHAR(768) NOT NULL,

    -- Virtual columns extracted from JSON for query performance
    taskId VARCHAR(20) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.taskId'))) STORED NOT NULL,
    name VARCHAR(256) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.name'))) STORED NOT NULL,
    category VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.category'))) STORED NOT NULL,
    type VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.type'))) STORED NOT NULL,
    status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.status'))) STORED NOT NULL,
    priority VARCHAR(16) GENERATED ALWAYS AS (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(json, '$.priority')), 'Medium')) STORED,
    createdAt BIGINT GENERATED ALWAYS AS (CAST(JSON_EXTRACT(json, '$.createdAt') AS SIGNED)) STORED NOT NULL,
    updatedAt BIGINT GENERATED ALWAYS AS (CAST(JSON_EXTRACT(json, '$.updatedAt') AS SIGNED)) STORED NOT NULL,
    deleted TINYINT(1) GENERATED ALWAYS AS (IFNULL(JSON_EXTRACT(json, '$.deleted') = true, 0)) STORED,

    PRIMARY KEY (id),
    UNIQUE KEY uk_fqn_hash (fqnHash),
    INDEX idx_fqn_hash (fqnHash),
    INDEX idx_task_id (taskId),
    INDEX idx_status (status),
    INDEX idx_category (category),
    INDEX idx_type (type),
    INDEX idx_priority (priority),
    INDEX idx_created_at (createdAt),
    INDEX idx_updated_at (updatedAt),
    INDEX idx_deleted (deleted),
    INDEX idx_status_category (status, category)
);

-- =====================================================
-- NEW TASK ID SEQUENCE TABLE
-- Sequence for human-readable task IDs (TASK-XXXXX)
-- Named new_task_sequence to avoid conflict with legacy task_sequence
-- =====================================================
CREATE TABLE IF NOT EXISTS new_task_sequence (
    id BIGINT NOT NULL DEFAULT 0
);

-- Initialize the sequence starting at 0
INSERT INTO new_task_sequence (id) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM new_task_sequence);

-- =====================================================
-- TASK COMMENTS TABLE
-- Comments on tasks (separate from thread for simplicity)
-- =====================================================
CREATE TABLE IF NOT EXISTS task_comment (
    id VARCHAR(36) NOT NULL,
    taskId VARCHAR(36) NOT NULL,
    authorId VARCHAR(36) NOT NULL,
    message TEXT NOT NULL,
    reactions JSON,
    createdAt BIGINT NOT NULL,
    updatedAt BIGINT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (id),
    INDEX idx_task (taskId),
    INDEX idx_author (authorId),
    INDEX idx_created (createdAt),
    CONSTRAINT fk_task_comment_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

-- =====================================================
-- EXTERNAL SYNC STATE TABLE
-- Tracks bidirectional sync with external systems
-- =====================================================
CREATE TABLE IF NOT EXISTS external_sync_state (
    id VARCHAR(36) NOT NULL,
    taskId VARCHAR(36) NOT NULL,
    externalSystem VARCHAR(32) NOT NULL,
    externalId VARCHAR(256) NOT NULL,
    externalUrl VARCHAR(512),
    externalStatus VARCHAR(64),
    lastSyncedAt BIGINT NOT NULL,
    lastLocalVersion DOUBLE,
    lastExternalVersion VARCHAR(64),
    syncStatus VARCHAR(32) DEFAULT 'synced',
    conflictData JSON,

    PRIMARY KEY (id),
    UNIQUE KEY uk_task_system (taskId, externalSystem),
    INDEX idx_external (externalSystem, externalId),
    INDEX idx_sync_status (syncStatus),
    CONSTRAINT fk_sync_state_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

-- =====================================================
-- DOMAIN TASK CONFIGURATION TABLE
-- Per-domain task configuration settings
-- =====================================================
CREATE TABLE IF NOT EXISTS domain_task_config (
    id VARCHAR(36) NOT NULL,
    domainId VARCHAR(36) NOT NULL,
    json JSON NOT NULL,
    updatedAt BIGINT NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_domain (domainId)
);

-- =====================================================
-- TASK FORM SCHEMA TABLE
-- Customizable form schemas for task types
-- =====================================================
CREATE TABLE IF NOT EXISTS task_form_schema (
    id VARCHAR(36) NOT NULL,
    json JSON NOT NULL,
    name VARCHAR(256) NOT NULL,
    fqnHash VARCHAR(768) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(json, '$.fullyQualifiedName'))) STORED NOT NULL,

    taskType VARCHAR(64) NOT NULL,
    scope VARCHAR(32) NOT NULL,
    domainId VARCHAR(36),
    baseSchemaId VARCHAR(36),

    updatedAt BIGINT NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_type_scope_domain (taskType, scope, domainId),
    INDEX idx_task_type (taskType),
    INDEX idx_scope (scope),
    INDEX idx_domain (domainId),
    FULLTEXT INDEX idx_fqn (fqnHash)
);

-- =====================================================
-- TASK ASSIGNEE RELATIONSHIP TABLE
-- Denormalized table for efficient assignee queries
-- =====================================================
CREATE TABLE IF NOT EXISTS task_assignee (
    taskId VARCHAR(36) NOT NULL,
    assigneeId VARCHAR(36) NOT NULL,
    assigneeType VARCHAR(20) NOT NULL, -- 'user' or 'team'
    assignedAt BIGINT NOT NULL,

    PRIMARY KEY (taskId, assigneeId),
    INDEX idx_assignee (assigneeId),
    INDEX idx_type (assigneeType),
    CONSTRAINT fk_task_assignee_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

-- =====================================================
-- OLD TO NEW ID MAPPING TABLE
-- For URL redirects during migration from old thread-based tasks
-- =====================================================
CREATE TABLE IF NOT EXISTS task_migration_mapping (
    oldId VARCHAR(36) NOT NULL,
    newTaskId VARCHAR(36) NOT NULL,
    oldType VARCHAR(20) NOT NULL, -- 'thread' or 'suggestion'
    migratedAt BIGINT NOT NULL,

    PRIMARY KEY (oldId),
    INDEX idx_new_id (newTaskId)
);
