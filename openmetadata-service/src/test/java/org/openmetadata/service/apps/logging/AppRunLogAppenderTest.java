package org.openmetadata.service.apps.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AppRunLogAppenderTest {

  @TempDir Path tempDir;

  private AppRunLogAppender appender;
  private LoggerContext loggerContext;

  @BeforeEach
  void setUp() {
    AppRunLogAppender.setLogDirectoryForTest(tempDir.toString());
    loggerContext = new LoggerContext();
    appender = new AppRunLogAppender();
    appender.setContext(loggerContext);
    appender.start();
  }

  @AfterEach
  void tearDown() {
    AppRunLogAppender.getActiveBuffers().clear();
    AppRunLogAppender.resetForTest();
    appender.stop();
  }

  @Test
  void eventsWithoutMdcAreIgnored() {
    LoggingEvent event = createEvent("test message", Map.of());
    appender.append(event);
    assertTrue(AppRunLogAppender.getActiveBuffers().isEmpty());
  }

  @Test
  void eventsWithMdcAreCapturedInBuffer() {
    String runId = "1000";
    AppRunLogAppender.startCapture(runId, "app-id-1", "TestApp", "server1");
    RunLogBuffer buffer = AppRunLogAppender.getBuffer(runId);
    assertNotNull(buffer);

    Map<String, String> mdc = new HashMap<>();
    mdc.put(AppRunLogAppender.MDC_APP_RUN_ID, runId);
    mdc.put(AppRunLogAppender.MDC_APP_NAME, "TestApp");
    LoggingEvent event = createEvent("hello world", mdc);
    appender.append(event);

    List<String> pending = buffer.getPendingLines();
    assertEquals(1, pending.size());
    assertTrue(pending.get(0).contains("hello world"));

    AppRunLogAppender.stopCapture(runId);
  }

  @Test
  void stopCaptureRemovesBuffer() {
    String runId = "2000";
    AppRunLogAppender.startCapture(runId, "app-id-2", "TestApp", "server1");
    assertNotNull(AppRunLogAppender.getBuffer(runId));

    AppRunLogAppender.stopCapture(runId);
    assertNull(AppRunLogAppender.getBuffer(runId));
  }

  @Test
  void logFileIsCreatedOnFlush() throws IOException {
    String runId = "3000";
    AppRunLogAppender.startCapture(runId, "app-id-3", "TestApp", "server1");
    RunLogBuffer buffer = AppRunLogAppender.getBuffer(runId);

    buffer.append("line one");
    buffer.append("line two");
    buffer.flush();

    Path logFile = AppRunLogAppender.getLogFilePath("TestApp", 3000L, "server1");
    assertTrue(Files.exists(logFile));
    String content = Files.readString(logFile);
    assertTrue(content.contains("line one"));
    assertTrue(content.contains("line two"));

    AppRunLogAppender.stopCapture(runId);
  }

  @Test
  void listServersForRunReturnsCorrectServers() throws IOException {
    Path appDir = tempDir.resolve("MyApp");
    Files.createDirectories(appDir);
    Files.createFile(appDir.resolve("5000-server1.log"));
    Files.createFile(appDir.resolve("5000-server2.log"));
    Files.createFile(appDir.resolve("6000-server1.log"));

    List<String> servers = AppRunLogAppender.listServersForRun("MyApp", 5000L);
    assertEquals(2, servers.size());
    assertTrue(servers.contains("server1"));
    assertTrue(servers.contains("server2"));

    List<String> servers2 = AppRunLogAppender.listServersForRun("MyApp", 6000L);
    assertEquals(1, servers2.size());
    assertTrue(servers2.contains("server1"));
  }

  @Test
  void listRunTimestampsReturnsSortedDescending() throws IOException {
    Path appDir = tempDir.resolve("SortApp");
    Files.createDirectories(appDir);
    Files.createFile(appDir.resolve("1000-s1.log"));
    Files.createFile(appDir.resolve("3000-s1.log"));
    Files.createFile(appDir.resolve("2000-s1.log"));

    List<Long> timestamps = AppRunLogAppender.listRunTimestamps("SortApp");
    assertEquals(List.of(3000L, 2000L, 1000L), timestamps);
  }

  @Test
  void cleanupOldRunsDeletesExcessFiles() throws IOException {
    AppRunLogAppender.setMaxRunsPerAppForTest(2);

    Path appDir = tempDir.resolve("CleanApp");
    Files.createDirectories(appDir);
    Files.createFile(appDir.resolve("1000-s1.log"));
    Files.createFile(appDir.resolve("2000-s1.log"));
    Files.createFile(appDir.resolve("3000-s1.log"));

    AppRunLogAppender.cleanupOldRuns("CleanApp");

    assertTrue(Files.exists(appDir.resolve("3000-s1.log")));
    assertFalse(Files.exists(appDir.resolve("1000-s1.log")));

    AppRunLogAppender.setMaxRunsPerAppForTest(5);
  }

  @Test
  void concurrentWritesFromMultipleThreadsAreSafe() throws InterruptedException {
    String runId = "7000";
    AppRunLogAppender.startCapture(runId, "app-id-7", "ConcurrentApp", "server1");
    RunLogBuffer buffer = AppRunLogAppender.getBuffer(runId);

    int threadCount = 10;
    int linesPerThread = 100;
    Thread[] threads = new Thread[threadCount];
    for (int i = 0; i < threadCount; i++) {
      final int threadIdx = i;
      threads[i] =
          new Thread(
              () -> {
                for (int j = 0; j < linesPerThread; j++) {
                  buffer.append("thread-" + threadIdx + "-line-" + j);
                }
              });
      threads[i].start();
    }
    for (Thread t : threads) {
      t.join();
    }

    assertEquals(threadCount * linesPerThread, buffer.getTotalLineCount());
    AppRunLogAppender.stopCapture(runId);
  }

  private LoggingEvent createEvent(String message, Map<String, String> mdc) {
    Logger logger = loggerContext.getLogger("test.logger");
    LoggingEvent event = new LoggingEvent();
    event.setLoggerName("test.logger");
    event.setLevel(Level.INFO);
    event.setMessage(message);
    event.setTimeStamp(System.currentTimeMillis());
    event.setThreadName("test-thread");
    event.setMDCPropertyMap(mdc);
    return event;
  }
}
