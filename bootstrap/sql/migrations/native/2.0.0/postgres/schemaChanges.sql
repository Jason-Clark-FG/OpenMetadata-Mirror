-- Task System Redesign - OpenMetadata 2.0.0
-- This migration creates the new Task entity tables and related infrastructure

CREATE TABLE IF NOT EXISTS task_entity (
    id character varying(36) NOT NULL,
    json jsonb NOT NULL,
    fqnhash character varying(768) NOT NULL,
    taskid character varying(20) GENERATED ALWAYS AS ((json ->> 'taskId'::text)) STORED NOT NULL,
    name character varying(256) GENERATED ALWAYS AS ((json ->> 'name'::text)) STORED NOT NULL,
    category character varying(32) GENERATED ALWAYS AS ((json ->> 'category'::text)) STORED NOT NULL,
    type character varying(64) GENERATED ALWAYS AS ((json ->> 'type'::text)) STORED NOT NULL,
    status character varying(32) GENERATED ALWAYS AS ((json ->> 'status'::text)) STORED NOT NULL,
    priority character varying(16) GENERATED ALWAYS AS (COALESCE((json ->> 'priority'::text), 'Medium'::text)) STORED,
    createdat bigint GENERATED ALWAYS AS (((json ->> 'createdAt'::text))::bigint) STORED NOT NULL,
    updatedat bigint GENERATED ALWAYS AS (((json ->> 'updatedAt'::text))::bigint) STORED NOT NULL,
    deleted boolean GENERATED ALWAYS AS (((json ->> 'deleted'::text))::boolean) STORED,
    aboutfqnhash character varying(256) GENERATED ALWAYS AS ((json ->> 'aboutFqnHash'::text)) STORED,
    PRIMARY KEY (id),
    CONSTRAINT uk_task_fqn_hash UNIQUE (fqnhash)
);

CREATE INDEX IF NOT EXISTS idx_task_taskid ON task_entity (taskid);
CREATE INDEX IF NOT EXISTS idx_task_status ON task_entity (status);
CREATE INDEX IF NOT EXISTS idx_task_category ON task_entity (category);
CREATE INDEX IF NOT EXISTS idx_task_type ON task_entity (type);
CREATE INDEX IF NOT EXISTS idx_task_priority ON task_entity (priority);
CREATE INDEX IF NOT EXISTS idx_task_createdat ON task_entity (createdat);
CREATE INDEX IF NOT EXISTS idx_task_updatedat ON task_entity (updatedat);
CREATE INDEX IF NOT EXISTS idx_task_deleted ON task_entity (deleted);
CREATE INDEX IF NOT EXISTS idx_task_status_category ON task_entity (status, category);
CREATE INDEX IF NOT EXISTS idx_task_about_fqn_hash ON task_entity (aboutfqnhash);
CREATE INDEX IF NOT EXISTS idx_task_status_about ON task_entity (status, aboutfqnhash);

CREATE TABLE IF NOT EXISTS new_task_sequence (
    id bigint NOT NULL DEFAULT 0
);

INSERT INTO new_task_sequence (id) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM new_task_sequence);
