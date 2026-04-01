/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.search;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SearchResultCsvExporterTest {

  @Test
  void testToCsvRowAllFieldsPresent() {
    Map<String, Object> source = new HashMap<>();
    source.put("entityType", "table");
    source.put("name", "orders");
    source.put("displayName", "Orders Table");
    source.put("fullyQualifiedName", "prod.db.schema.orders");
    source.put("description", "Main orders table");
    source.put("service", Map.of("name", "prod-mysql"));
    source.put("serviceType", "Mysql");
    source.put(
        "owners", List.of(Map.of("displayName", "Alice", "name", "alice"), Map.of("name", "bob")));
    source.put(
        "tags",
        List.of(
            Map.of("tagFQN", "PII.Sensitive", "source", "Classification"),
            Map.of("tagFQN", "glossary.term1", "source", "Glossary")));
    source.put("tier", Map.of("tagFQN", "Tier.Tier1"));
    source.put("domains", List.of(Map.of("displayName", "Finance", "name", "finance")));

    String row = SearchResultCsvExporter.toCsvRow(source);

    assertEquals(
        "table,prod-mysql,Mysql,prod.db.schema.orders,orders,Orders Table,Main orders table,Alice|bob,PII.Sensitive,glossary.term1,Finance,Tier.Tier1",
        row);
  }

  @Test
  void testToCsvRowMissingFields() {
    Map<String, Object> source = new HashMap<>();
    source.put("entityType", "topic");
    source.put("name", "my-topic");
    source.put("fullyQualifiedName", "kafka.my-topic");

    String row = SearchResultCsvExporter.toCsvRow(source);

    assertEquals("topic,,,kafka.my-topic,my-topic,,,,,,", row);
  }

  @Test
  void testToCsvRowEmptySource() {
    Map<String, Object> source = new HashMap<>();

    String row = SearchResultCsvExporter.toCsvRow(source);

    assertEquals(",,,,,,,,,,,", row);
  }

  @Test
  void testEscapeCsvWithComma() {
    assertEquals("\"hello, world\"", SearchResultCsvExporter.escapeCsv("hello, world"));
  }

  @Test
  void testEscapeCsvWithQuotes() {
    assertEquals("\"say \"\"hello\"\"\"", SearchResultCsvExporter.escapeCsv("say \"hello\""));
  }

  @Test
  void testEscapeCsvWithNewline() {
    assertEquals("\"line1\nline2\"", SearchResultCsvExporter.escapeCsv("line1\nline2"));
  }

  @Test
  void testEscapeCsvNull() {
    assertEquals("", SearchResultCsvExporter.escapeCsv(null));
  }

  @Test
  void testEscapeCsvEmpty() {
    assertEquals("", SearchResultCsvExporter.escapeCsv(""));
  }

  @Test
  void testEscapeCsvPlainValue() {
    assertEquals("hello", SearchResultCsvExporter.escapeCsv("hello"));
  }

  @Test
  void testExtractMultipleOwners() {
    Map<String, Object> source = new HashMap<>();
    source.put(
        "owners",
        List.of(
            Map.of("displayName", "Alice"),
            Map.of("displayName", "Bob"),
            Map.of("name", "charlie")));

    String owners = SearchResultCsvExporter.extractOwners(source);

    assertEquals("Alice|Bob|charlie", owners);
  }

  @Test
  void testExtractOwnersWithDisplayNamePreference() {
    Map<String, Object> source = new HashMap<>();
    source.put("owners", List.of(Map.of("displayName", "Alice Smith", "name", "alice.smith")));

    String owners = SearchResultCsvExporter.extractOwners(source);

    assertEquals("Alice Smith", owners);
  }

  @Test
  void testExtractOwnersEmpty() {
    Map<String, Object> source = new HashMap<>();

    assertEquals("", SearchResultCsvExporter.extractOwners(source));
  }

  @Test
  void testExtractTagsVsGlossaryTerms() {
    Map<String, Object> source = new HashMap<>();
    source.put(
        "tags",
        List.of(
            Map.of("tagFQN", "PII.Sensitive", "source", "Classification"),
            Map.of("tagFQN", "PII.NonSensitive", "source", "Classification"),
            Map.of("tagFQN", "glossary.BankingTerms.Revenue", "source", "Glossary")));

    assertEquals("PII.Sensitive|PII.NonSensitive", SearchResultCsvExporter.extractTags(source));
    assertEquals(
        "glossary.BankingTerms.Revenue", SearchResultCsvExporter.extractGlossaryTerms(source));
  }

  @Test
  void testExtractDomainsMultiple() {
    Map<String, Object> source = new HashMap<>();
    source.put(
        "domains",
        List.of(
            Map.of("displayName", "Finance", "name", "finance"), Map.of("name", "engineering")));

    assertEquals("Finance|engineering", SearchResultCsvExporter.extractDomains(source));
  }

  @Test
  void testExtractDomainsFallbackToSingleDomain() {
    Map<String, Object> source = new HashMap<>();
    source.put("domain", Map.of("displayName", "Marketing", "name", "marketing"));

    assertEquals("Marketing", SearchResultCsvExporter.extractDomains(source));
  }

  @Test
  void testExtractTier() {
    Map<String, Object> source = new HashMap<>();
    source.put("tier", Map.of("tagFQN", "Tier.Tier2"));

    assertEquals("Tier.Tier2", SearchResultCsvExporter.extractTier(source));
  }

  @Test
  void testExtractTierMissing() {
    Map<String, Object> source = new HashMap<>();

    assertEquals("", SearchResultCsvExporter.extractTier(source));
  }

  @Test
  void testExtractServiceName() {
    Map<String, Object> source = new HashMap<>();
    source.put("service", Map.of("name", "my-service", "id", "123"));

    assertEquals("my-service", SearchResultCsvExporter.extractServiceName(source));
  }

  @Test
  void testExtractServiceNameMissing() {
    Map<String, Object> source = new HashMap<>();

    assertEquals("", SearchResultCsvExporter.extractServiceName(source));
  }

  @Test
  void testCsvRowWithSpecialCharactersInDescription() {
    Map<String, Object> source = new HashMap<>();
    source.put("entityType", "table");
    source.put("name", "users");
    source.put("fullyQualifiedName", "db.users");
    source.put("description", "Table with \"users\" data, including names\nand emails");

    String row = SearchResultCsvExporter.toCsvRow(source);

    assert row.contains("\"Table with \"\"users\"\" data, including names\nand emails\"");
  }

  @Test
  void testExportSourceFieldsContainsRequiredFields() {
    List<String> fields = SearchResultCsvExporter.EXPORT_SOURCE_FIELDS;

    assert fields.contains("entityType");
    assert fields.contains("name");
    assert fields.contains("displayName");
    assert fields.contains("fullyQualifiedName");
    assert fields.contains("description");
    assert fields.contains("service");
    assert fields.contains("serviceType");
    assert fields.contains("owners");
    assert fields.contains("tags");
    assert fields.contains("tier");
    assert fields.contains("domain");
    assert fields.contains("domains");
  }
}
