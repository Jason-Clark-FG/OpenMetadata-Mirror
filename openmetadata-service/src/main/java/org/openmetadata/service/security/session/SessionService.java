package org.openmetadata.service.security.session;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.dropwizard.lifecycle.Managed;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.security.AuthenticationConfiguration;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.service.fernet.Fernet;
import org.openmetadata.service.jdbi3.SessionRepository;

@Slf4j
public class SessionService implements Managed {
  private static final int DEFAULT_IDLE_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
  private static final int DEFAULT_ABSOLUTE_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;
  private static final int PENDING_SESSION_TIMEOUT_SECONDS = 10 * 60;
  private static final int MIN_IDLE_TIMEOUT_SECONDS = 60 * 60;
  private static final long REFRESH_LEASE_MILLIS = 15_000L;
  private static final long CLEANUP_INTERVAL_MINUTES = 15L;
  private static final long CLEANUP_RETENTION_MILLIS = TimeUnit.DAYS.toMillis(7);
  private static final int CLEANUP_BATCH_SIZE = 1_000;
  private static final int MAX_ACTIVE_SESSIONS_PER_USER = 5;
  private static final int SESSION_LIMIT_RETRIES = 3;

  private volatile AuthenticationConfiguration authConfig;
  private final SessionRepository repository;
  private final Cache<String, UserSession> cache;
  private final ScheduledExecutorService scheduler;
  private final AtomicBoolean started = new AtomicBoolean(false);
  private final AtomicBoolean lowIdleTimeoutLogged = new AtomicBoolean(false);

  public SessionService(AuthenticationConfiguration authConfig) {
    this(
        authConfig,
        new SessionRepository(),
        Caffeine.newBuilder().maximumSize(10_000).expireAfterAccess(60, TimeUnit.SECONDS).build(),
        Executors.newSingleThreadScheduledExecutor(
            runnable ->
                Thread.ofPlatform().name("om-session-cleanup").daemon(true).unstarted(runnable)));
  }

  SessionService(
      AuthenticationConfiguration authConfig,
      SessionRepository repository,
      Cache<String, UserSession> cache,
      ScheduledExecutorService scheduler) {
    this.authConfig = authConfig;
    this.repository = repository;
    this.cache = cache;
    this.scheduler = scheduler;
  }

  public void updateConfiguration(AuthenticationConfiguration authConfig) {
    this.authConfig = authConfig;
    lowIdleTimeoutLogged.set(false);
  }

  @Override
  public void start() {
    if (!started.compareAndSet(false, true)) {
      return;
    }
    scheduler.scheduleWithFixedDelay(
        this::runCleanupSafely,
        CLEANUP_INTERVAL_MINUTES,
        CLEANUP_INTERVAL_MINUTES,
        TimeUnit.MINUTES);
  }

  @Override
  public void stop() {
    if (!started.compareAndSet(true, false)) {
      return;
    }
    scheduler.shutdownNow();
  }

  public UserSession createActiveSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response,
      String provider,
      User user,
      String omRefreshToken) {
    long now = System.currentTimeMillis();
    UserSession session =
        UserSession.builder()
            .id(SessionIdGenerator.newSessionId())
            .type(SessionType.AUTH)
            .provider(provider)
            .status(SessionStatus.ACTIVE)
            .userId(user.getId().toString())
            .username(user.getName())
            .email(user.getEmail())
            .omRefreshToken(encryptIfPresent(omRefreshToken))
            .version(0L)
            .createdAt(now)
            .updatedAt(now)
            .lastAccessedAt(now)
            .expiresAt(now + TimeUnit.SECONDS.toMillis(DEFAULT_ABSOLUTE_TIMEOUT_SECONDS))
            .idleExpiresAt(now + TimeUnit.SECONDS.toMillis(getIdleTimeoutSeconds()))
            .build();
    repository.create(session);
    cache.put(session.getId(), session);
    applySessionLimit(user.getId().toString(), session.getId());
    SessionCookieUtil.writeSessionCookie(
        request, response, authConfig, session.getId(), getIdleTimeoutSeconds());
    return session;
  }

  public UserSession createPendingSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response,
      String provider,
      String redirectUri,
      String state,
      String nonce,
      String pkceVerifier) {
    long now = System.currentTimeMillis();
    long pendingExpiry = now + TimeUnit.SECONDS.toMillis(PENDING_SESSION_TIMEOUT_SECONDS);
    UserSession session =
        UserSession.builder()
            .id(SessionIdGenerator.newSessionId())
            .type(SessionType.AUTH)
            .provider(provider)
            .status(SessionStatus.PENDING)
            .redirectUri(redirectUri)
            .state(state)
            .nonce(nonce)
            .pkceVerifier(pkceVerifier)
            .version(0L)
            .createdAt(now)
            .updatedAt(now)
            .lastAccessedAt(now)
            .expiresAt(pendingExpiry)
            .idleExpiresAt(pendingExpiry)
            .build();
    repository.create(session);
    cache.put(session.getId(), session);
    SessionCookieUtil.writeSessionCookie(
        request, response, authConfig, session.getId(), PENDING_SESSION_TIMEOUT_SECONDS);
    return session;
  }

  public Optional<UserSession> activatePendingSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response,
      UserSession pendingSession,
      User user,
      String omRefreshToken,
      String providerRefreshToken) {
    long now = System.currentTimeMillis();
    long expectedVersion = safeVersion(pendingSession);
    UserSession updated =
        pendingSession.toBuilder()
            .status(SessionStatus.ACTIVE)
            .userId(user.getId().toString())
            .username(user.getName())
            .email(user.getEmail())
            .omRefreshToken(encryptIfPresent(omRefreshToken))
            .providerRefreshToken(encryptIfPresent(providerRefreshToken))
            .state(null)
            .nonce(null)
            .pkceVerifier(null)
            .refreshLeaseUntil(null)
            .lastAccessedAt(now)
            .updatedAt(now)
            .expiresAt(now + TimeUnit.SECONDS.toMillis(DEFAULT_ABSOLUTE_TIMEOUT_SECONDS))
            .idleExpiresAt(now + TimeUnit.SECONDS.toMillis(getIdleTimeoutSeconds()))
            .version(expectedVersion + 1)
            .build();
    if (!repository.updateIfVersion(updated, expectedVersion)) {
      return repository.findById(updated.getId());
    }
    cache.put(updated.getId(), updated);
    applySessionLimit(user.getId().toString(), updated.getId());
    SessionCookieUtil.writeSessionCookie(
        request, response, authConfig, updated.getId(), getIdleTimeoutSeconds());
    return Optional.of(updated);
  }

  public Optional<UserSession> getSession(jakarta.servlet.http.HttpServletRequest request) {
    return SessionCookieUtil.getSessionId(request).flatMap(this::getSessionById);
  }

  public Optional<UserSession> getPendingSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    Optional<UserSession> session = getSession(request);
    if (session.isEmpty()) {
      SessionCookieUtil.clearSessionCookie(request, response, authConfig);
      return Optional.empty();
    }

    UserSession userSession = session.get();
    if (userSession.getStatus() != SessionStatus.PENDING || userSession.isExpired(now())) {
      expireIfNecessary(userSession);
      SessionCookieUtil.clearSessionCookie(request, response, authConfig);
      return Optional.empty();
    }
    return Optional.of(userSession);
  }

  public Optional<UserSession> getActiveSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    Optional<UserSession> session = getSession(request);
    if (session.isEmpty()) {
      SessionCookieUtil.clearSessionCookie(request, response, authConfig);
      return Optional.empty();
    }
    UserSession userSession = session.get();
    if (userSession.getStatus() != SessionStatus.ACTIVE || userSession.isExpired(now())) {
      expireIfNecessary(userSession);
      SessionCookieUtil.clearSessionCookie(request, response, authConfig);
      return Optional.empty();
    }
    return Optional.of(userSession);
  }

  public Optional<UserSession> acquireRefreshLease(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    Optional<UserSession> maybeSession = getSession(request);
    if (maybeSession.isEmpty()) {
      SessionCookieUtil.clearSessionCookie(request, response, authConfig);
      return Optional.empty();
    }

    UserSession current = maybeSession.get();

    while (current != null) {
      long now = now();
      if (current.isExpired(now)
          || current.getStatus() == SessionStatus.REVOKED
          || current.getStatus() == SessionStatus.EXPIRED
          || current.getStatus() == SessionStatus.PENDING) {
        expireIfNecessary(current);
        SessionCookieUtil.clearSessionCookie(request, response, authConfig);
        return Optional.empty();
      }

      if (current.getStatus() == SessionStatus.REFRESHING && !current.hasStaleRefreshLease(now)) {
        UserSession refreshed = reloadSession(current.getId()).orElse(null);
        if (refreshed == null) {
          SessionCookieUtil.clearSessionCookie(request, response, authConfig);
          return Optional.empty();
        }
        if (refreshed.getStatus() == SessionStatus.REFRESHING
            && !refreshed.hasStaleRefreshLease(now)) {
          throw new SessionRefreshInProgressException(getRetryAfterMillis(refreshed, now));
        }
        current = refreshed;
        continue;
      }

      long expectedVersion = safeVersion(current);
      UserSession leased =
          current.toBuilder()
              .status(SessionStatus.REFRESHING)
              .refreshLeaseUntil(now + REFRESH_LEASE_MILLIS)
              .lastAccessedAt(now)
              .updatedAt(now)
              .idleExpiresAt(now + TimeUnit.SECONDS.toMillis(getIdleTimeoutSeconds()))
              .version(expectedVersion + 1)
              .build();
      if (repository.updateIfVersion(leased, expectedVersion)) {
        cache.put(leased.getId(), leased);
        return Optional.of(leased);
      }

      current = reloadSession(current.getId()).orElse(null);
    }

    SessionCookieUtil.clearSessionCookie(request, response, authConfig);
    return Optional.empty();
  }

  public Optional<UserSession> completeRefresh(
      UserSession leasedSession, String omRefreshToken, String providerRefreshToken) {
    long now = System.currentTimeMillis();
    long expectedVersion = safeVersion(leasedSession);
    UserSession refreshed =
        leasedSession.toBuilder()
            .status(SessionStatus.ACTIVE)
            .omRefreshToken(
                omRefreshToken == null
                    ? leasedSession.getOmRefreshToken()
                    : encryptIfPresent(omRefreshToken))
            .providerRefreshToken(
                providerRefreshToken == null
                    ? leasedSession.getProviderRefreshToken()
                    : encryptIfPresent(providerRefreshToken))
            .refreshLeaseUntil(null)
            .lastAccessedAt(now)
            .updatedAt(now)
            .idleExpiresAt(now + TimeUnit.SECONDS.toMillis(getIdleTimeoutSeconds()))
            .version(expectedVersion + 1)
            .build();
    if (!repository.updateIfVersion(refreshed, expectedVersion)) {
      return reloadSession(refreshed.getId());
    }
    cache.put(refreshed.getId(), refreshed);
    return Optional.of(refreshed);
  }

  public void revokeSession(
      jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    SessionCookieUtil.getSessionId(request).ifPresent(this::revokeSession);
    SessionCookieUtil.clearSessionCookie(request, response, authConfig);
  }

  public Optional<UserSession> revokeSession(String sessionId) {
    UserSession current = reloadSession(sessionId).orElse(null);
    if (current == null) {
      cache.invalidate(sessionId);
      return Optional.empty();
    }

    for (int attempt = 0; attempt < SESSION_LIMIT_RETRIES && current != null; attempt++) {
      if (current.getStatus() == SessionStatus.REVOKED
          || current.getStatus() == SessionStatus.EXPIRED) {
        cache.put(current.getId(), current);
        return Optional.of(current);
      }

      long now = System.currentTimeMillis();
      if (current.isExpired(now)) {
        expireIfNecessary(current);
        current = reloadSession(sessionId).orElse(null);
        continue;
      }

      long expectedVersion = safeVersion(current);
      UserSession revoked =
          current.toBuilder()
              .status(SessionStatus.REVOKED)
              .refreshLeaseUntil(null)
              .updatedAt(now)
              .lastAccessedAt(now)
              .version(expectedVersion + 1)
              .build();
      if (repository.updateIfVersion(revoked, expectedVersion)) {
        cache.put(revoked.getId(), revoked);
        return Optional.of(revoked);
      }

      current = reloadSession(sessionId).orElse(null);
    }

    if (current == null) {
      cache.invalidate(sessionId);
      return Optional.empty();
    }
    LOG.error("Failed to revoke session {} after {} attempts", sessionId, SESSION_LIMIT_RETRIES);
    cache.put(current.getId(), current);
    return Optional.of(current);
  }

  public Optional<UserSession> getSessionById(String sessionId) {
    UserSession cachedSession = cache.getIfPresent(sessionId);
    if (cachedSession != null) {
      return Optional.of(cachedSession);
    }

    return reloadSession(sessionId);
  }

  public String decryptProviderRefreshToken(UserSession session) {
    if (nullOrEmpty(session.getProviderRefreshToken())) {
      return null;
    }
    return Fernet.getInstance().decryptIfApplies(session.getProviderRefreshToken());
  }

  public String decryptOmRefreshToken(UserSession session) {
    if (nullOrEmpty(session.getOmRefreshToken())) {
      return null;
    }
    return Fernet.getInstance().decryptIfApplies(session.getOmRefreshToken());
  }

  public void runCleanupOnce() {
    long now = now();
    expireSessionsInBatches(now);
    pruneSessionsInBatches(now - CLEANUP_RETENTION_MILLIS);
  }

  private void runCleanupSafely() {
    try {
      runCleanupOnce();
    } catch (Exception e) {
      LOG.warn("Failed to run session cleanup", e);
    }
  }

  private void applySessionLimit(String userId, String currentSessionId) {
    for (int attempt = 0; attempt < SESSION_LIMIT_RETRIES; attempt++) {
      List<UserSession> sessions =
          new ArrayList<>(repository.findByUserIdAndStatus(userId, SessionStatus.ACTIVE));
      if (sessions.size() <= MAX_ACTIVE_SESSIONS_PER_USER) {
        return;
      }

      List<UserSession> sessionsToRevoke =
          sessions.stream()
              .filter(session -> !currentSessionId.equals(session.getId()))
              .sorted(
                  Comparator.comparing(
                      session ->
                          session.getLastAccessedAt() == null ? 0L : session.getLastAccessedAt()))
              .limit(Math.max(0, sessions.size() - MAX_ACTIVE_SESSIONS_PER_USER))
              .toList();
      if (sessionsToRevoke.isEmpty()) {
        return;
      }

      sessionsToRevoke.forEach(
          session -> {
            revokeSession(session.getId());
            cache.invalidate(session.getId());
          });
    }
    LOG.warn("Unable to enforce active session limit for user {}", userId);
  }

  private void expireSessionsInBatches(long now) {
    while (true) {
      List<UserSession> sessions = repository.findSessionsToExpire(now, CLEANUP_BATCH_SIZE);
      if (sessions.isEmpty()) {
        return;
      }
      sessions.forEach(this::expireIfNecessary);
      if (sessions.size() < CLEANUP_BATCH_SIZE) {
        return;
      }
    }
  }

  private Optional<UserSession> reloadSession(String sessionId) {
    Optional<UserSession> session = repository.findById(sessionId);
    if (session.isPresent()) {
      cache.put(session.get().getId(), session.get());
    } else {
      cache.invalidate(sessionId);
    }
    return session;
  }

  private long getRetryAfterMillis(UserSession session, long now) {
    if (session.getRefreshLeaseUntil() == null) {
      return REFRESH_LEASE_MILLIS;
    }
    return Math.max(1L, session.getRefreshLeaseUntil() - now);
  }

  private void pruneSessionsInBatches(long cutoff) {
    while (true) {
      List<UserSession> sessions = repository.findSessionsToPrune(cutoff, CLEANUP_BATCH_SIZE);
      if (sessions.isEmpty()) {
        return;
      }
      sessions.forEach(
          session -> {
            repository.delete(session.getId());
            cache.invalidate(session.getId());
          });
      if (sessions.size() < CLEANUP_BATCH_SIZE) {
        return;
      }
    }
  }

  private void expireIfNecessary(UserSession session) {
    long now = System.currentTimeMillis();
    if (!session.isExpired(now) || session.getStatus() == SessionStatus.REVOKED) {
      return;
    }

    long expectedVersion = safeVersion(session);
    UserSession expired =
        session.toBuilder()
            .status(SessionStatus.EXPIRED)
            .refreshLeaseUntil(null)
            .updatedAt(now)
            .version(expectedVersion + 1)
            .build();
    if (repository.updateIfVersion(expired, expectedVersion)) {
      cache.put(expired.getId(), expired);
    } else {
      repository.findById(session.getId()).ifPresent(value -> cache.put(value.getId(), value));
    }
  }

  private String encryptIfPresent(String value) {
    if (nullOrEmpty(value)) {
      return null;
    }
    return Fernet.getInstance().encryptIfApplies(value);
  }

  private int getIdleTimeoutSeconds() {
    if (authConfig.getOidcConfiguration() != null
        && authConfig.getOidcConfiguration().getSessionExpiry() != null) {
      int configuredSessionExpiry = authConfig.getOidcConfiguration().getSessionExpiry();
      if (configuredSessionExpiry >= MIN_IDLE_TIMEOUT_SECONDS) {
        return configuredSessionExpiry;
      }
      if (lowIdleTimeoutLogged.compareAndSet(false, true)) {
        LOG.warn(
            "Configured sessionExpiry {} is below the supported minimum {}. Falling back to {} seconds.",
            configuredSessionExpiry,
            MIN_IDLE_TIMEOUT_SECONDS,
            DEFAULT_IDLE_TIMEOUT_SECONDS);
      }
    }
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }

  private long safeVersion(UserSession session) {
    return session.getVersion() == null ? 0L : session.getVersion();
  }

  private long now() {
    return System.currentTimeMillis();
  }
}
