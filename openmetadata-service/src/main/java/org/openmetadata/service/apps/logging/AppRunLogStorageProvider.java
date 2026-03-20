package org.openmetadata.service.apps.logging;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

/** Strategy interface for storing and retrieving app run log files. */
public interface AppRunLogStorageProvider {

  /** Get an OutputStream for appending log lines during a run. */
  OutputStream getOutputStream(String appName, long runTimestamp, String serverId);

  /** Read the full log content for a completed or in-progress run. */
  String readLogs(String appName, long runTimestamp, String serverId);

  /** Get an InputStream for streaming log content (used by download endpoint). */
  InputStream readLogsStream(String appName, long runTimestamp, String serverId);

  /** List server IDs that have log files for a given run. */
  List<String> listServers(String appName, long runTimestamp);

  /** List run timestamps for an app, sorted descending (newest first). */
  List<Long> listRunTimestamps(String appName);

  /** Delete log files for a specific run (all servers). */
  void deleteRun(String appName, long runTimestamp);

  /** Check if a log file exists for the given run and server. */
  boolean exists(String appName, long runTimestamp, String serverId);

  /** Validate that a serverId is legitimate for the given run. */
  default boolean isValidServer(String appName, long runTimestamp, String serverId) {
    return listServers(appName, runTimestamp).contains(serverId);
  }

  /** Return the storage type identifier (e.g., "local", "s3"). */
  String getStorageType();
}
