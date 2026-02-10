package org.openmetadata.service.monitoring;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Thread-local context for tracking request latencies using Micrometer.
 *
 * <p>This context can be shared across multiple worker threads using {@link #setContext} or {@link
 * #wrapWithContext} for operations like bulk processing. Database, search, auth, and RDF time
 * tracking uses atomic operations and aggregates correctly across threads.
 */
@Slf4j(topic = "org.openmetadata.slowrequest")
public class RequestLatencyContext {

  private static final String ENDPOINT = "endpoint";
  private static final String METHOD = "method";
  private static final ThreadLocal<RequestContext> requestContext = new ThreadLocal<>();

  private static final ConcurrentHashMap<String, Timer> requestTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> databaseTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> searchTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> authTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> rdfTimers = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Timer> serverTimers = new ConcurrentHashMap<>();

  private static final Timer DUMMY_TIMER =
      Timer.builder("dummy.timer").register(Metrics.globalRegistry);

  public static void startRequest(String endpoint, String method, String uriPath) {
    String normalizedMethod = method.toUpperCase();
    RequestContext context = new RequestContext(endpoint, normalizedMethod, uriPath);
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

  public static void startRequest(String endpoint, String method) {
    startRequest(endpoint, method, null);
  }

  public static Timer.Sample startDatabaseOperation() {
    RequestContext context = requestContext.get();
    if (context == null) {
      return null;
    }
    long internalStart = context.internalTimerStartNanos.getAndSet(0);
    if (internalStart > 0) {
      context.serverTime.addAndGet(System.nanoTime() - internalStart);
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
      context.serverTime.addAndGet(System.nanoTime() - internalStart);
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
      context.serverTime.addAndGet(System.nanoTime() - internalStart);
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

  public static Timer.Sample startRdfOperation() {
    RequestContext context = requestContext.get();
    if (context == null) {
      return null;
    }
    long internalStart = context.internalTimerStartNanos.getAndSet(0);
    if (internalStart > 0) {
      context.serverTime.addAndGet(System.nanoTime() - internalStart);
    }
    context.rdfOperationCount.incrementAndGet();
    return Timer.start(Metrics.globalRegistry);
  }

  public static void endRdfOperation(Timer.Sample timerSample) {
    if (timerSample == null) return;
    RequestContext context = requestContext.get();
    if (context == null) return;
    long duration = timerSample.stop(DUMMY_TIMER);
    context.rdfTime.addAndGet(duration);
    context.internalTimerStartNanos.set(System.nanoTime());
  }

  public static Phase phase(String name) {
    RequestContext context = requestContext.get();
    if (context == null) {
      return Phase.NOOP;
    }
    return new Phase(name, context);
  }

  public static class Phase implements AutoCloseable {
    static final Phase NOOP = new Phase(null, null);

    private final String name;
    private final RequestContext context;
    private final long startNanos;

    private Phase(String name, RequestContext context) {
      this.name = name;
      this.context = context;
      this.startNanos = context != null ? System.nanoTime() : 0;
    }

    @Override
    public void close() {
      if (context != null) {
        long elapsed = System.nanoTime() - startNanos;
        context.phaseTime.computeIfAbsent(name, k -> new AtomicLong(0)).addAndGet(elapsed);
      }
    }
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
        context.serverTime.addAndGet(System.nanoTime() - finalInternalStart);
      }

      long dbTimeNanos = context.dbTime.get();
      long searchTimeNanos = context.searchTime.get();
      long authTimeNanos = context.authTime.get();
      long rdfTimeNanos = context.rdfTime.get();
      long serverTimeNanos = context.serverTime.get();
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

      Timer rdfTimer =
          rdfTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.rdf")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (rdfTimeNanos > 0) {
        rdfTimer.record(rdfTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      Timer serverTimer =
          serverTimers.computeIfAbsent(
              timerKey,
              k ->
                  Timer.builder("request.latency.server")
                      .tag(ENDPOINT, context.endpoint)
                      .tag(METHOD, context.method)
                      .register(Metrics.globalRegistry));
      if (serverTimeNanos > 0) {
        serverTimer.record(serverTimeNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
      }

      if (context.totalTime > 200_000_000L) {
        String path = context.uriPath != null ? context.uriPath : context.endpoint;
        String phaseBreakdown = formatPhaseBreakdown(context.phaseTime);
        LOG.warn(
            "Slow request - {} {}, total: {}ms, db: {}ms, search: {}ms, auth: {}ms, rdf: {}ms,"
                + " server: {}ms, dbOps: {}, searchOps: {}, rdfOps: {}{}",
            context.method,
            path,
            context.totalTime / 1_000_000,
            dbTimeNanos / 1_000_000,
            searchTimeNanos / 1_000_000,
            authTimeNanos / 1_000_000,
            rdfTimeNanos / 1_000_000,
            serverTimeNanos / 1_000_000,
            dbOps,
            context.searchOperationCount.get(),
            context.rdfOperationCount.get(),
            phaseBreakdown);
      }

    } finally {
      requestContext.remove();
    }
  }

  private static String formatPhaseBreakdown(ConcurrentHashMap<String, AtomicLong> phaseTime) {
    if (phaseTime.isEmpty()) {
      return "";
    }
    String phases =
        phaseTime.entrySet().stream()
            .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
            .map(e -> e.getKey() + ": " + (e.getValue().get() / 1_000_000) + "ms")
            .collect(Collectors.joining(", "));
    return ", phases: {" + phases + "}";
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
    rdfTimers.clear();
    serverTimers.clear();
  }

  @Getter
  public static class RequestContext {
    final String endpoint;
    final String method;
    final String uriPath;
    volatile Timer.Sample requestTimerSample;
    final AtomicLong internalTimerStartNanos = new AtomicLong(0);

    volatile long totalTime = 0;
    final AtomicLong dbTime = new AtomicLong(0);
    final AtomicLong searchTime = new AtomicLong(0);
    final AtomicLong authTime = new AtomicLong(0);
    final AtomicLong rdfTime = new AtomicLong(0);
    final AtomicLong serverTime = new AtomicLong(0);

    final AtomicInteger dbOperationCount = new AtomicInteger(0);
    final AtomicInteger searchOperationCount = new AtomicInteger(0);
    final AtomicInteger authOperationCount = new AtomicInteger(0);
    final AtomicInteger rdfOperationCount = new AtomicInteger(0);

    final ConcurrentHashMap<String, AtomicLong> phaseTime = new ConcurrentHashMap<>();

    RequestContext(String endpoint, String method, String uriPath) {
      this.endpoint = endpoint;
      this.method = method;
      this.uriPath = uriPath;
    }

    RequestContext(String endpoint, String method) {
      this(endpoint, method, null);
    }
  }
}
