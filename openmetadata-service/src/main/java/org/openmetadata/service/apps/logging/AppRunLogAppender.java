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
import org.slf4j.LoggerFactory;

public class AppRunLogAppender extends AppenderBase<ILoggingEvent> {
  public static final String MDC_APP_RUN_ID = "appRunId";
  public static final String MDC_APP_NAME = "appName";
  public static final String MDC_SERVER_ID = "serverId";
  public static final String MDC_APP_ID = "appId";

  private static final ConcurrentHashMap<String, RunLogBuffer> activeBuffers =
      new ConcurrentHashMap<>();

  private static final DateTimeFormatter FORMATTER =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

  private static String logDirectory = "./logs/app-runs";
  private static int globalMaxLinesPerRun = 100_000;
  private static int globalMaxRunsPerApp = 5;
  private static volatile boolean registered = false;

  @Override
  public void start() {
    super.start();
  }

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
    String runId = event.getMDCPropertyMap().get(MDC_APP_RUN_ID);
    if (runId == null) {
      return;
    }
    RunLogBuffer buffer = activeBuffers.get(runId);
    if (buffer == null) {
      return;
    }
    buffer.append(formatLine(event));
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

  /**
   * Programmatically registers the appender on the root logger. Dropwizard overrides logback.xml
   * with its own YAML logging config, so we must attach ourselves at runtime.
   */
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

  public static RunLogBuffer startCapture(
      String appRunId, String appId, String appName, String serverId) {
    ensureRegistered();
    cleanupOldRuns(appName);
    Path logFile = getLogFilePath(appName, Long.parseLong(appRunId), serverId);
    RunLogBuffer buffer =
        new RunLogBuffer(
            appId, appName, serverId, Long.parseLong(appRunId), globalMaxLinesPerRun, logFile);
    activeBuffers.put(appRunId, buffer);
    buffer.startFlusher();
    return buffer;
  }

  public static void stopCapture(String appRunId) {
    RunLogBuffer buffer = activeBuffers.remove(appRunId);
    if (buffer != null) {
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
  }
}
