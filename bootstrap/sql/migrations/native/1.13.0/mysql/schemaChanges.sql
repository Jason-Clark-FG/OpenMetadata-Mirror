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

CREATE TABLE IF NOT EXISTS `user_session` (
  `id` varchar(64) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.id'))) STORED NOT NULL,
  `userId` varchar(36) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.userId'))) STORED,
  `status` varchar(32) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.status'))) STORED NOT NULL,
  `expiresAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.expiresAt'))) STORED NOT NULL,
  `idleExpiresAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.idleExpiresAt'))) STORED NOT NULL,
  `updatedAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.updatedAt'))) STORED NOT NULL,
  `sessionType` varchar(32) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.type'))) VIRTUAL,
  `provider` varchar(64) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.provider'))) VIRTUAL,
  `version` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.version'))) VIRTUAL,
  `lastAccessedAt` bigint unsigned GENERATED ALWAYS AS (nullif(json_unquote(json_extract(`json`,_utf8mb4'$.lastAccessedAt')),'null')) VIRTUAL,
  `refreshLeaseUntil` bigint unsigned GENERATED ALWAYS AS (nullif(json_unquote(json_extract(`json`,_utf8mb4'$.refreshLeaseUntil')),'null')) VIRTUAL,
  `json` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_session_user_status` (`userId`,`status`),
  KEY `user_session_expiry` (`status`,`expiresAt`),
  KEY `user_session_idle_expiry` (`status`,`idleExpiresAt`),
  KEY `user_session_prune` (`status`,`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
