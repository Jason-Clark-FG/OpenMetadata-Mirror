-- Rename 'preview' to 'enabled' in apps, inverting the boolean value
-- preview=false (can be used) becomes enabled=true, preview=true becomes enabled=false
UPDATE apps_marketplace
SET json = JSON_SET(
    JSON_REMOVE(json, '$.preview'),
    '$.enabled',
    CASE
        WHEN JSON_EXTRACT(json, '$.preview') = true THEN CAST('false' AS JSON)
        ELSE CAST('true' AS JSON)
    END
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.preview');

UPDATE installed_apps
SET json = JSON_SET(
    JSON_REMOVE(json, '$.preview'),
    '$.enabled',
    CASE
        WHEN JSON_EXTRACT(json, '$.preview') = true THEN CAST('false' AS JSON)
        ELSE CAST('true' AS JSON)
    END
)
WHERE JSON_CONTAINS_PATH(json, 'one', '$.preview');

-- MCP conversation table for MCP Client message tracking
CREATE TABLE IF NOT EXISTS mcp_conversation (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.id') STORED NOT NULL,
  json JSON NOT NULL,
  userId VARCHAR(256) GENERATED ALWAYS AS (json ->> '$.user.id') NOT NULL,
  createdAt BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.createdAt') NOT NULL,
  updatedAt BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.updatedAt') NOT NULL,
  createdBy VARCHAR(50) GENERATED ALWAYS AS (json ->> '$.createdBy') NOT NULL,
  updatedBy VARCHAR(50) GENERATED ALWAYS AS (json ->> '$.updatedBy') NOT NULL,
  messageCount INT GENERATED ALWAYS AS (json ->> '$.messageCount') STORED,

  PRIMARY KEY (id),
  INDEX idx_mcp_conversation_user_updated (userId, updatedAt DESC)
);

-- MCP message table for MCP Client message tracking
CREATE TABLE IF NOT EXISTS mcp_message (
  id VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.id') STORED NOT NULL,
  json JSON NOT NULL,
  conversationId VARCHAR(36) GENERATED ALWAYS AS (json ->> '$.conversationId') STORED NOT NULL,
  sender VARCHAR(10) GENERATED ALWAYS AS (json ->> '$.sender') STORED NOT NULL,
  messageIndex INT GENERATED ALWAYS AS (json ->> '$.index') STORED,
  timestamp BIGINT UNSIGNED GENERATED ALWAYS AS (json ->> '$.timestamp') NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_mcp_message_conversation FOREIGN KEY (conversationId) REFERENCES mcp_conversation(id) ON DELETE CASCADE,
  INDEX idx_mcp_message_conversation_index (conversationId, messageIndex),
  INDEX idx_mcp_message_conversation_created (conversationId, timestamp)
);
