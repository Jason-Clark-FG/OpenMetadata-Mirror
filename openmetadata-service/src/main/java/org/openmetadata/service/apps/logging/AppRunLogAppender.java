package org.openmetadata.service.apps.logging;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.LoggerFactory;

/**
 * Logback appender that captures log events for app runs. Uses two-tier matching:
 *
 * <ol>
 *   <li>MDC {@code appRunId} — matches the main scheduler thread
 *   <li>Thread name prefix — matches worker threads (reindex-*, om-field-fetch-*, etc.)
 * </ol>
 *
 * <p>Storage is delegated to an {@link AppRunLogStorageProvider} (local filesystem or S3).
 */
public class AppRunLogAppender extends AppenderBase<ILoggingEvent> {
  public static final String MDC_APP_RUN_ID = "appRunId";
  public static final String MDC_APP_NAME = "appName";
  public static final String MDC_SERVER_ID = "serverId";
  public static final String MDC_APP_ID = "appId";

  private static final ConcurrentHashMap<String, RunLogBuffer> activeBuffers =
      new ConcurrentHashMap<>();

  private static final CopyOnWriteArrayList<ThreadPrefixBinding> threadPrefixBindings =
      new CopyOnWriteArrayList<>();

  private static final DateTimeFormatter FORMATTER =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

  private static volatile boolean registered = false;
  private static volatile AppRunLogStorageProvider storageProvider;
  private static volatile AppRunLogStorageConfig config;

  /** Initialize the appender with configuration. Call once during server startup. */
  public static void initialize(AppRunLogStorageConfig storageConfig) {
    config = storageConfig;
    storageProvider = storageConfig.createProvider();
  }

  public static AppRunLogStorageProvider getStorageProvider() {
    if (storageProvider == null) {
      storageProvider = new LocalAppRunLogStorage("./logs/app-runs");
    }
    return storageProvider;
  }

  static int getMaxRunsPerApp() {
    return config != null ? config.getMaxRunsPerApp() : 5;
  }

  static int getMaxLinesPerRun() {
    return config != null ? config.getMaxLinesPerRun() : 100_000;
  }

  @Override
  protected void append(ILoggingEvent event) {
    String runId = event.getMDCPropertyMap().get(MDC_APP_RUN_ID);
    if (runId != null) {
      String mdcAppName = event.getMDCPropertyMap().get(MDC_APP_NAME);
      if (mdcAppName != null) {
        RunLogBuffer buffer = activeBuffers.get(bufferKey(mdcAppName, runId));
        if (buffer != null) {
          buffer.append(formatLine(event));
          return;
        }
      }
    }

    if (!threadPrefixBindings.isEmpty()) {
      String threadName = event.getThreadName();
      for (ThreadPrefixBinding binding : threadPrefixBindings) {
        if (threadName.startsWith(binding.prefix)) {
          binding.buffer.append(formatLine(event));
          return;
        }
      }
    }
  }

  static String formatLine(ILoggingEvent event) {
    String timestamp = FORMATTER.format(Instant.ofEpochMilli(event.getTimeStamp()));
    return String.format(
        "%s [%s] %-5s %s - %s",
        timestamp,
        event.getThreadName(),
        event.getLevel(),
        event.getLoggerName(),
        event.getFormattedMessage());
  }

  private static final String APPENDER_NAME = "APP_RUN_LOG";

  private static void ensureRegistered() {
    if (registered) {
      return;
    }
    synchronized (AppRunLogAppender.class) {
      if (registered) {
        return;
      }
      LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
      Logger root = context.getLogger(Logger.ROOT_LOGGER_NAME);
      if (root.getAppender(APPENDER_NAME) != null) {
        registered = true;
        return;
      }
      AppRunLogAppender appender = new AppRunLogAppender();
      appender.setContext(context);
      appender.setName(APPENDER_NAME);
      appender.start();
      root.addAppender(appender);
      registered = true;
    }
  }

  public static String bufferKey(String appName, String runTimestamp) {
    return appName + "-" + runTimestamp;
  }

  /**
   * Start capturing logs for an app run.
   *
   * @param threadPrefixes thread name prefixes to capture (e.g. "reindex-", "om-field-fetch-").
   */
  public static RunLogBuffer startCapture(
      String appRunId, String appId, String appName, String serverId, String... threadPrefixes) {
    ensureRegistered();
    cleanupOldRuns(appName);
    AppRunLogStorageProvider provider = getStorageProvider();
    RunLogBuffer buffer =
        new RunLogBuffer(
            appId, appName, serverId, Long.parseLong(appRunId), getMaxLinesPerRun(), provider);
    activeBuffers.put(bufferKey(appName, appRunId), buffer);

    for (String prefix : threadPrefixes) {
      threadPrefixBindings.add(new ThreadPrefixBinding(prefix, buffer));
    }

    buffer.startFlusher();
    return buffer;
  }

  public static void stopCapture(String appName, String appRunId) {
    RunLogBuffer buffer = activeBuffers.remove(bufferKey(appName, appRunId));
    if (buffer != null) {
      threadPrefixBindings.removeIf(b -> b.buffer == buffer);
      buffer.close();
    }
  }

  public static RunLogBuffer getBuffer(String appName, String runTimestamp) {
    return activeBuffers.get(bufferKey(appName, runTimestamp));
  }

  static void cleanupOldRuns(String appName) {
    AppRunLogStorageProvider provider = getStorageProvider();
    List<Long> timestamps = provider.listRunTimestamps(appName);
    int maxRuns = getMaxRunsPerApp();
    if (timestamps.size() <= maxRuns) {
      return;
    }
    for (Long ts : timestamps.subList(maxRuns, timestamps.size())) {
      provider.deleteRun(appName, ts);
    }
  }

  static ConcurrentHashMap<String, RunLogBuffer> getActiveBuffers() {
    return activeBuffers;
  }

  static void setStorageProviderForTest(AppRunLogStorageProvider provider) {
    storageProvider = provider;
  }

  static void resetForTest() {
    registered = false;
    threadPrefixBindings.clear();
    config = null;
    storageProvider = null;
  }

  private static class ThreadPrefixBinding {
    final String prefix;
    final RunLogBuffer buffer;

    ThreadPrefixBinding(String prefix, RunLogBuffer buffer) {
      this.prefix = prefix;
      this.buffer = buffer;
    }
  }
}
