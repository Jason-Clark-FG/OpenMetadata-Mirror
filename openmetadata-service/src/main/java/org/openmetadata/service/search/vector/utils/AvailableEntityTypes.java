package org.openmetadata.service.search.vector.utils;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Registry of entity types that participate in vector embedding / semantic search.
 *
 * <p>The default list covers the OpenMetadata data assets that have first-class embedding support.
 * Downstream distributions (for example Collate) can plug in additional entity types at startup
 * via {@link #register(String)}, without needing to fork this file.
 */
public final class AvailableEntityTypes {
  private AvailableEntityTypes() {}

  /**
   * Mutable registry of vector-indexable entity types. Seeded with the OpenMetadata defaults;
   * additional types can be added at runtime via {@link #register(String)}.
   *
   * <p>Kept public for backwards compatibility with existing callers that iterate the list
   * directly (for example, reindex/reembed admin operations).
   */
  public static final List<String> LIST =
      new CopyOnWriteArrayList<>(
          List.of(
              "table",
              "glossary",
              "glossaryTerm",
              "chart",
              "dashboard",
              "dashboardDataModel",
              "database",
              "databaseSchema",
              "dataProduct",
              "pipeline",
              "mlmodel",
              "metric",
              "apiEndpoint",
              "apiCollection",
              "page",
              "storedProcedure",
              "searchIndex",
              "topic"));

  /** Lower-cased view of {@link #LIST} used for case-insensitive membership checks. */
  public static final Set<String> SET = ConcurrentHashMap.newKeySet();

  static {
    for (String type : LIST) {
      SET.add(type.toLowerCase(Locale.ROOT));
    }
  }

  /**
   * Register an additional entity type as vector-indexable. Intended to be called by downstream
   * distributions at application startup, before the search lifecycle handlers are installed.
   *
   * <p>Registration is idempotent and thread-safe.
   */
  public static void register(String entityType) {
    if (entityType == null || entityType.isBlank()) {
      return;
    }
    String lower = entityType.toLowerCase(Locale.ROOT);
    if (SET.add(lower) && !LIST.contains(entityType)) {
      LIST.add(entityType);
    }
  }

  public static boolean isVectorIndexable(String entityType) {
    return entityType != null && SET.contains(entityType.toLowerCase(Locale.ROOT));
  }
}
