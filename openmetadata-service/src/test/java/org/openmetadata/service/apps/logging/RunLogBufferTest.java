package org.openmetadata.service.apps.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RunLogBufferTest {

  @TempDir Path tempDir;

  private LocalAppRunLogStorage createStorage() {
    return new LocalAppRunLogStorage(tempDir.toString());
  }

  @Test
  void appendAndFlushWritesToStorage() throws IOException {
    LocalAppRunLogStorage storage = createStorage();
    RunLogBuffer buffer = new RunLogBuffer("app-1", "TestApp", "server1", 1000L, 100_000, storage);
    buffer.startFlusher();

    buffer.append("first line");
    buffer.append("second line");
    buffer.flush();

    String content = storage.readLogs("TestApp", 1000L, "server1");
    assertTrue(content.contains("first line"));
    assertTrue(content.contains("second line"));

    buffer.close();
  }

  @Test
  void lineCountTrackingIsAccurate() {
    RunLogBuffer buffer =
        new RunLogBuffer("app-2", "CountApp", "server1", 2000L, 100_000, createStorage());

    buffer.append("line 1");
    buffer.append("line 2");
    buffer.append("line 3");

    assertEquals(3, buffer.getTotalLineCount());
  }

  @Test
  void maxLinesCapDropsNewLines() {
    RunLogBuffer buffer = new RunLogBuffer("app-3", "MaxApp", "server1", 3000L, 5, createStorage());

    for (int i = 0; i < 10; i++) {
      buffer.append("line " + i);
    }

    assertEquals(5, buffer.getTotalLineCount());
    List<String> pending = buffer.getPendingLines();
    assertEquals(5, pending.size());
    assertEquals("line 0", pending.get(0));
    assertEquals("line 4", pending.get(4));
  }

  @Test
  void closeFlushesRemainingLines() {
    LocalAppRunLogStorage storage = createStorage();
    RunLogBuffer buffer = new RunLogBuffer("app-4", "CloseApp", "server1", 4000L, 100_000, storage);
    buffer.startFlusher();

    buffer.append("before close");
    buffer.close();

    String content = storage.readLogs("CloseApp", 4000L, "server1");
    assertTrue(content.contains("before close"));
    assertTrue(buffer.getPendingLines().isEmpty());
  }

  @Test
  void getPendingLinesReturnsUnflushedLines() {
    RunLogBuffer buffer =
        new RunLogBuffer("app-5", "PendApp", "server1", 5000L, 100_000, createStorage());

    buffer.append("pending 1");
    buffer.append("pending 2");

    List<String> pending = buffer.getPendingLines();
    assertEquals(2, pending.size());
    assertEquals("pending 1", pending.get(0));
    assertEquals("pending 2", pending.get(1));
  }

  @Test
  void multipleFlushesAppendToSameStorage() {
    LocalAppRunLogStorage storage = createStorage();
    RunLogBuffer buffer = new RunLogBuffer("app-6", "MultiApp", "server1", 6000L, 100_000, storage);
    buffer.startFlusher();

    buffer.append("batch 1 line");
    buffer.flush();

    buffer.append("batch 2 line");
    buffer.flush();

    String content = storage.readLogs("MultiApp", 6000L, "server1");
    assertTrue(content.contains("batch 1 line"));
    assertTrue(content.contains("batch 2 line"));

    buffer.close();
  }
}
