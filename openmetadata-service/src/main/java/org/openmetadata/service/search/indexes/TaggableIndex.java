package org.openmetadata.service.search.indexes;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.service.Entity;
import org.openmetadata.service.search.ParseTags;

/**
 * Mixin interface for search indexes of entities that have tags. Centralizes the tag parsing logic
 * (tags, tier, classificationTags, glossaryTags) that was previously duplicated across 15+ index
 * classes.
 *
 * <p>For entities whose children also carry tags (e.g., Table columns, Topic schema fields),
 * override {@link #collectChildTags()} to return the child tag sets — they will be automatically
 * merged with entity-level tags.
 *
 * <p>This method is called automatically by {@link SearchIndex#buildSearchIndexDoc()}. Individual
 * index classes should NOT call it directly.
 */
public interface TaggableIndex extends SearchIndex {

  /**
   * Override to provide tags collected from child elements (columns, schema fields, etc.). Returns
   * null by default, meaning no child tags to merge.
   */
  default Set<List<TagLabel>> collectChildTags() {
    return null;
  }

  /**
   * Applies tag-related fields to the search index document. Called automatically by {@link
   * SearchIndex#buildSearchIndexDoc()}.
   *
   * <p>Sets: tags, tier, classificationTags, glossaryTags. The tier, classificationTags, and
   * glossaryTags are always derived from entity-level tags only. The "tags" field is the union of
   * entity-level tags and any child tag sets from {@link #collectChildTags()}.
   */
  default void applyTagFields(Map<String, Object> doc) {
    Object entity = getEntity();
    if (!(entity instanceof EntityInterface ei)) {
      return;
    }
    ParseTags parseTags = new ParseTags(Entity.getEntityTags(getEntityTypeName(), ei));

    Set<List<TagLabel>> childTagSets = collectChildTags();
    if (childTagSets != null && !childTagSets.isEmpty()) {
      Set<List<TagLabel>> allTagSets = new HashSet<>(childTagSets);
      allTagSets.add(parseTags.getTags());
      // Deduplicate by tagFQN to avoid duplicate tags when entity and child share the same tag
      LinkedHashMap<String, TagLabel> deduped = new LinkedHashMap<>();
      allTagSets.stream()
          .flatMap(List::stream)
          .forEach(tag -> deduped.putIfAbsent(tag.getTagFQN(), tag));
      doc.put("tags", new ArrayList<>(deduped.values()));
    } else {
      doc.put("tags", parseTags.getTags());
    }

    doc.put("tier", parseTags.getTierTag());
    doc.put("classificationTags", parseTags.getClassificationTags());
    doc.put("glossaryTags", parseTags.getGlossaryTags());
  }
}
