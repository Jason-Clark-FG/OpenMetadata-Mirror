package org.openmetadata.service.apps.logging;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class RunLogBuffer {
  private static final int FLUSH_INTERVAL_SECONDS = 3;

  @Getter private final String appId;
  @Getter private final String appName;
  @Getter private final String serverId;
  @Getter private final long runTimestamp;
  private final int maxLines;
  private final AppRunLogStorageProvider storageProvider;
  private final ConcurrentLinkedQueue<String> pending = new ConcurrentLinkedQueue<>();
  private final AtomicInteger totalLineCount = new AtomicInteger(0);
  private final List<Consumer<String>> streamListeners = new CopyOnWriteArrayList<>();
  private ScheduledExecutorService flusher;
  private OutputStream outputStream;

  public RunLogBuffer(
      String appId,
      String appName,
      String serverId,
      long runTimestamp,
      int maxLines,
      AppRunLogStorageProvider storageProvider) {
    this.appId = appId;
    this.appName = appName;
    this.serverId = serverId;
    this.runTimestamp = runTimestamp;
    this.maxLines = maxLines;
    this.storageProvider = storageProvider;
  }

  public void append(String line) {
    int current;
    do {
      current = totalLineCount.get();
      if (current >= maxLines) {
        return;
      }
    } while (!totalLineCount.compareAndSet(current, current + 1));
    pending.offer(line);
  }

  void startFlusher() {
    try {
      outputStream = storageProvider.getOutputStream(appName, runTimestamp, serverId);
    } catch (Exception e) {
      LOG.error(
          "Failed to open log output for {}/{}/{}: {}",
          appName,
          runTimestamp,
          serverId,
          e.getMessage());
      return;
    }

    flusher =
        Executors.newSingleThreadScheduledExecutor(
            r -> {
              Thread t = new Thread(r, "app-run-log-flusher-" + appName);
              t.setDaemon(true);
              return t;
            });
    flusher.scheduleWithFixedDelay(
        this::flush, FLUSH_INTERVAL_SECONDS, FLUSH_INTERVAL_SECONDS, TimeUnit.SECONDS);
  }

  void flush() {
    List<String> batch = drainPending();
    if (batch.isEmpty()) {
      return;
    }

    String batchText = String.join("\n", batch);
    writeToStorage(batchText);
    notifyListeners(batchText);
  }

  public void close() {
    if (flusher != null) {
      flusher.shutdown();
      try {
        flusher.awaitTermination(5, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
    flush();
    closeOutputStream();
    streamListeners.clear();
  }

  public void addStreamListener(Consumer<String> listener) {
    streamListeners.add(listener);
  }

  public void removeStreamListener(Consumer<String> listener) {
    streamListeners.remove(listener);
  }

  public List<String> getPendingLines() {
    return new ArrayList<>(pending);
  }

  public int getTotalLineCount() {
    return totalLineCount.get();
  }

  private List<String> drainPending() {
    List<String> batch = new ArrayList<>();
    String line;
    while ((line = pending.poll()) != null) {
      batch.add(line);
    }
    return batch;
  }

  private void writeToStorage(String batchText) {
    if (outputStream == null) {
      return;
    }
    try {
      outputStream.write((batchText + "\n").getBytes(StandardCharsets.UTF_8));
      outputStream.flush();
    } catch (IOException e) {
      LOG.warn("Failed to write app run logs for {}/{}: {}", appName, runTimestamp, e.getMessage());
    }
  }

  private void closeOutputStream() {
    if (outputStream != null) {
      try {
        outputStream.close();
      } catch (IOException e) {
        LOG.warn("Failed to close log output for {}/{}: {}", appName, runTimestamp, e.getMessage());
      }
    }
  }

  private void notifyListeners(String batchText) {
    for (Consumer<String> listener : streamListeners) {
      try {
        listener.accept(batchText);
      } catch (Exception e) {
        LOG.debug("Stream listener error, removing: {}", e.getMessage());
        streamListeners.remove(listener);
      }
    }
  }
}
