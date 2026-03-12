-- Add search_text column for full-text search on audit log events.
-- Populated at write time with searchable content extracted from the change event
-- (user name, entity FQN, entity type, service name, field change names and values).
-- This avoids scanning the event_json LONGTEXT column at query time.
ALTER TABLE audit_log_event ADD COLUMN search_text TEXT DEFAULT NULL;

-- MySQL built-in FULLTEXT index on InnoDB — no extensions required.
-- Supports MATCH() AGAINST() queries in NATURAL LANGUAGE mode.
CREATE FULLTEXT INDEX idx_audit_log_search_text ON audit_log_event (search_text);
-- Incremental Search Retry Queue
-- Stores failed live-indexing operations for async background catch-up.
-- Keep this table intentionally minimal: entityId, entityFqn, failureReason, status.
CREATE TABLE IF NOT EXISTS search_index_retry_queue (
    entityId VARCHAR(36) NOT NULL DEFAULT '',
    entityFqn VARCHAR(1024) NOT NULL DEFAULT '',
    failureReason LONGTEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    PRIMARY KEY (entityId, entityFqn),
    INDEX idx_search_index_retry_queue_status (status)
);
