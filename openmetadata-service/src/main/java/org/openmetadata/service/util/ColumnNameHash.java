/*
 *  Copyright 2021 Collate
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

package org.openmetadata.service.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import lombok.SneakyThrows;
import org.apache.commons.codec.binary.Hex;
import org.openmetadata.schema.type.Column;

/**
 * Utility for hashing column names to produce fixed-length identifiers for use in FQN
 * construction. This decouples FQN length from raw column name length, solving issues with long
 * column names (e.g., deeply nested BigQuery structs) exceeding VARCHAR(3072) limits on entityLink.
 *
 * <p>The raw column name is preserved in {@code Column.name}; only the FQN segment is hashed.
 */
public final class ColumnNameHash {

  public static final String HASH_PREFIX = "md5_";
  public static final int HASH_LENGTH = 36; // "md5_" (4) + 32 hex chars

  private ColumnNameHash() {}

  /**
   * Hash a raw column name for use as the column segment in a fully qualified name. Uses explicit
   * UTF-8 encoding to guarantee identical output to the Python implementation regardless of JVM
   * default charset.
   *
   * @param rawColumnName the original column name from the source system
   * @return a fixed-length identifier in the format "md5_&lt;32 hex chars&gt;"
   */
  @SneakyThrows
  public static String hashColumnName(String rawColumnName) {
    byte[] checksum =
        MessageDigest.getInstance("MD5").digest(rawColumnName.getBytes(StandardCharsets.UTF_8));
    return HASH_PREFIX + Hex.encodeHexString(checksum);
  }

  /**
   * Check whether a string is a hashed column FQN segment produced by {@link
   * #hashColumnName(String)}.
   */
  public static boolean isHashedColumnFQNSegment(String segment) {
    return segment != null && segment.startsWith(HASH_PREFIX) && segment.length() == HASH_LENGTH;
  }

  /**
   * Resolve a hashed FQN segment back to the raw column name by looking up the matching column. If
   * no match is found, returns the segment as-is.
   */
  public static String resolveColumnName(List<Column> columns, String hashedSegment) {
    if (columns == null || !isHashedColumnFQNSegment(hashedSegment)) {
      return hashedSegment;
    }
    return columns.stream()
        .filter(c -> hashColumnName(c.getName()).equals(hashedSegment))
        .map(Column::getName)
        .findFirst()
        .orElse(hashedSegment);
  }
}
