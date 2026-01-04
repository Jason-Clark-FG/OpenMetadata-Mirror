-- Task System Redesign - OpenMetadata 2.0.0
-- This migration creates the new Task entity tables and related infrastructure

-- =====================================================
-- TASK ENTITY TABLE
-- First-class entity for all task/workflow operations
-- =====================================================
CREATE TABLE IF NOT EXISTS task_entity (
    id VARCHAR(36) NOT NULL,
    json JSONB NOT NULL,
    fqnHash VARCHAR(768) NOT NULL,

    -- Virtual columns extracted from JSON for query performance
    taskId VARCHAR(20) GENERATED ALWAYS AS (json->>'taskId') STORED NOT NULL,
    name VARCHAR(256) GENERATED ALWAYS AS (json->>'name') STORED NOT NULL,
    category VARCHAR(32) GENERATED ALWAYS AS (json->>'category') STORED NOT NULL,
    type VARCHAR(64) GENERATED ALWAYS AS (json->>'type') STORED NOT NULL,
    status VARCHAR(32) GENERATED ALWAYS AS (json->>'status') STORED NOT NULL,
    priority VARCHAR(16) GENERATED ALWAYS AS (COALESCE(json->>'priority', 'Medium')) STORED,
    createdAt BIGINT GENERATED ALWAYS AS ((json->>'createdAt')::BIGINT) STORED NOT NULL,
    updatedAt BIGINT GENERATED ALWAYS AS ((json->>'updatedAt')::BIGINT) STORED NOT NULL,
    deleted BOOLEAN GENERATED ALWAYS AS (COALESCE((json->>'deleted')::BOOLEAN, FALSE)) STORED,

    PRIMARY KEY (id),
    CONSTRAINT uk_task_fqn_hash UNIQUE (fqnHash)
);

-- Create indexes for task_entity
CREATE INDEX IF NOT EXISTS idx_task_fqn_hash ON task_entity (fqnHash);
CREATE INDEX IF NOT EXISTS idx_task_task_id ON task_entity (taskId);
CREATE INDEX IF NOT EXISTS idx_task_status ON task_entity (status);
CREATE INDEX IF NOT EXISTS idx_task_category ON task_entity (category);
CREATE INDEX IF NOT EXISTS idx_task_type ON task_entity (type);
CREATE INDEX IF NOT EXISTS idx_task_priority ON task_entity (priority);
CREATE INDEX IF NOT EXISTS idx_task_created_at ON task_entity (createdAt);
CREATE INDEX IF NOT EXISTS idx_task_updated_at ON task_entity (updatedAt);
CREATE INDEX IF NOT EXISTS idx_task_deleted ON task_entity (deleted);
CREATE INDEX IF NOT EXISTS idx_task_status_category ON task_entity (status, category);

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
    reactions JSONB,
    createdAt BIGINT NOT NULL,
    updatedAt BIGINT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (id),
    CONSTRAINT fk_task_comment_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_task ON task_comment (taskId);
CREATE INDEX IF NOT EXISTS idx_comment_author ON task_comment (authorId);
CREATE INDEX IF NOT EXISTS idx_comment_created ON task_comment (createdAt);

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
    lastLocalVersion DOUBLE PRECISION,
    lastExternalVersion VARCHAR(64),
    syncStatus VARCHAR(32) DEFAULT 'synced',
    conflictData JSONB,

    PRIMARY KEY (id),
    CONSTRAINT uk_task_system UNIQUE (taskId, externalSystem),
    CONSTRAINT fk_sync_state_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_external ON external_sync_state (externalSystem, externalId);
CREATE INDEX IF NOT EXISTS idx_sync_status ON external_sync_state (syncStatus);

-- =====================================================
-- DOMAIN TASK CONFIGURATION TABLE
-- Per-domain task configuration settings
-- =====================================================
CREATE TABLE IF NOT EXISTS domain_task_config (
    id VARCHAR(36) NOT NULL,
    domainId VARCHAR(36) NOT NULL,
    json JSONB NOT NULL,
    updatedAt BIGINT NOT NULL,

    PRIMARY KEY (id),
    CONSTRAINT uk_domain_config UNIQUE (domainId)
);

-- =====================================================
-- TASK FORM SCHEMA TABLE
-- Customizable form schemas for task types
-- =====================================================
CREATE TABLE IF NOT EXISTS task_form_schema (
    id VARCHAR(36) NOT NULL,
    json JSONB NOT NULL,
    name VARCHAR(256) NOT NULL,
    fqnHash VARCHAR(768) GENERATED ALWAYS AS (json->>'fullyQualifiedName') STORED NOT NULL,

    taskType VARCHAR(64) NOT NULL,
    scope VARCHAR(32) NOT NULL,
    domainId VARCHAR(36),
    baseSchemaId VARCHAR(36),

    updatedAt BIGINT NOT NULL,

    PRIMARY KEY (id),
    CONSTRAINT uk_type_scope_domain UNIQUE (taskType, scope, domainId)
);

CREATE INDEX IF NOT EXISTS idx_form_task_type ON task_form_schema (taskType);
CREATE INDEX IF NOT EXISTS idx_form_scope ON task_form_schema (scope);
CREATE INDEX IF NOT EXISTS idx_form_domain ON task_form_schema (domainId);
CREATE INDEX IF NOT EXISTS idx_form_fqn ON task_form_schema USING GIN (to_tsvector('english', fqnHash));

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
    CONSTRAINT fk_task_assignee_task FOREIGN KEY (taskId) REFERENCES task_entity(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignee_id ON task_assignee (assigneeId);
CREATE INDEX IF NOT EXISTS idx_assignee_type ON task_assignee (assigneeType);

-- =====================================================
-- OLD TO NEW ID MAPPING TABLE
-- For URL redirects during migration from old thread-based tasks
-- =====================================================
CREATE TABLE IF NOT EXISTS task_migration_mapping (
    oldId VARCHAR(36) NOT NULL,
    newTaskId VARCHAR(36) NOT NULL,
    oldType VARCHAR(20) NOT NULL, -- 'thread' or 'suggestion'
    migratedAt BIGINT NOT NULL,

    PRIMARY KEY (oldId)
);

CREATE INDEX IF NOT EXISTS idx_migration_new_id ON task_migration_mapping (newTaskId);
