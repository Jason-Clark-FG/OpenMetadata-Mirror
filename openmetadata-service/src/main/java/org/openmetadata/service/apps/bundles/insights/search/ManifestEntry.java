package org.openmetadata.service.apps.bundles.insights.search;

import java.time.LocalDate;

public record ManifestEntry(
    String entityId, String entityType, long lastProcessedUpdatedAt, LocalDate lastSnapshotDate) {}
