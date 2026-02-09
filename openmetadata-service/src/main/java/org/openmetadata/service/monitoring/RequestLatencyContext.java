package org.openmetadata.service.monitoring;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Thread-local context for tracking request latencies using Micrometer.
 *
 * <p>This context can be shared across multiple worker threads using {@link #setContext} or {@link
 * #wrapWithContext} for operations like bulk processing. Database, search, and auth time tracking
 * uses atomic operations and aggregates correctly across threads.
 */
@Slf4j
public class RequestLatencyContext {
  private static final String ENDPOINT = "endpoint";
  private static final String METHOD = "method";
  private static final ThreadLocal<RequestContext> requestContext = new ThreadLocal<>();

  private static final ConcurrentHashMap<String, Timer> requestTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> databaseTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> searchTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> authTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> internalTimers = new ConcurrentHashMap<>();

  private static final Timer DUMMY_TIMER =
      Timer.builder("dummy.timer").register(Metrics.globalRegistry);

  public static void startRequest(String endpoint, String method) {
    String normalizedMethod = method.toUpperCase();
    RequestContext context = new RequestContext(endpoint, normalizedMethod);
    requestContext.set(context);
    String timerKey = endpoint + "|" + normalizedMethod;
    requestTimers.computeIfAbsent(
        timerKey,
        k ->
            Timer.builder("request.latency.total")
                .tag(ENDPOINT, endpoint)
                .tag(METHOD, normalizedMethod)
                .description("Total request latency")
                .serviceLevelObjectives(
                    Duration.ofMillis(100),
                    Duration.ofMillis(500),
                    Duration.ofSeconds(1),
                    Duration.ofSeconds(5),
                    Duration.ofSeconds(10))
                .register(Metrics.globalRegistry));
    context.requestTimerSample = Timer.start(Metrics.globalRegistry);
    context.internalTimerStartNanos.set(System.nanoTime());
  }

  public static Timer.Sample startDatabaseOperation() {
    RequestContext context = requestContext.get();
    if (context == null) {
      return null;
    }
    long internalStart = context.internalTimerStartNanos.getAndSet(0);
    if (internalStart > 0) {
      context.internalTime.addAndGet(System.nanoTime() - internalStart);
    }
    context.dbOperationCount.incrementAndGet();
    return Timer.start(Metrics.globalRegistry);
  }

  public static void endDatabaseOperation(Timer.Sample timerSample) {
    if (timerSample == null) return;
    RequestContext context = requestContext.get();
    if (context == null) return;
    long duration = timerSample.stop(DUMMY_TIMER);
    context.dbTime.addAndGet(duration);
    context.internalTimerStartNanos.set(System.nanoTime());
  }

  public static Timer.Sample startSearchOperation() {
    RequestContext context = requestContext.get();
    if (context == null) {
      return null;
    }
    long internalStart = context.internalTimerStartNanos.getAndSet(0);
    if (internalStart > 0) {
      context.internalTime.addAndGet(System.nanoTime() - internalStart);
    }
    context.searchOperationCount.incrementAndGet();
    return Timer.start(Metrics.globalRegistry);
  }

  public static void endSearchOperation(Timer.Sample timerSample) {
    if (timerSample == null) return;
    RequestContext context = requestContext.get();
    if (context == null) return;
    long duration = timerSample.stop(DUMMY_TIMER);
    context.searchTime.addAndGet(duration);
    context.internalTimerStartNanos.set(System.nanoTime());
  }

  public static Timer.Sample startAuthOperation() {
    RequestContext context = requestContext.get();
    if (context == null) {
      return null;
    }
    long internalStart = context.internalTimerStartNanos.getAndSet(0);
    if (internalStart > 0) {
      context.internalTime.addAndGet(System.nanoTime() - internalStart);
    }
    context.authOperationCount.incrementAndGet();
    return Timer.start(Metrics.globalRegistry);
  }

  public static void endAuthOperation(Timer.Sample timerSample) {
    if (timerSample == null) return;
    RequestContext context = requestContext.get();
    if (context == null) return;
    long duration = timerSample.stop(DUMMY_TIMER);
    context.authTime.addAndGet(duration);
    context.internalTimerStartNanos.set(System.nanoTime());
  }

  public static void endRequest() {
    RequestContext context = requestContext.get();
    if (context == null) return;

    String timerKey = context.endpoint + "|" + context.method;
    try {
      if (context.requestTimerSample != null) {
        Timer requestTimer = requestTimers.get(timerKey);
        if (requestTimer != null) {
          context.totalTime = context.requestTimerSample.stop(requestTimer);
        }
      }

      long finalInternalStart = context.internalTimerStartNanos.get();
      if (finalInternalStart > 0) {
        context.internalTime.addAndGet(System.nanoTime() - finalInternalStart);
      }

      long dbTimeNanos = context.dbTime.get();
      long searchTimeNanos = context.searchTime.get();
      long authTimeNanos = context.authTime.get();
      long internalTimeNanos = context.internalTime.get();
      int dbOps = context.dbOperationCount.get();

      Timer dbTimer =
          databaseTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.database")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (dbTimeNanos > 0) {
        dbTimer.record(dbTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      Timer searchTimer =
          searchTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.search")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (searchTimeNanos > 0) {
        searchTimer.record(searchTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      Timer authTimer =
          authTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.auth")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (authTimeNanos > 0) {
        authTimer.record(authTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      Timer internalTimer =
          internalTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.internal")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (internalTimeNanos > 0) {
        internalTimer.record(internalTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      if (context.totalTime > 1_000_000_000L) {
        LOG.warn(
            "Slow request - endpoint: {}, total: {}ms, db: {}ms, search: {}ms, auth: {}ms, internal: {}ms, dbOps: {}",
            context.endpoint,
            context.totalTime / 1_000_000,
            dbTimeNanos / 1_000_000,
            searchTimeNanos / 1_000_000,
            authTimeNanos / 1_000_000,
            internalTimeNanos / 1_000_000,
            dbOps);
      }

    } finally {
      requestContext.remove();
    }
  }

  public static RequestContext getContext() {
    return requestContext.get();
  }

  public static void setContext(RequestContext context) {
    if (context != null) {
      requestContext.set(context);
    }
  }

  public static void clearContext() {
    requestContext.remove();
  }

  public static Runnable wrapWithContext(Runnable task) {
    RequestContext ctx = getContext();
    if (ctx == null) return task;
    return () -> {
      setContext(ctx);
      try {
        task.run();
      } finally {
        clearContext();
      }
    };
  }

  public static <T> Supplier<T> wrapWithContext(Supplier<T> task) {
    RequestContext ctx = getContext();
    if (ctx == null) return task;
    return () -> {
      setContext(ctx);
      try {
        return task.get();
      } finally {
        clearContext();
      }
    };
  }

  public static void reset() {
    requestContext.remove();
    requestTimers.clear();
    databaseTimers.clear();
    searchTimers.clear();
    authTimers.clear();
    internalTimers.clear();
  }

  @Getter
  public static class RequestContext {
    final String endpoint;
    final String method;
    volatile Timer.Sample requestTimerSample;
    final AtomicLong internalTimerStartNanos = new AtomicLong(0);

    volatile long totalTime = 0;
    final AtomicLong dbTime = new AtomicLong(0);
    final AtomicLong searchTime = new AtomicLong(0);
    final AtomicLong authTime = new AtomicLong(0);
    final AtomicLong internalTime = new AtomicLong(0);

    final AtomicInteger dbOperationCount = new AtomicInteger(0);
    final AtomicInteger searchOperationCount = new AtomicInteger(0);
    final AtomicInteger authOperationCount = new AtomicInteger(0);

    RequestContext(String endpoint, String method) {
      this.endpoint = endpoint;
      this.method = method;
    }
  }
}
