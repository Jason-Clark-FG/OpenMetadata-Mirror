package org.openmetadata.service.search;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;

/**
 * Parser for Elasticsearch query filters to extract field-value pairs.
 * Supports both JSON Query DSL and simple query strings.
 */
@Slf4j
public class QueryFilterParser {

  private static final ObjectMapper mapper = new ObjectMapper();

  private QueryFilterParser() {}

  /**
   * Parses a query filter into separate clauses preserving AND semantics.
   * Each must clause becomes a separate map so multiple terms on the same field
   * (e.g., two tags.tagFQN terms) are evaluated independently.
   */
  public static List<Map<String, List<String>>> parseFilterClauses(String queryFilter) {
    if (nullOrEmpty(queryFilter)) {
      return new ArrayList<>();
    }
    String trimmed = queryFilter.trim();
    if (!trimmed.startsWith("{")) {
      List<Map<String, List<String>>> clauses = new ArrayList<>();
      clauses.add(parseQueryString(trimmed));
      return clauses;
    }

    List<Map<String, List<String>>> clauses = new ArrayList<>();
    try {
      JsonNode rootNode = mapper.readTree(trimmed);
      JsonNode queryNode = rootNode.has("query") ? rootNode.get("query") : rootNode;

      if (queryNode.has("bool") && queryNode.get("bool").has("must")) {
        JsonNode mustArray = queryNode.get("bool").get("must");
        if (mustArray.isArray()) {
          for (JsonNode mustClause : mustArray) {
            Map<String, List<String>> clauseFields = new HashMap<>();
            extractTermsFromNode(mustClause, clauseFields);
            if (!clauseFields.isEmpty()) {
              clauses.add(clauseFields);
            }
          }
        }
      }

      if (clauses.isEmpty()) {
        Map<String, List<String>> fieldValues = new HashMap<>();
        extractTermsFromNode(queryNode, fieldValues);
        if (!fieldValues.isEmpty()) {
          clauses.add(fieldValues);
        }
      }
    } catch (Exception e) {
      LOG.warn("Failed to parse JSON query filter clauses: {}", trimmed, e);
    }
    return clauses;
  }

  /**
   * Checks if entity matches filter using clause-based AND semantics.
   * Each clause is evaluated independently — entity must match ALL clauses.
   */
  public static boolean matchesFilterClauses(
      Map<String, Object> entityMap, List<Map<String, List<String>>> clauses) {
    if (entityMap == null || clauses == null || clauses.isEmpty()) {
      return false;
    }
    for (Map<String, List<String>> clause : clauses) {
      if (!matchesFilter(entityMap, clause)) {
        return false;
      }
    }
    return true;
  }

  public static Map<String, List<String>> parseFilter(String queryFilter) {
    if (nullOrEmpty(queryFilter)) {
      return new HashMap<>();
    }

    String trimmed = queryFilter.trim();

    // Check if it's JSON (starts with '{')
    if (trimmed.startsWith("{")) {
      return parseJsonFilter(trimmed);
    } else {
      return parseQueryString(trimmed);
    }
  }

  /**
   * Parses ES Query DSL JSON to extract field-value pairs.
   * Handles term, terms, match queries inside bool must/should clauses.
   */
  private static Map<String, List<String>> parseJsonFilter(String jsonFilter) {
    Map<String, List<String>> fieldValues = new HashMap<>();

    try {
      JsonNode rootNode = mapper.readTree(jsonFilter);

      // Handle {"query": {...}} wrapper
      JsonNode queryNode = rootNode.has("query") ? rootNode.get("query") : rootNode;

      // Extract terms from the query
      extractTermsFromNode(queryNode, fieldValues);

    } catch (Exception e) {
      LOG.warn("Failed to parse JSON query filter: {}", jsonFilter, e);
    }

    return fieldValues;
  }

  /**
   * Recursively extracts field-value pairs from JSON query nodes.
   */
  private static void extractTermsFromNode(JsonNode node, Map<String, List<String>> fieldValues) {
    if (node == null) {
      return;
    }

    // Handle bool queries
    if (node.has("bool")) {
      JsonNode boolNode = node.get("bool");
      if (boolNode.has("must")) {
        extractFromArray(boolNode.get("must"), fieldValues);
      }
      if (boolNode.has("should")) {
        extractFromArray(boolNode.get("should"), fieldValues);
      }
      if (boolNode.has("filter")) {
        extractFromArray(boolNode.get("filter"), fieldValues);
      }
    }

    // Handle term queries
    if (node.has("term")) {
      extractTermQuery(node.get("term"), fieldValues);
    }

    // Handle terms queries
    if (node.has("terms")) {
      extractTermsQuery(node.get("terms"), fieldValues);
    }

    // Handle match queries
    if (node.has("match")) {
      extractMatchQuery(node.get("match"), fieldValues);
    }

    // Handle wildcard queries
    if (node.has("wildcard")) {
      extractWildcardQuery(node.get("wildcard"), fieldValues);
    }
  }

  /**
   * Extracts terms from array nodes (e.g., must, should clauses).
   */
  private static void extractFromArray(JsonNode arrayNode, Map<String, List<String>> fieldValues) {
    if (arrayNode.isArray()) {
      arrayNode.forEach(item -> extractTermsFromNode(item, fieldValues));
    } else {
      extractTermsFromNode(arrayNode, fieldValues);
    }
  }

  /**
   * Extracts field-value from term query: {"term": {"field": "value"}}.
   */
  private static void extractTermQuery(JsonNode termNode, Map<String, List<String>> fieldValues) {
    termNode
        .fields()
        .forEachRemaining(
            entry -> {
              String fieldName = normalizeFieldName(entry.getKey());
              String value = entry.getValue().asText();
              fieldValues.computeIfAbsent(fieldName, k -> new ArrayList<>()).add(value);
            });
  }

  /**
   * Extracts field-values from terms query: {"terms": {"field": ["value1", "value2"]}}.
   */
  private static void extractTermsQuery(JsonNode termsNode, Map<String, List<String>> fieldValues) {
    termsNode
        .fields()
        .forEachRemaining(
            entry -> {
              String fieldName = normalizeFieldName(entry.getKey());
              JsonNode valuesNode = entry.getValue();
              if (valuesNode.isArray()) {
                valuesNode.forEach(
                    v ->
                        fieldValues
                            .computeIfAbsent(fieldName, k -> new ArrayList<>())
                            .add(v.asText()));
              }
            });
  }

  /**
   * Extracts field-value from match query: {"match": {"field": "value"}}.
   */
  private static void extractMatchQuery(JsonNode matchNode, Map<String, List<String>> fieldValues) {
    matchNode
        .fields()
        .forEachRemaining(
            entry -> {
              String fieldName = normalizeFieldName(entry.getKey());
              String value = entry.getValue().asText();
              fieldValues.computeIfAbsent(fieldName, k -> new ArrayList<>()).add(value);
            });
  }

  /**
   * Extracts field-value from wildcard query: {"wildcard": {"field": {"value": "*pattern*"}}}.
   * Converts wildcard pattern to simple search term by removing * characters.
   */
  private static void extractWildcardQuery(
      JsonNode wildcardNode, Map<String, List<String>> fieldValues) {
    wildcardNode
        .fields()
        .forEachRemaining(
            entry -> {
              String fieldName = normalizeFieldName(entry.getKey());
              JsonNode valueNode = entry.getValue();
              String value;

              // Handle both {"field": "pattern"} and {"field": {"value": "pattern"}} formats
              if (valueNode.isObject() && valueNode.has("value")) {
                value = valueNode.get("value").asText();
              } else {
                value = valueNode.asText();
              }

              // Remove wildcard characters for simple contains matching
              value = value.replace("*", "").replace("?", "");

              if (!value.isEmpty()) {
                fieldValues.computeIfAbsent(fieldName, k -> new ArrayList<>()).add(value);
              }
            });
  }

  /**
   * Parses simple query string format: "field:value" or "field.subfield:value".
   */
  private static Map<String, List<String>> parseQueryString(String queryString) {
    Map<String, List<String>> fieldValues = new HashMap<>();

    // Split by spaces (simple approach, doesn't handle quoted strings)
    String[] parts = queryString.split("\\s+");

    for (String part : parts) {
      if (part.contains(":")) {
        String[] fieldValue = part.split(":", 2);
        if (fieldValue.length == 2) {
          String fieldName = normalizeFieldName(fieldValue[0]);
          String value = fieldValue[1];
          fieldValues.computeIfAbsent(fieldName, k -> new ArrayList<>()).add(value);
        }
      }
    }

    return fieldValues;
  }

  /**
   * Normalizes field names by removing .keyword suffix and extracting base field.
   * Example: "owners.displayName.keyword" -> "owners.displayName"
   */
  private static String normalizeFieldName(String fieldName) {
    if (fieldName == null) {
      return "";
    }

    // Remove .keyword suffix
    if (fieldName.endsWith(".keyword")) {
      fieldName = fieldName.substring(0, fieldName.length() - ".keyword".length());
    }

    return fieldName;
  }

  /**
   * Checks if a node matches the parsed filter criteria.
   *
   * @param entityMap The entity document as a map
   * @param parsedFilter The parsed filter (field -> values)
   * @return true if the entity matches all filter criteria
   */
  public static boolean matchesFilter(
      Map<String, Object> entityMap, Map<String, List<String>> parsedFilter) {
    if (entityMap == null || parsedFilter == null || parsedFilter.isEmpty()) {
      return false;
    }

    // If filter contains name/displayName search, evaluate those with OR logic
    // and all other filters with AND logic
    if (hasNameSearch(parsedFilter)) {
      if (!matchesNameSearch(entityMap, parsedFilter)) {
        return false;
      }
    }

    // Check each non-name filter field (AND logic)
    for (Map.Entry<String, List<String>> entry : parsedFilter.entrySet()) {
      String fieldPath = entry.getKey();

      // Skip name/displayName — already handled above with OR logic
      if (fieldPath.equals("name") || fieldPath.equals("displayName")) {
        continue;
      }

      List<String> requiredValues = entry.getValue();
      Object fieldValue = getNestedFieldValue(entityMap, fieldPath);

      if (!matchesAnyValue(fieldValue, requiredValues)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Gets nested field value from entity map using dot notation.
   * Example: "owners.displayName" -> entityMap.get("owners") -> extract displayName from each owner
   * Handles both single objects and arrays.
   */
  private static Object getNestedFieldValue(Map<String, Object> entityMap, String fieldPath) {
    String[] parts = fieldPath.split("\\.");
    Object current = entityMap;

    for (String part : parts) {
      if (current instanceof Map) {
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) current;
        current = map.get(part);
      } else if (current instanceof List) {
        // Handle arrays - extract the field from each item
        @SuppressWarnings("unchecked")
        List<Object> list = (List<Object>) current;
        List<Object> extractedValues = new ArrayList<>();

        for (Object item : list) {
          if (item instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> itemMap = (Map<String, Object>) item;
            Object value = itemMap.get(part);
            if (value != null) {
              extractedValues.add(value);
            }
          }
        }

        // Return extracted values, or null if field not found in any list item
        current = extractedValues.isEmpty() ? null : extractedValues;
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Checks if a field value matches any of the required values.
   * Handles single values, arrays, and objects (e.g., owners, tags, domain).
   */
  private static boolean matchesAnyValue(Object fieldValue, List<String> requiredValues) {
    if (fieldValue == null || requiredValues == null || requiredValues.isEmpty()) {
      return false;
    }

    // If field value is a list (e.g., owners, tags)
    if (fieldValue instanceof List) {
      @SuppressWarnings("unchecked")
      List<Object> listValue = (List<Object>) fieldValue;
      for (Object item : listValue) {
        if (matchesSingleValue(item, requiredValues)) {
          return true;
        }
      }
      return false;
    }

    // Single value
    return matchesSingleValue(fieldValue, requiredValues);
  }

  /**
   * Checks if a single value matches any of the required values using exact matching.
   * This matches ES term query semantics (case-insensitive exact match).
   */
  private static boolean matchesSingleValue(Object value, List<String> requiredValues) {
    if (value == null) {
      return false;
    }

    String valueStr;
    if (value instanceof Map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) value;
      String displayName = (String) map.get("displayName");
      String name = (String) map.get("name");
      String tagFQN = (String) map.get("tagFQN");

      for (String required : requiredValues) {
        if ((displayName != null && displayName.equalsIgnoreCase(required))
            || (name != null && name.equalsIgnoreCase(required))
            || (tagFQN != null && tagFQN.equalsIgnoreCase(required))) {
          return true;
        }
      }
      return false;
    } else {
      valueStr = value.toString();
    }

    for (String required : requiredValues) {
      if (valueStr.equalsIgnoreCase(required)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a single value contains any of the required values (substring match).
   * Used for name/displayName wildcard search where contains semantics are needed.
   */
  private static boolean matchesSingleValueContains(Object value, List<String> requiredValues) {
    if (value == null) {
      return false;
    }

    String valueStr = value.toString();
    for (String required : requiredValues) {
      if (valueStr.toLowerCase().contains(required.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if the filter contains a name/displayName search. Name searches have both name and
   * displayName with the same value (from wildcard query). Other filter keys may also be present.
   */
  private static boolean hasNameSearch(Map<String, List<String>> parsedFilter) {
    List<String> nameValues = parsedFilter.get("name");
    List<String> displayNameValues = parsedFilter.get("displayName");

    if (nameValues == null || displayNameValues == null) {
      return false;
    }

    // Check if both fields have the same values (indicates OR search)
    return nameValues.equals(displayNameValues);
  }

  /**
   * Matches entity against name search using OR logic.
   * Returns true if name OR displayName contains the search term.
   */
  private static boolean matchesNameSearch(
      Map<String, Object> entityMap, Map<String, List<String>> parsedFilter) {
    List<String> searchTerms = parsedFilter.get("name");
    if (searchTerms == null || searchTerms.isEmpty()) {
      return false;
    }

    // Name search uses substring matching (wildcard-derived values)
    Object nameValue = getNestedFieldValue(entityMap, "name");
    if (nameValue != null && matchesSingleValueContains(nameValue, searchTerms)) {
      return true;
    }

    Object displayNameValue = getNestedFieldValue(entityMap, "displayName");
    if (displayNameValue != null && matchesSingleValueContains(displayNameValue, searchTerms)) {
      return true;
    }

    return false;
  }
}
