package org.openmetadata.service.apps.logging;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
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
 * <p>This avoids invasive MDC propagation across every thread pool. Instead, callers register thread
 * name prefixes at capture start, and the appender routes matching events to the right buffer.
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

  private static String logDirectory = "./logs/app-runs";
  private static int globalMaxLinesPerRun = 100_000;
  private static int globalMaxRunsPerApp = 5;
  private static volatile boolean registered = false;

  public void setMaxLinesPerRun(int maxLinesPerRun) {
    globalMaxLinesPerRun = maxLinesPerRun;
  }

  public void setMaxRunsPerApp(int maxRunsPerApp) {
    globalMaxRunsPerApp = maxRunsPerApp;
  }

  public void setLogDirectory(String dir) {
    logDirectory = dir;
  }

  @Override
  protected void append(ILoggingEvent event) {
    // Fast path: check MDC
    String runId = event.getMDCPropertyMap().get(MDC_APP_RUN_ID);
    if (runId != null) {
      RunLogBuffer buffer = activeBuffers.get(runId);
      if (buffer != null) {
        buffer.append(formatLine(event));
        return;
      }
    }

    // Second path: match thread name against registered prefixes
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

  private static void ensureRegistered() {
    if (registered) {
      return;
    }
    synchronized (AppRunLogAppender.class) {
      if (registered) {
        return;
      }
      LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
      AppRunLogAppender appender = new AppRunLogAppender();
      appender.setContext(context);
      appender.setName("APP_RUN_LOG");
      appender.start();
      context.getLogger(Logger.ROOT_LOGGER_NAME).addAppender(appender);
      registered = true;
    }
  }

  /**
   * Start capturing logs for an app run.
   *
   * @param threadPrefixes thread name prefixes whose log output should be captured (e.g.
   *     "reindex-", "om-field-fetch-"). The main scheduler thread is always captured via MDC.
   */
  public static RunLogBuffer startCapture(
      String appRunId, String appId, String appName, String serverId, String... threadPrefixes) {
    ensureRegistered();
    cleanupOldRuns(appName);
    Path logFile = getLogFilePath(appName, Long.parseLong(appRunId), serverId);
    RunLogBuffer buffer =
        new RunLogBuffer(
            appId, appName, serverId, Long.parseLong(appRunId), globalMaxLinesPerRun, logFile);
    activeBuffers.put(appRunId, buffer);

    for (String prefix : threadPrefixes) {
      threadPrefixBindings.add(new ThreadPrefixBinding(prefix, buffer));
    }

    buffer.startFlusher();
    return buffer;
  }

  public static void stopCapture(String appRunId) {
    RunLogBuffer buffer = activeBuffers.remove(appRunId);
    if (buffer != null) {
      threadPrefixBindings.removeIf(b -> b.buffer == buffer);
      buffer.close();
    }
  }

  public static RunLogBuffer getBuffer(String appRunId) {
    return activeBuffers.get(appRunId);
  }

  public static String getLogDirectory() {
    return logDirectory;
  }

  public static Path getLogFilePath(String appName, long runTimestamp, String serverId) {
    return Paths.get(logDirectory, appName, runTimestamp + "-" + serverId + ".log");
  }

  public static Path getAppLogDir(String appName) {
    return Paths.get(logDirectory, appName);
  }

  public static List<String> listServersForRun(String appName, long runTimestamp) {
    List<String> servers = new ArrayList<>();
    Path appDir = getAppLogDir(appName);
    if (!Files.isDirectory(appDir)) {
      return servers;
    }
    String prefix = runTimestamp + "-";
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(appDir, prefix + "*.log")) {
      for (Path entry : stream) {
        String fileName = entry.getFileName().toString();
        String serverId = fileName.substring(prefix.length(), fileName.length() - 4);
        servers.add(serverId);
      }
    } catch (IOException e) {
      // directory may not exist yet
    }
    return servers;
  }

  public static List<Long> listRunTimestamps(String appName) {
    Set<Long> timestamps = new TreeSet<>(Comparator.reverseOrder());
    Path appDir = getAppLogDir(appName);
    if (!Files.isDirectory(appDir)) {
      return new ArrayList<>();
    }
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(appDir, "*.log")) {
      for (Path entry : stream) {
        String fileName = entry.getFileName().toString();
        int dashIdx = fileName.indexOf('-');
        if (dashIdx > 0) {
          try {
            timestamps.add(Long.parseLong(fileName.substring(0, dashIdx)));
          } catch (NumberFormatException ignored) {
            // skip malformed files
          }
        }
      }
    } catch (IOException e) {
      // directory may not exist yet
    }
    return new ArrayList<>(timestamps);
  }

  static void cleanupOldRuns(String appName) {
    List<Long> timestamps = listRunTimestamps(appName);
    if (timestamps.size() < globalMaxRunsPerApp) {
      return;
    }
    List<Long> toDelete = timestamps.subList(globalMaxRunsPerApp - 1, timestamps.size());
    Path appDir = getAppLogDir(appName);
    for (long ts : toDelete) {
      try (DirectoryStream<Path> stream = Files.newDirectoryStream(appDir, ts + "-*.log")) {
        for (Path entry : stream) {
          Files.deleteIfExists(entry);
        }
      } catch (IOException e) {
        // best-effort cleanup
      }
    }
  }

  static ConcurrentHashMap<String, RunLogBuffer> getActiveBuffers() {
    return activeBuffers;
  }

  static void setLogDirectoryForTest(String dir) {
    logDirectory = dir;
  }

  static void setMaxRunsPerAppForTest(int max) {
    globalMaxRunsPerApp = max;
  }

  static void resetForTest() {
    registered = false;
    threadPrefixBindings.clear();
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
