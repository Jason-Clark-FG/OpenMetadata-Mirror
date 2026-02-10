package org.openmetadata.service.search.vector;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.data.GlossaryTerm;
import org.openmetadata.schema.entity.data.Metric;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.type.AssetCertification;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.type.UsageDetails;
import org.openmetadata.schema.type.Votes;
import org.openmetadata.service.search.vector.client.EmbeddingClient;
import org.openmetadata.service.search.vector.utils.TextChunkManager;

@Slf4j
@UtilityClass
public class VectorDocBuilder {

  public static List<Map<String, Object>> fromEntity(
      EntityInterface entity, EmbeddingClient embeddingClient) {
    return fromEntityWithFingerprint(entity, embeddingClient);
  }

  public static List<Map<String, Object>> fromEntityWithFingerprint(
      EntityInterface entity, EmbeddingClient embeddingClient) {
    String parentId = entity.getId().toString();
    String entityType = entity.getEntityReference().getType();

    String metaLight = buildMetaLightText(entity, entityType);
    String body = buildBodyText(entity, entityType);
    String fingerprint = computeFingerprintForEntity(entity);

    List<String> chunks = TextChunkManager.chunk(body);
    List<String> textsToEmbed = new ArrayList<>(chunks.size());
    for (String chunk : chunks) {
      textsToEmbed.add(metaLight + " " + chunk);
    }

    List<float[]> embeddings = embeddingClient.embedBatch(textsToEmbed);
    List<Map<String, Object>> docs = new ArrayList<>(chunks.size());

    for (int i = 0; i < chunks.size(); i++) {
      Map<String, Object> doc = new HashMap<>();
      doc.put("parent_id", parentId);
      doc.put("sourceId", parentId);
      doc.put("entityType", entityType);
      doc.put("fullyQualifiedName", orEmpty(entity.getFullyQualifiedName()));
      doc.put("name", orEmpty(entity.getName()));
      doc.put("displayName", orEmpty(entity.getDisplayName()));
      doc.put("serviceType", extractServiceType(entity));
      doc.put("deleted", entity.getDeleted() != null && entity.getDeleted());
      doc.put("fingerprint", fingerprint);
      doc.put("chunk_index", i);
      doc.put("chunk_count", chunks.size());
      doc.put("text_to_embed", textsToEmbed.get(i));
      doc.put("embedding", embeddings.get(i));

      addTagsAndTier(doc, entity);
      addCertification(doc, entity);
      addOwners(doc, entity);
      addDomains(doc, entity);
      addCustomProperties(doc, entity);
      addPopularityMetrics(doc, entity);
      addEntitySpecificFields(doc, entity, entityType);

      docs.add(doc);
    }
    return docs;
  }

  public static String computeFingerprintForEntity(EntityInterface entity) {
    String entityType = entity.getEntityReference().getType();
    String metaLight = buildMetaLightText(entity, entityType);
    String body = buildBodyText(entity, entityType);
    return TextChunkManager.computeFingerprint(metaLight + body);
  }

  static String buildMetaLightText(EntityInterface entity, String entityType) {
    StringBuilder sb = new StringBuilder();
    sb.append("name: ").append(orEmpty(entity.getName()));
    sb.append("; displayName: ").append(orEmpty(entity.getDisplayName()));
    sb.append("; entityType: ").append(entityType);
    sb.append("; fqn: ").append(orEmpty(entity.getFullyQualifiedName()));
    sb.append("; serviceType: ").append(orEmpty(extractServiceType(entity)));

    if (entity.getTags() != null && !entity.getTags().isEmpty()) {
      sb.append("; tags: ")
          .append(
              entity.getTags().stream().map(TagLabel::getTagFQN).collect(Collectors.joining(", ")));
    }

    if (entity.getOwners() != null && !entity.getOwners().isEmpty()) {
      sb.append("; owners: ")
          .append(
              entity.getOwners().stream()
                  .map(EntityReference::getName)
                  .collect(Collectors.joining(", ")));
    }

    if (entity.getDomains() != null && !entity.getDomains().isEmpty()) {
      sb.append("; domains: ")
          .append(
              entity.getDomains().stream()
                  .map(EntityReference::getName)
                  .collect(Collectors.joining(", ")));
    }

    return sb.toString();
  }

  static String buildBodyText(EntityInterface entity, String entityType) {
    StringBuilder sb = new StringBuilder();
    String desc = removeHtml(orEmpty(entity.getDescription()));
    if (!desc.isEmpty()) {
      sb.append(desc);
    }

    if (entity instanceof Table table) {
      String cols = columnsToString(table.getColumns());
      if (!cols.isEmpty()) {
        if (!sb.isEmpty()) sb.append(" ");
        sb.append(cols);
      }
    }

    return sb.toString();
  }

  private static void addTagsAndTier(Map<String, Object> doc, EntityInterface entity) {
    if (entity.getTags() == null || entity.getTags().isEmpty()) {
      doc.put("tags", Collections.emptyList());
      return;
    }

    List<Map<String, Object>> tagsList = new ArrayList<>();
    Map<String, Object> tierMap = null;

    for (TagLabel tag : entity.getTags()) {
      Map<String, Object> tagDoc = new HashMap<>();
      tagDoc.put("tagFQN", tag.getTagFQN());
      tagDoc.put("name", tag.getName());
      tagDoc.put("labelType", tag.getLabelType() != null ? tag.getLabelType().value() : null);
      tagDoc.put("description", tag.getDescription());
      tagDoc.put("source", tag.getSource() != null ? tag.getSource().value() : null);
      tagDoc.put("state", tag.getState() != null ? tag.getState().value() : null);

      if (tag.getTagFQN() != null && tag.getTagFQN().startsWith("Tier.")) {
        tierMap = tagDoc;
      } else {
        tagsList.add(tagDoc);
      }
    }

    doc.put("tags", tagsList);
    doc.put("tier", tierMap);
  }

  private static void addCertification(Map<String, Object> doc, EntityInterface entity) {
    AssetCertification cert = entity.getCertification();
    if (cert != null && cert.getTagLabel() != null) {
      Map<String, Object> certDoc = new HashMap<>();
      TagLabel tag = cert.getTagLabel();
      certDoc.put("tagFQN", tag.getTagFQN());
      certDoc.put("name", tag.getName());
      certDoc.put("labelType", tag.getLabelType() != null ? tag.getLabelType().value() : null);
      certDoc.put("description", tag.getDescription());
      certDoc.put("source", tag.getSource() != null ? tag.getSource().value() : null);
      certDoc.put("state", tag.getState() != null ? tag.getState().value() : null);
      doc.put("certification", certDoc);
    }
  }

  private static void addOwners(Map<String, Object> doc, EntityInterface entity) {
    if (entity.getOwners() == null || entity.getOwners().isEmpty()) {
      doc.put("owners", Collections.emptyList());
      return;
    }
    List<Map<String, Object>> ownersList = new ArrayList<>();
    for (EntityReference owner : entity.getOwners()) {
      Map<String, Object> ownerDoc = new HashMap<>();
      ownerDoc.put("id", owner.getId() != null ? owner.getId().toString() : null);
      ownerDoc.put("name", owner.getName());
      ownerDoc.put("type", owner.getType());
      ownerDoc.put("displayName", owner.getDisplayName());
      ownersList.add(ownerDoc);
    }
    doc.put("owners", ownersList);
  }

  private static void addDomains(Map<String, Object> doc, EntityInterface entity) {
    if (entity.getDomains() == null || entity.getDomains().isEmpty()) {
      return;
    }
    List<Map<String, Object>> domainsList = new ArrayList<>();
    for (EntityReference domain : entity.getDomains()) {
      Map<String, Object> domainDoc = new HashMap<>();
      domainDoc.put("id", domain.getId() != null ? domain.getId().toString() : null);
      domainDoc.put("name", domain.getName());
      domainDoc.put("displayName", domain.getDisplayName());
      domainsList.add(domainDoc);
    }
    doc.put("domains", domainsList);
  }

  private static void addCustomProperties(Map<String, Object> doc, EntityInterface entity) {
    Object extension = entity.getExtension();
    if (extension instanceof Map) {
      doc.put("customProperties", extension);
    }
  }

  private static void addPopularityMetrics(Map<String, Object> doc, EntityInterface entity) {
    Votes votes = entity.getVotes();
    if (votes != null) {
      doc.put("upVotes", votes.getUpVotes() != null ? votes.getUpVotes() : 0);
      doc.put("downVotes", votes.getDownVotes() != null ? votes.getDownVotes() : 0);
      int total =
          (votes.getUpVotes() != null ? votes.getUpVotes() : 0)
              + (votes.getDownVotes() != null ? votes.getDownVotes() : 0);
      doc.put("totalVotes", total);
    }

    List<EntityReference> followers = entity.getFollowers();
    doc.put("followersCount", followers != null ? followers.size() : 0);

    UsageDetails usage = entity.getUsageSummary();
    if (usage != null) {
      Map<String, Object> usageMap = new HashMap<>();
      if (usage.getDailyStats() != null) {
        usageMap.put("dailyStats", Map.of("count", usage.getDailyStats().getCount()));
      }
      if (usage.getWeeklyStats() != null) {
        Map<String, Object> weekly = new HashMap<>();
        weekly.put("count", usage.getWeeklyStats().getCount());
        if (usage.getWeeklyStats().getPercentileRank() != null) {
          weekly.put("percentileRank", usage.getWeeklyStats().getPercentileRank());
        }
        usageMap.put("weeklyStats", weekly);
      }
      if (usage.getMonthlyStats() != null) {
        Map<String, Object> monthly = new HashMap<>();
        monthly.put("count", usage.getMonthlyStats().getCount());
        if (usage.getMonthlyStats().getPercentileRank() != null) {
          monthly.put("percentileRank", usage.getMonthlyStats().getPercentileRank());
        }
        usageMap.put("monthlyStats", monthly);
      }
      if (!usageMap.isEmpty()) {
        doc.put("usageSummary", usageMap);
      }
    }
  }

  @SuppressWarnings("unchecked")
  private static void addEntitySpecificFields(
      Map<String, Object> doc, EntityInterface entity, String entityType) {
    if (entity instanceof Table table) {
      if (table.getColumns() != null) {
        List<Map<String, String>> columns = new ArrayList<>();
        for (Column col : table.getColumns()) {
          Map<String, String> colMap = new HashMap<>();
          colMap.put("name", col.getName());
          colMap.put("dataType", col.getDataType() != null ? col.getDataType().value() : null);
          colMap.put("description", col.getDescription());
          columns.add(colMap);
        }
        doc.put("columns", columns);
      }
    } else if (entity instanceof GlossaryTerm glossaryTerm) {
      if (glossaryTerm.getSynonyms() != null) {
        doc.put("synonyms", glossaryTerm.getSynonyms());
      }
      if (glossaryTerm.getRelatedTerms() != null) {
        List<Map<String, Object>> relatedTerms = new ArrayList<>();
        for (EntityReference ref : glossaryTerm.getRelatedTerms()) {
          Map<String, Object> relMap = new HashMap<>();
          relMap.put("id", ref.getId() != null ? ref.getId().toString() : null);
          relMap.put("name", ref.getName());
          relMap.put("type", ref.getType());
          relMap.put("displayName", ref.getDisplayName());
          relMap.put("fullyQualifiedName", ref.getFullyQualifiedName());
          relatedTerms.add(relMap);
        }
        doc.put("relatedTerms", relatedTerms);
      }
    } else if (entity instanceof Metric metric) {
      if (metric.getMetricExpression() != null) {
        Map<String, Object> expr = new HashMap<>();
        expr.put(
            "language",
            metric.getMetricExpression().getLanguage() != null
                ? metric.getMetricExpression().getLanguage().value()
                : null);
        expr.put("code", metric.getMetricExpression().getCode());
        doc.put("metricExpression", expr);
      }
      if (metric.getMetricType() != null) {
        doc.put("metricType", metric.getMetricType().value());
      }
      if (metric.getUnitOfMeasurement() != null) {
        doc.put("unitOfMeasurement", metric.getUnitOfMeasurement().value());
      }
      if (metric.getGranularity() != null) {
        doc.put("granularity", metric.getGranularity().value());
      }
      if (metric.getRelatedMetrics() != null) {
        doc.put(
            "relatedMetrics",
            metric.getRelatedMetrics().stream()
                .map(EntityReference::getFullyQualifiedName)
                .collect(Collectors.toList()));
      }
    }
  }

  static String extractServiceType(EntityInterface entity) {
    try {
      Method method = entity.getClass().getMethod("getServiceType");
      Object result = method.invoke(entity);
      return result != null ? result.toString() : null;
    } catch (Exception e) {
      return null;
    }
  }

  static String extractTierLabel(EntityInterface entity) {
    if (entity.getTags() == null) return null;
    for (TagLabel tag : entity.getTags()) {
      if (tag.getTagFQN() != null && tag.getTagFQN().startsWith("Tier.")) {
        return tag.getTagFQN();
      }
    }
    return null;
  }

  static String extractCertificationLabel(EntityInterface entity) {
    AssetCertification cert = entity.getCertification();
    if (cert != null && cert.getTagLabel() != null) {
      return cert.getTagLabel().getTagFQN();
    }
    return null;
  }

  static String removeHtml(String text) {
    if (text == null || text.isEmpty()) return "";
    return text.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
  }

  static String orEmpty(String value) {
    return value != null ? value : "";
  }

  static String joinOrEmpty(List<String> values) {
    if (values == null || values.isEmpty()) return "";
    return String.join(", ", values);
  }

  static String columnsToString(List<Column> columns) {
    if (columns == null || columns.isEmpty()) return "";
    return columns.stream().map(Column::getName).collect(Collectors.joining(", "));
  }
}
