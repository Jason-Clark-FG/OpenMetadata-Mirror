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

CREATE TABLE IF NOT EXISTS public.user_session (
    id character varying(64) GENERATED ALWAYS AS ((json ->> 'id'::text)) STORED NOT NULL,
    userid character varying(36) GENERATED ALWAYS AS ((json ->> 'userId'::text)) STORED,
    status character varying(32) GENERATED ALWAYS AS ((json ->> 'status'::text)) STORED NOT NULL,
    expiresat bigint GENERATED ALWAYS AS (((json ->> 'expiresAt'::text))::bigint) STORED NOT NULL,
    idleexpiresat bigint GENERATED ALWAYS AS (((json ->> 'idleExpiresAt'::text))::bigint) STORED NOT NULL,
    updatedat bigint GENERATED ALWAYS AS (((json ->> 'updatedAt'::text))::bigint) STORED NOT NULL,
    sessiontype character varying(32) GENERATED ALWAYS AS ((json ->> 'type'::text)) STORED,
    provider character varying(64) GENERATED ALWAYS AS ((json ->> 'provider'::text)) STORED,
    version bigint GENERATED ALWAYS AS (((json ->> 'version'::text))::bigint) STORED,
    lastaccessedat bigint GENERATED ALWAYS AS (((json ->> 'lastAccessedAt'::text))::bigint) STORED,
    refreshleaseuntil bigint GENERATED ALWAYS AS (((json ->> 'refreshLeaseUntil'::text))::bigint) STORED,
    json jsonb NOT NULL,
    CONSTRAINT user_session_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS user_session_user_status_idx ON public.user_session USING btree (userid, status);
CREATE INDEX IF NOT EXISTS user_session_expiry_idx ON public.user_session USING btree (status, expiresat);
CREATE INDEX IF NOT EXISTS user_session_idle_expiry_idx ON public.user_session USING btree (status, idleexpiresat);
CREATE INDEX IF NOT EXISTS user_session_prune_idx ON public.user_session USING btree (status, updatedat);
