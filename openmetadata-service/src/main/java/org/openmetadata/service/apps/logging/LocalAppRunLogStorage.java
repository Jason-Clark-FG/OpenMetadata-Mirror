package org.openmetadata.service.apps.logging;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LocalAppRunLogStorage implements AppRunLogStorageProvider {
  private final Path baseDirectory;

  public LocalAppRunLogStorage(String directory) {
    this.baseDirectory = Paths.get(directory).toAbsolutePath().normalize();
  }

  @Override
  public OutputStream getOutputStream(String appName, long runTimestamp, String serverId) {
    try {
      Path logFile = resolveLogFile(appName, runTimestamp, serverId);
      Files.createDirectories(logFile.getParent());
      return Files.newOutputStream(
          logFile,
          java.nio.file.StandardOpenOption.CREATE,
          java.nio.file.StandardOpenOption.APPEND);
    } catch (IOException e) {
      throw new RuntimeException("Failed to open log file for writing", e);
    }
  }

  @Override
  public String readLogs(String appName, long runTimestamp, String serverId) {
    Path logFile = resolveLogFile(appName, runTimestamp, serverId);
    if (!Files.exists(logFile)) {
      return "";
    }
    try {
      return Files.readString(logFile);
    } catch (IOException e) {
      LOG.error("Failed to read log file {}", logFile, e);
      return "";
    }
  }

  @Override
  public InputStream readLogsStream(String appName, long runTimestamp, String serverId) {
    Path logFile = resolveLogFile(appName, runTimestamp, serverId);
    try {
      return Files.newInputStream(logFile);
    } catch (IOException e) {
      throw new RuntimeException("Failed to open log file for reading", e);
    }
  }

  @Override
  public List<String> listServers(String appName, long runTimestamp) {
    List<String> servers = new ArrayList<>();
    Path appDir = resolveAppDir(appName);
    if (!Files.isDirectory(appDir)) {
      return servers;
    }
    String prefix = runTimestamp + "-";
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(appDir, prefix + "*.log")) {
      for (Path entry : stream) {
        String fileName = entry.getFileName().toString();
        servers.add(fileName.substring(prefix.length(), fileName.length() - 4));
      }
    } catch (IOException e) {
      LOG.debug("Failed to list servers for {}/{}", appName, runTimestamp);
    }
    return servers;
  }

  @Override
  public List<Long> listRunTimestamps(String appName) {
    Set<Long> timestamps = new TreeSet<>(Comparator.reverseOrder());
    Path appDir = resolveAppDir(appName);
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
            // skip malformed
          }
        }
      }
    } catch (IOException e) {
      LOG.debug("Failed to list runs for {}", appName);
    }
    return new ArrayList<>(timestamps);
  }

  @Override
  public void deleteRun(String appName, long runTimestamp) {
    Path appDir = resolveAppDir(appName);
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(appDir, runTimestamp + "-*.log")) {
      for (Path entry : stream) {
        Files.deleteIfExists(entry);
      }
    } catch (IOException e) {
      LOG.debug("Failed to delete run {}/{}", appName, runTimestamp);
    }
  }

  @Override
  public boolean exists(String appName, long runTimestamp, String serverId) {
    return Files.exists(resolveLogFile(appName, runTimestamp, serverId));
  }

  @Override
  public String getStorageType() {
    return "local";
  }

  private Path resolveLogFile(String appName, long runTimestamp, String serverId) {
    Path resolved =
        baseDirectory.resolve(appName).resolve(runTimestamp + "-" + serverId + ".log").normalize();
    if (!resolved.startsWith(baseDirectory)) {
      throw new IllegalArgumentException("Invalid path components");
    }
    return resolved;
  }

  private Path resolveAppDir(String appName) {
    Path resolved = baseDirectory.resolve(appName).normalize();
    if (!resolved.startsWith(baseDirectory)) {
      throw new IllegalArgumentException("Invalid path components");
    }
    return resolved;
  }
}
