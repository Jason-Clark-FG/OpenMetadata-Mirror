package org.openmetadata.service.jdbi3;

import static org.openmetadata.schema.type.Include.ALL;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.type.Votes;

/**
 * Request-scoped read bundle.
 *
 * <p>Semantics:
 *
 * <ul>
 *   <li>Optional.empty() means "not loaded"
 *   <li>Optional.of(emptyList()) means "loaded and empty"
 * </ul>
 */
final class ReadBundle {
  private final Map<RelationKey, List<EntityReference>> relationValues = new HashMap<>();
  private final Set<RelationKey> loadedRelations = new HashSet<>();

  private final Map<UUID, List<TagLabel>> tagValues = new HashMap<>();
  private final Set<UUID> loadedTags = new HashSet<>();

  private final Map<UUID, Votes> voteValues = new HashMap<>();
  private final Set<UUID> loadedVotes = new HashSet<>();

  void putRelations(UUID entityId, String field, Include include, List<EntityReference> refs) {
    RelationKey key = new RelationKey(entityId, field, normalize(include));
    loadedRelations.add(key);
    relationValues.put(key, refs == null ? Collections.emptyList() : List.copyOf(refs));
  }

  Optional<List<EntityReference>> getRelations(UUID entityId, String field, Include include) {
    RelationKey key = new RelationKey(entityId, field, normalize(include));
    if (!loadedRelations.contains(key)) {
      return Optional.empty();
    }
    return Optional.of(relationValues.getOrDefault(key, Collections.emptyList()));
  }

  void putTags(UUID entityId, List<TagLabel> tags) {
    loadedTags.add(entityId);
    tagValues.put(entityId, tags == null ? Collections.emptyList() : List.copyOf(tags));
  }

  Optional<List<TagLabel>> getTags(UUID entityId) {
    if (!loadedTags.contains(entityId)) {
      return Optional.empty();
    }
    return Optional.of(tagValues.getOrDefault(entityId, Collections.emptyList()));
  }

  void putVotes(UUID entityId, Votes votes) {
    loadedVotes.add(entityId);
    voteValues.put(entityId, votes == null ? new Votes() : votes);
  }

  Optional<Votes> getVotes(UUID entityId) {
    if (!loadedVotes.contains(entityId)) {
      return Optional.empty();
    }
    return Optional.of(voteValues.getOrDefault(entityId, new Votes()));
  }

  private Include normalize(Include include) {
    return include == null ? ALL : include;
  }

  private record RelationKey(UUID entityId, String field, Include include) {}
}
