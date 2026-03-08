# Multi-Node Session Management Design

## 1. Overview

### 1.1 Problem

Issue [#21971](https://github.com/open-metadata/OpenMetadata/issues/21971) is fundamentally about browser and confidential-auth session state being tied to pod-local memory instead of a shared store.

Today, OpenMetadata already does the right thing for normal API traffic:

- API and MCP requests authenticated with bearer JWTs are effectively stateless.
- Personal access tokens and refresh tokens are already persisted in `user_tokens`.

The gap is in the server-managed login and refresh flows:

- `BasicAuthServletHandler` stores refresh state in `HttpSession`.
- `LdapAuthServletHandler` stores refresh state in `HttpSession`.
- `SamlAuthServletHandler` stores refresh state in `HttpSession`.
- `AuthenticationCodeFlowHandler` stores OIDC callback state and credentials in `HttpSession`.
- `JwtTokenCacheManager` keeps logout invalidation in pod-local memory.

This breaks or weakens correctness in multi-node deployment:

- Login starts on node A, refresh lands on node B and cannot find session state.
- OIDC confidential callback lands on a different node than the login redirect.
- Logout invalidation is not globally visible.
- Session behavior depends on sticky sessions or a single pod.

### 1.2 Goals

1. Support server-managed browser sessions across multiple OpenMetadata pods.
2. Keep normal authenticated API and MCP requests stateless.
3. Avoid database lookups on every authenticated API request.
4. Keep database usage bounded to login, callback, refresh, logout, and cleanup paths.
5. Support multiple session types, starting with `AUTH` and future `MCP`.
6. Make refresh and logout safe under concurrency across nodes.
7. Add an integration-test harness in `openmetadata-integration-tests` that validates multi-node behavior and remains safe under parallel execution.

### 1.3 Non-Goals

1. Immediate revocation of already-issued access JWTs on every node without any bounded staleness.
2. Adding Redis, Kafka, or another mandatory infrastructure dependency in v1.
3. Reworking personal access token or bot token authentication.
4. Replacing the existing public-client OIDC browser flow used entirely in the frontend.

## 2. Current State

### 2.1 Current server-side auth state

Current server-managed session state lives in memory:

- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/BasicAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/LdapAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/SamlAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/AuthenticationCodeFlowHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/saml/JwtTokenCacheManager.java`

Refresh tokens are already persisted here:

- `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/TokenRepository.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/CollectionDAO.java`
- `bootstrap/sql/schema/mysql.sql`
- `bootstrap/sql/schema/postgres.sql`

### 2.2 Current integration-test model

`openmetadata-integration-tests` already gives us:

- Shared database and search containers for the whole suite.
- A shared OpenMetadata application instance created by `TestSuiteBootstrap`.
- Parallel test execution enabled by default.
- Per-test isolation via `TestNamespace` and `TestNamespaceExtension`.

Relevant files:

- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/bootstrap/TestSuiteBootstrap.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/util/TestNamespace.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/util/TestNamespaceExtension.java`
- `openmetadata-integration-tests/src/test/resources/junit-platform.properties`

This is a strong base, but it only boots one shared OpenMetadata app instance today.

## 3. Alternatives Considered

### 3.1 Sticky sessions

Rejected.

It hides the problem instead of solving it. It also breaks on pod eviction, rolling restart, or any request that does not return to the same node.

### 3.2 Jetty/JDBC-backed `HttpSession`

Rejected.

This would make the servlet container responsible for persistence and cache behavior, but the data we need is domain-specific:

- refresh token identifiers
- provider refresh tokens
- redirect URI
- OIDC state, nonce, PKCE verifier
- session type and status
- versioning and refresh lease

Jetty session serialization is also opaque, harder to test, and more expensive than a purpose-built model.

### 3.3 Redis-backed session store

Not chosen for v1.

Redis would improve invalidation and coordination, but the issue explicitly asks for a scalable multi-node solution without requiring additional infrastructure or excessive database traffic.

### 3.4 Database-backed session store with local near-cache

Chosen.

This gives:

- correctness across nodes
- no new mandatory dependency
- bounded DB usage on auth-only paths
- explicit control over refresh concurrency and session lifecycle

## 4. Proposed Design

### 4.1 High-level design

Use a first-class server-side session model:

- Source of truth: database-backed `user_session` table.
- Fast path: per-pod Caffeine near-cache keyed by session ID.
- Client token: opaque `OM_SESSION` cookie carrying the session ID.
- Cookie policy:
  - when `isHttps(config) || authenticationConfiguration.forceSecureSessionCookie` is true, set `HttpOnly`, `Secure`, `SameSite=None`
  - when running on plain `http://` in local development or tests, set `HttpOnly`, no `Secure`, `SameSite=Lax`
- Access token returned to the browser: OpenMetadata-signed JWT for all server-managed session flows.
- No session lookup on normal bearer-auth API requests.

The design intentionally separates:

- `user_tokens`: long-lived token records like OM refresh tokens and PATs.
- `user_session`: browser or interactive session state.

### 4.2 Why OM-signed access JWTs for server-managed sessions

For session-backed flows such as Basic, LDAP, SAML, confidential OIDC, and future interactive MCP auth, the server should return an OpenMetadata-signed JWT instead of returning or forwarding provider ID tokens.

This simplifies the system:

1. The browser still gets a stateless bearer token for normal API calls.
2. `JwtFilter` continues to validate a single OpenMetadata token shape for these flows.
3. OIDC provider tokens stay server-side and are used only for refresh or upstream logout.
4. Cross-node refresh becomes deterministic because the session store is authoritative.

The public-client OIDC flow that is already fully browser-managed remains unchanged.

## 5. Session Domain Model

### 5.1 Session types

Initial `SessionType` values:

- `AUTH`: browser or interactive user auth session
- `MCP`: future MCP interactive session

### 5.2 Session status

`SessionStatus` values:

- `PENDING`: login started, callback not completed
- `ACTIVE`: usable session
- `REFRESHING`: one node currently holds the refresh lease
- `REVOKED`: logout or administrative invalidation
- `EXPIRED`: timed out or absolute expiry reached

### 5.3 Logical session payload

Proposed `UserSession` shape:

```json
{
  "id": "s7lM5Xq8fF0aR2tM0kB2V1N9w6QeH3zP8cD4uJ1mK7A",
  "type": "AUTH",
  "provider": "OPENMETADATA",
  "status": "ACTIVE",
  "userId": "uuid",
  "principalName": "alice",
  "email": "alice@example.com",
  "omRefreshTokenId": "uuid",
  "providerRefreshToken": "fernet:gAAAAABm-example",
  "providerAccessContext": {
    "issuer": "https://issuer.example.com",
    "subject": "provider-subject",
    "claimsSnapshot": {
      "groups": ["engineering"]
    }
  },
  "redirectUri": "https://ui.example.com/callback",
  "state": "oidc-state",
  "nonce": "oidc-nonce",
  "pkceVerifier": "pkce-verifier",
  "version": 7,
  "refreshLeaseUntil": 1741300000000,
  "createdAt": 1741200000000,
  "updatedAt": 1741200005000,
  "lastAccessedAt": 1741200005000,
  "expiresAt": 1743792000000,
  "idleExpiresAt": 1741804800000
}
```

### 5.4 Schema and storage pattern

OpenMetadata already stores token records as JSON with generated columns. The same pattern should be used for sessions, but the MySQL and Postgres variants should follow the conventions already present in `bootstrap/sql/schema/mysql.sql` and `bootstrap/sql/schema/postgres.sql`.

Proposed schema file:

- `openmetadata-spec/src/main/resources/json/schema/auth/userSession.json`

#### 5.4.1 MySQL DDL pattern

Use MySQL generated columns with the same `json_unquote(json_extract(...))` form already used elsewhere in the repo.

Use `STORED` only for columns that participate in the primary key or indexes. Keep the rest `VIRTUAL` to reduce write amplification on refresh and access updates.

```sql
CREATE TABLE `user_session` (
  `id` varchar(64) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.id'))) STORED NOT NULL,
  `userId` varchar(36) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.userId'))) STORED,
  `status` varchar(32) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.status'))) STORED NOT NULL,
  `expiresAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.expiresAt'))) STORED NOT NULL,
  `idleExpiresAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.idleExpiresAt'))) STORED NOT NULL,
  `sessionType` varchar(32) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.type'))) VIRTUAL NOT NULL,
  `provider` varchar(64) GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.provider'))) VIRTUAL NOT NULL,
  `version` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.version'))) VIRTUAL NOT NULL,
  `lastAccessedAt` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.lastAccessedAt'))) VIRTUAL,
  `refreshLeaseUntil` bigint unsigned GENERATED ALWAYS AS (json_unquote(json_extract(`json`,_utf8mb4'$.refreshLeaseUntil'))) VIRTUAL,
  `json` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_session_user_status` (`userId`, `status`),
  KEY `idx_user_session_status_expiry` (`status`, `expiresAt`),
  KEY `idx_user_session_status_idle_expiry` (`status`, `idleExpiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

This keeps the indexed lookup columns cheap to query while avoiding unnecessary stored-column churn for fields that are only read during refresh, debug, or admin flows.

#### 5.4.2 PostgreSQL DDL pattern

PostgreSQL only supports `STORED` generated columns, and the existing repo schema already uses that style everywhere. The Postgres variant should therefore use `STORED` consistently.

```sql
CREATE TABLE public.user_session (
    id character varying(64) GENERATED ALWAYS AS ((json ->> 'id'::text)) STORED NOT NULL,
    userid character varying(36) GENERATED ALWAYS AS ((json ->> 'userId'::text)) STORED,
    status character varying(32) GENERATED ALWAYS AS ((json ->> 'status'::text)) STORED NOT NULL,
    expiresat bigint GENERATED ALWAYS AS (((json ->> 'expiresAt'::text))::bigint) STORED NOT NULL,
    idleexpiresat bigint GENERATED ALWAYS AS (((json ->> 'idleExpiresAt'::text))::bigint) STORED NOT NULL,
    sessiontype character varying(32) GENERATED ALWAYS AS ((json ->> 'type'::text)) STORED NOT NULL,
    provider character varying(64) GENERATED ALWAYS AS ((json ->> 'provider'::text)) STORED NOT NULL,
    version bigint GENERATED ALWAYS AS (((json ->> 'version'::text))::bigint) STORED NOT NULL,
    lastaccessedat bigint GENERATED ALWAYS AS (((json ->> 'lastAccessedAt'::text))::bigint) STORED,
    refreshleaseuntil bigint GENERATED ALWAYS AS (((json ->> 'refreshLeaseUntil'::text))::bigint) STORED,
    json jsonb NOT NULL
);

ALTER TABLE ONLY public.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (id);

CREATE INDEX idx_user_session_user_status
    ON public.user_session USING btree (userid, status);

CREATE INDEX idx_user_session_status_expiry
    ON public.user_session USING btree (status, expiresat);

CREATE INDEX idx_user_session_status_idle_expiry
    ON public.user_session USING btree (status, idleexpiresat);
```

### 5.5 Session ID generation

The `id` field is the bearer secret carried in the `OM_SESSION` cookie, so it should not be a UUID.

Recommended generation:

- 32 random bytes from `SecureRandom`
- base64url encoding without padding
- stored directly as `UserSession.id`
- exposed to the client only in the `OM_SESSION` cookie

This gives 256 bits of entropy, keeps the cookie opaque, and fits comfortably in `varchar(64)`.

### 5.6 Provider refresh token storage

Provider refresh tokens are high-value credentials and should be stored encrypted at rest.

For v1, the design should reuse OpenMetadata's existing encryption primitive instead of introducing a second secret-management path:

- encrypt with `Fernet.getInstance().encryptIfApplies(...)`
- decrypt only on refresh or upstream logout paths
- source the key from the existing `fernetConfiguration.fernetKey`
- never send the provider refresh token to the browser or UI

This is encryption at rest, not per-session key binding. If session secrets later need to move behind an external `SecretsManager`, the session layer should hide that behind a small codec abstraction.

## 6. Core Services

### 6.1 `SessionRepository`

Add a repository parallel to `TokenRepository`:

- `create(UserSession session)`
- `findById(String id)`
- `update(UserSession session)`
- `compareAndSetStatusVersion(...)`
- `delete(String id)`
- `markExpired(...)`
- `deleteExpired(...)`

### 6.2 `SessionCache`

Add a per-pod Caffeine cache:

- key: session ID
- value: `UserSession`
- TTL: short, for example 30 to 60 seconds after access
- explicit invalidation after local writes

This cache is not a correctness boundary. It is only a near-cache.

### 6.3 `SessionService`

Centralize all lifecycle operations:

- create pending session
- activate session
- load active session from cookie
- acquire refresh lease
- complete refresh
- revoke session
- clear cookie
- lazy-expire stale sessions

This service should replace direct `HttpSession` usage in auth handlers.

### 6.4 `SessionCleanupService`

Session rows will accumulate unless the system expires and prunes them proactively.

Add a lightweight cleanup service with a fixed-delay schedule:

- mark `ACTIVE` sessions as `EXPIRED` when `expiresAt < now()` or `idleExpiresAt < now()`
- delete `REVOKED` and `EXPIRED` sessions older than a retention window
- run every 15 minutes by default with a small random startup jitter
- keep the queries idempotent so it is safe if every node runs them

Recommended defaults:

- cleanup interval: 15 minutes
- lease duration: 15 seconds
- revoked or expired row retention: 7 days

Request paths should still lazy-expire obviously stale sessions on load so correctness does not depend on the background sweeper.

## 7. Consistency Model

### 7.1 No DB lookups on normal API traffic

Normal authenticated API and MCP bearer requests continue to use JWT validation only.

That means:

- `JwtFilter` does not query `user_session`.
- MCP auth filter remains stateless for bearer-token calls.

### 7.2 DB usage only on session endpoints

Database-backed session logic runs only on:

- `/api/v1/auth/login`
- `/api/v1/auth/refresh`
- `/api/v1/auth/logout`
- OIDC callback
- SAML callback and logout
- future interactive MCP auth endpoints

### 7.3 Refresh lease

Concurrent refresh is the hardest correctness problem in multi-node deployment.

Without a lease, two nodes can:

1. read the same session
2. both try to rotate the same upstream refresh token
3. produce session loss or inconsistent state

Chosen approach:

1. Load session from cache or DB.
2. Validate not `REVOKED` and not expired.
3. If the session is already `REFRESHING` but `refreshLeaseUntil < now()`, treat that lease as abandoned and allow a new claimant to recover it.
4. Acquire a short refresh lease through DB compare-and-set:
   - expected status = `ACTIVE`, or `REFRESHING` with stale lease
   - expected version = current version
   - next status = `REFRESHING`
   - set `refreshLeaseUntil`
   - increment `version`
5. Lease duration defaults to 15 seconds and should remain in the 10 to 30 second range.
6. Only the winner performs refresh or token rotation.
7. Losers reload the session using capped exponential backoff, for example `50ms`, `100ms`, `200ms`, `400ms`, `800ms`, then cap at `1s`, until:
   - status returns to `ACTIVE` with newer version, then use the updated session
   - or status becomes `REVOKED` or `EXPIRED`
   - or lease timeout is exceeded
8. If the winner crashes mid-refresh, the next refresh attempt reclaims the stale lease through the same CAS path. No manual repair flow is required.

This gives cross-node safety without putting a distributed lock system into the baseline design.

### 7.4 Logout and revocation semantics

Logout revokes the session in the DB and clears the cookie.

Already-issued access JWTs remain valid until expiry. That is acceptable because:

- normal API traffic must stay stateless
- DB lookups on every request are explicitly out of scope

To bound logout staleness, browser access JWT TTL should be shorter for session-backed auth flows.

Recommended default:

- browser access JWT TTL: 10 to 15 minutes
- session idle timeout: configurable, for example 7 days
- session absolute timeout: configurable, for example 30 days

An optional future improvement can add DB-polled revocation events or Redis pub/sub, but that is not required for v1.

## 8. Request Flows

### 8.1 Basic, LDAP, and OpenMetadata auth

1. Validate credentials.
2. Create OM refresh token in `user_tokens`.
3. Create a new `ACTIVE` `AUTH` session in `user_session`.
4. Allow multiple simultaneous sessions for the same user by default.
5. If `maxActiveSessionsPerUser` is configured and the new session would exceed the limit, revoke the least recently used active sessions for that user and session type.
6. Set `OM_SESSION` cookie.
7. Return OM-signed access JWT.

### 8.2 SAML

1. Login request creates a `PENDING` `AUTH` session holding redirect information.
2. Callback on any node loads the pending session from cookie and request state.
3. User is created or updated.
4. OM refresh token is created.
5. Session is promoted to `ACTIVE`.
6. Cookie is preserved, browser receives OM-signed access JWT.

### 8.3 Confidential OIDC

1. `/auth/login` creates `PENDING` `AUTH` session with:
   - redirect URI
   - OIDC state
   - nonce
   - PKCE verifier if needed
2. Browser is redirected to the provider.
3. Callback can land on any node.
4. Node loads the pending session from DB.
5. Authorization code is exchanged for upstream tokens.
6. Provider refresh token is encrypted with Fernet and stored in the session.
7. User is created or updated.
8. Session becomes `ACTIVE`.
9. Browser receives OM-signed access JWT.

### 8.4 Refresh

1. Browser sends `OM_SESSION` cookie.
2. Session service loads session from cache or DB.
3. Session service acquires the refresh lease.
4. Winner rotates OM refresh token or upstream provider refresh token if needed.
5. Session is updated and returned to `ACTIVE`.
6. Server returns a fresh OM-signed access JWT.

### 8.5 Logout

1. Browser sends `OM_SESSION` cookie.
2. Session is marked `REVOKED`.
3. OM refresh token is deleted if present.
4. Provider logout is called when applicable.
5. `OM_SESSION` cookie is cleared.

### 8.6 MCP

Current MCP bearer-token requests remain stateless.

If interactive MCP login is added, it should use the same `UserSession` table with:

- `type = MCP`
- the same refresh-lease and revocation semantics
- no per-request DB lookup after token issuance

## 9. Proposed Code Changes

### 9.1 New or updated spec and persistence

- Add `openmetadata-spec/src/main/resources/json/schema/auth/userSession.json`
- Add generated `UserSession` model
- Add Flyway migrations for MySQL and Postgres
- Update `CollectionDAO` row mappers and DAO methods
- Add `openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/SessionRepository.java`

### 9.2 New session services

- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionService.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionCache.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionCookieUtil.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionRefreshLease.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionIdGenerator.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/session/SessionCleanupService.java`

### 9.3 Auth handlers to migrate off `HttpSession`

- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/BasicAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/LdapAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/auth/SamlAuthServletHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/security/AuthenticationCodeFlowHandler.java`
- `openmetadata-service/src/main/java/org/openmetadata/service/OpenMetadataApplication.java`

### 9.4 Components to retire or reduce

- `JwtTokenCacheManager` should no longer be the source of logout invalidation.
- Servlet `HttpSession` should no longer hold security-critical auth state.

## 10. Operational Characteristics

### 10.1 DB call budget

Expected database behavior:

| Path | DB session read | DB session write | Notes |
| --- | --- | --- | --- |
| Normal API request | 0 | 0 | JWT only |
| Login | 0-1 | 1 | create session |
| OIDC callback | 1 | 1 | load pending, activate |
| Refresh same node warm cache | 0-1 | 1-2 | lease plus update |
| Refresh different node cold cache | 1 | 1-2 | bounded, auth-only |
| Logout | 0-1 | 1 | revoke session |

The important property is not "zero DB calls everywhere". The important property is:

- zero DB calls on the hot path for normal API traffic
- bounded DB calls on infrequent auth/session operations

### 10.2 Metrics

Add metrics for:

- session cache hits and misses
- sessions created, activated, refreshed, revoked, expired
- refresh lease acquisition success and contention
- provider token refresh latency
- session cleanup runs, expirations, and deletes

## 11. Testing Strategy

### 11.1 Unit tests in `openmetadata-service`

Add targeted unit tests for:

- session creation and activation
- secure session ID generation
- Fernet round-trip for provider refresh token persistence
- refresh lease acquisition
- stale lease recovery after winner crash
- concurrent refresh loser behavior
- revoke after cache hit on another node
- cookie parsing and clearing
- secure vs local `SameSite` cookie behavior
- cleanup task expiring and pruning rows
- OIDC callback state validation via persisted session state

Candidate test classes:

- `SessionServiceTest`
- `SessionRepositoryTest`
- `BasicAuthServletHandlerTest`
- `LdapAuthServletHandlerTest`
- `SamlAuthServletHandlerTest`
- `AuthenticationCodeFlowHandlerTest`

### 11.2 Integration test harness in `openmetadata-integration-tests`

#### 11.2.1 Required new harness pieces

Add a dedicated session test harness instead of trying to force the existing single shared app to simulate a cluster.

Proposed additions:

- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/MultiNodeOpenMetadataCluster.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/MultiNodeOpenMetadataExtension.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/MultiNodeOpenMetadataClusterRegistry.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/SessionTestClient.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/SessionTestUserFactory.java`
- `openmetadata-integration-tests/src/test/java/org/openmetadata/it/session/MockOidcProvider.java`

#### 11.2.2 Harness behavior

`MultiNodeOpenMetadataCluster` should:

1. Reuse the shared DB and search containers from `TestSuiteBootstrap`.
2. Start lazily, not during the main suite bootstrap. The first `@Tag("session")` test that asks for a given cluster profile should trigger startup.
3. Reuse that started cluster for the remaining session tests in the same profile instead of starting two new app nodes per class.
4. Support running only session tests via JUnit tag filters.
5. Start two additional `DropwizardAppExtension<OpenMetadataApplicationConfig>` instances.
6. Point both nodes at the same DB and search backend.
7. Give each node its own local caches and random ports.
8. Allow provider-specific config overrides without mutating the shared suite-wide app.
9. Be able to start from `openmetadata-secure-test.yaml` and override values such as:
   - `authenticationConfiguration.provider`
   - `authenticationConfiguration.clientType`
   - OIDC discovery and token endpoints
   - callback URLs for node A and node B

This is the only realistic way to verify that cache state is truly node-local while persistence is shared.

#### 11.2.3 Browser session client

`SessionTestClient` should use `java.net.http.HttpClient` with a dedicated per-instance `CookieManager`.

This is important because cookies are part of the session contract and must be isolated per test.

Do not use shared static SDK clients for browser session tests.

SDK clients remain useful only for:

- provisioning users
- reading entities
- making admin assertions

#### 11.2.4 Namespaced session users

`SessionTestUserFactory` should provision fresh namespaced users for every test method.

It should:

- use `TestNamespace`
- create a unique username and email per test
- create a password-backed user with `CreateUser.withPassword(...)`
- avoid shared pre-created users for login-flow assertions

This is required because browser session tests verify login, refresh, and logout behavior, not just authorization on already-issued bearer tokens.

#### 11.2.5 OIDC mock provider

Confidential OIDC tests need a deterministic upstream provider.

The simplest choice is a lightweight mock provider using JDK `HttpServer` that exposes:

- discovery document
- authorization endpoint
- token endpoint
- JWKS endpoint
- optional end-session endpoint

This avoids adding a large new dependency and keeps the test harness self-contained.

### 11.3 Integration test cases to add

#### 11.3.1 OpenMetadata or Basic session tests

1. `test_loginOnNodeA_refreshOnNodeB_succeeds`
2. `test_loginOnNodeA_logoutOnNodeB_revokesSession`
3. `test_revokedSessionOnNodeA_cannotRefreshFromStaleCacheOnNodeB`
4. `test_concurrentRefreshAcrossNodes_doesNotCorruptSession`
5. `test_expiredSessionRefreshReturnsUnauthorized`
6. `test_sameUserCanHoldMultipleSessionsAcrossClients`
7. `test_sessionLimitRevokesLeastRecentlyUsedSessionWhenConfigured`

#### 11.3.2 Confidential OIDC session tests

1. `test_oidcLoginCreatesPendingSession`
2. `test_oidcCallbackCanLandOnDifferentNode`
3. `test_oidcRefreshOnDifferentNode_usesPersistedProviderRefreshToken`
4. `test_oidcLogoutRevokesSessionAcrossNodes`

#### 11.3.3 MCP session tests

Only if interactive MCP session issuance is implemented in the same work:

1. `test_mcpInteractiveSessionRefreshAcrossNodes`
2. `test_mcpSessionRevocationAcrossNodes`

### 11.4 Parallel-test isolation rules

These tests must be safe under the current parallel suite configuration.

Rules:

1. Every test method must use `TestNamespace`.
2. Users created for login tests must have namespaced usernames and emails.
3. Every browser test client must have its own cookie jar.
4. Tests must never assert on global row counts in `user_session`.
5. Tests must filter assertions by namespaced user, email, or session ID.
6. Provider mocks must be per test method or per class with namespaced routes.
7. No test may mutate the shared suite-wide auth configuration.
8. Shared lazy clusters must be keyed by immutable profile so parallel tests never race to rewrite one cluster's auth mode.

Recommended naming pattern:

- user: `ns.prefix("session-user")`
- email: derived from the namespaced user
- session-specific redirect path or route namespace: `ns.shortPrefix("oidc")`

### 11.5 Why existing `TestNamespace` is still the right mechanism

`TestNamespace` already guarantees:

- unique prefixes per suite run
- method-level isolation
- compatibility with parallel execution

Session tests should continue to use it for all server-side entities and provider fixtures.

The one additional requirement is cookie isolation, which `TestNamespace` does not solve by itself. That is why `SessionTestClient` must own its own `CookieManager`.

## 12. Rollout Plan

### Phase 1

- add `user_session` schema and repository
- add `SessionService`
- add `SessionCleanupService`
- migrate OpenMetadata, Basic, LDAP, and SAML handlers
- add multi-node integration harness
- add cross-node tests for these providers

### Phase 2

- migrate confidential OIDC handler
- add mock OIDC provider harness
- add confidential OIDC multi-node tests

### Phase 3

- remove or deprecate pod-local logout cache
- finalize metrics and admin session-management APIs if needed
- extend to interactive MCP sessions if needed

## 13. Open Questions

1. Do we want a short-term feature flag to switch between servlet session mode and DB session mode during rollout?
2. Should browser access JWT TTL be reduced specifically for session-backed providers?
3. Do we want optional Redis or DB-polled invalidation events later, or is bounded logout staleness acceptable for the first release?

## 14. Recommended Default Decisions

1. Use DB-backed custom session storage, not Jetty session clustering.
2. Keep API bearer auth stateless.
3. Return OM-signed access JWTs for all server-managed session flows.
4. Use local near-cache plus DB compare-and-set refresh lease.
5. Generate `OM_SESSION` IDs from `SecureRandom`, not UUIDs.
6. Encrypt provider refresh tokens with the existing Fernet-based secret handling.
7. Allow multiple simultaneous `AUTH` sessions by default, with `maxActiveSessionsPerUser = 5` as the recommended starting limit.
8. Add multi-node integration tests before cutting over confidential OIDC.
