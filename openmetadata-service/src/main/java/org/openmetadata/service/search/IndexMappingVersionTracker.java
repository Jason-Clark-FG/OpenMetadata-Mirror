package org.openmetadata.service.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.search.IndexMapping;
import org.openmetadata.search.IndexMappingLoader;
import org.openmetadata.service.exception.IndexMappingHashException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.IndexMappingVersionDAO;

@Slf4j
public class IndexMappingVersionTracker {
  private final IndexMappingVersionDAO indexMappingVersionDAO;
  private final String updatedBy;
  private final String version;
  private final CollectionDAO daoCollection;

  public IndexMappingVersionTracker(CollectionDAO daoCollection, String version, String updatedBy) {
    this.daoCollection = daoCollection;
    this.indexMappingVersionDAO = daoCollection.indexMappingVersionDAO();
    this.version = version;
    this.updatedBy = updatedBy;
  }

  public List<String> getChangedMappings() throws IOException {
    List<String> changedMappings = new ArrayList<>();
    Map<String, String> storedHashes = getStoredMappingHashes();
    Map<String, String> currentHashes = computeCurrentMappingHashes();

    for (Map.Entry<String, String> entry : currentHashes.entrySet()) {
      String entityType = entry.getKey();
      String currentHash = entry.getValue();
      String storedHash = storedHashes.get(entityType);

      if (storedHash == null || !storedHash.equals(currentHash)) {
        changedMappings.add(entityType);
        LOG.info("Index mapping changed for entity: {}", entityType);
      }
    }

    if (changedMappings.isEmpty()) {
      LOG.info("No changes detected in index mappings");
    } else {
      LOG.info("Changed index mappings detected for entities: {}", changedMappings);
    }

    return changedMappings;
  }

  public void updateMappingVersions() throws IOException {
    Map<String, String> currentHashes = computeCurrentMappingHashes();
    Map<String, IndexMapping> indexMappings = IndexMappingLoader.getInstance().getIndexMapping();
    long updatedAt = System.currentTimeMillis();

    for (Map.Entry<String, String> entry : currentHashes.entrySet()) {
      String entityType = entry.getKey();
      String mappingHash = entry.getValue();
      IndexMapping indexMapping = indexMappings.get(entityType);
      JsonNode mappingJson =
          indexMapping != null ? loadMappingForEntity(entityType, indexMapping) : null;

      indexMappingVersionDAO.upsertIndexMappingVersion(
          entityType,
          mappingHash,
          JsonUtils.pojoToJson(mappingJson),
          version,
          updatedAt,
          updatedBy);
    }
    LOG.info("Updated index mapping versions for {} entities", currentHashes.size());
  }

  private Map<String, String> getStoredMappingHashes() {
    Map<String, String> hashes = new HashMap<>();
    List<IndexMappingVersionDAO.IndexMappingVersion> versions =
        indexMappingVersionDAO.getAllMappingVersions();
    for (IndexMappingVersionDAO.IndexMappingVersion ver : versions) {
      hashes.put(ver.entityType, ver.mappingHash);
    }
    return hashes;
  }

  private Map<String, String> computeCurrentMappingHashes() throws IOException {
    Map<String, String> hashes = new HashMap<>();

    // Use IndexMappingLoader as the source of truth for entity types and their mapping file paths.
    // This avoids constructing file paths manually and ensures all entity types are covered,
    // including camelCase ones like glossaryTerm, databaseSchema, etc.
    Map<String, IndexMapping> indexMappings = IndexMappingLoader.getInstance().getIndexMapping();

    for (Map.Entry<String, IndexMapping> entry : indexMappings.entrySet()) {
      String entityType = entry.getKey();
      JsonNode mapping = loadMappingForEntity(entityType, entry.getValue());
      if (mapping != null) {
        try {
          String hash = computeHash(mapping);
          hashes.put(entityType, hash);
        } catch (IndexMappingHashException e) {
          LOG.error("Failed to compute hash for entity type: {}", entityType, e);
          throw new IOException("Failed to compute mapping hash for " + entityType, e);
        }
      }
    }

    return hashes;
  }

  private JsonNode loadMappingForEntity(String entityType, IndexMapping indexMapping) {
    try {
      ObjectMapper mapper = new ObjectMapper();
      Map<String, JsonNode> allLanguageMappings = new HashMap<>();
      String[] languages = {"en", "jp", "ru", "zh"};

      for (String lang : languages) {
        // Use the indexMappingFile from indexMapping.json which has the correct path template
        String mappingPath = "/" + indexMapping.getIndexMappingFile(lang);
        try (var stream = getClass().getResourceAsStream(mappingPath)) {
          if (stream != null) {
            String mappingContent = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            allLanguageMappings.put(lang, mapper.readTree(mappingContent));
          }
        }
      }

      if (!allLanguageMappings.isEmpty()) {
        return mapper.valueToTree(allLanguageMappings);
      }
    } catch (Exception e) {
      LOG.debug("Could not load mapping for entity: {}", entityType, e);
    }
    return null;
  }

  private String computeHash(JsonNode mapping) throws IOException, IndexMappingHashException {
    try {
      MessageDigest digest = MessageDigest.getInstance("MD5");
      ObjectMapper mapper = new ObjectMapper();
      mapper.configure(
          com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
      String canonicalJson = mapper.writeValueAsString(mapping);
      byte[] hash = digest.digest(canonicalJson.getBytes(StandardCharsets.UTF_8));
      return bytesToHex(hash);
    } catch (NoSuchAlgorithmException e) {
      // MD5 is a standard algorithm that should always be available
      throw new IndexMappingHashException(
          "MD5 algorithm not available - this should never happen", e);
    }
  }

  private String bytesToHex(byte[] bytes) {
    StringBuilder result = new StringBuilder();
    for (byte b : bytes) {
      result.append(String.format("%02x", b));
    }
    return result.toString();
  }
}
