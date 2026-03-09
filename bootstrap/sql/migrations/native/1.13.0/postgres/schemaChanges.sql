-- Rename 'preview' to 'enabled' in apps, inverting the boolean value
-- preview=false (can be used) becomes enabled=true, preview=true becomes enabled=false
UPDATE apps_marketplace
SET json = (json - 'preview') || jsonb_build_object(
    'enabled',
    CASE
        WHEN json -> 'preview' = 'null'::jsonb THEN true
        WHEN (json -> 'preview')::boolean = true THEN false
        ELSE true
    END
)
WHERE jsonb_exists(json, 'preview');

UPDATE installed_apps
SET json = (json - 'preview') || jsonb_build_object(
    'enabled',
    CASE
        WHEN json -> 'preview' = 'null'::jsonb THEN true
        WHEN (json -> 'preview')::boolean = true THEN false
        ELSE true
    END
)
WHERE jsonb_exists(json, 'preview');

-- MCP conversation table for MCP Client message tracking
CREATE TABLE IF NOT EXISTS mcp_conversation (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> 'id') STORED NOT NULL,
  json JSONB NOT NULL,
  userId VARCHAR(256) GENERATED ALWAYS AS ((json -> 'user') ->> 'id') STORED NOT NULL,
  createdAt BIGINT GENERATED ALWAYS AS ((json ->> 'createdAt')::bigint) STORED NOT NULL,
  updatedAt BIGINT GENERATED ALWAYS AS ((json ->> 'updatedAt')::bigint) STORED NOT NULL,
  createdBy VARCHAR(50) GENERATED ALWAYS AS (json ->> 'createdBy') STORED NOT NULL,
  updatedBy VARCHAR(50) GENERATED ALWAYS AS (json ->> 'updatedBy') STORED NOT NULL,
  messageCount INT GENERATED ALWAYS AS ((json ->> 'messageCount')::int) STORED,

  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_mcp_conversation_user_updated ON mcp_conversation (userId, updatedAt DESC);

-- MCP message table for MCP Client message tracking
CREATE TABLE IF NOT EXISTS mcp_message (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> 'id') STORED NOT NULL,
  json JSONB NOT NULL,
  conversationId VARCHAR(36) GENERATED ALWAYS AS (json ->> 'conversationId') STORED NOT NULL,
  sender VARCHAR(10) GENERATED ALWAYS AS (json ->> 'sender') STORED NOT NULL,
  messageIndex INT GENERATED ALWAYS AS ((json ->> 'index')::int) STORED,
  timestamp BIGINT GENERATED ALWAYS AS ((json ->> 'timestamp')::bigint) STORED NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_mcp_message_conversation FOREIGN KEY (conversationId) REFERENCES mcp_conversation(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mcp_message_conversation_index ON mcp_message (conversationId, messageIndex);
CREATE INDEX IF NOT EXISTS idx_mcp_message_conversation_created ON mcp_message (conversationId, timestamp);
