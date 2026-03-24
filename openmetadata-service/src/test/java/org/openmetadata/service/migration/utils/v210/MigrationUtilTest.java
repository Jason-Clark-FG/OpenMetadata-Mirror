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

package org.openmetadata.service.migration.utils.v210;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.Set;
import org.jdbi.v3.core.Handle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openmetadata.service.jdbi3.locator.ConnectionType;

class MigrationUtilTest {
  private Handle handle;
  private Connection connection;
  private DatabaseMetaData metadata;

  @BeforeEach
  void setUp() throws Exception {
    handle = mock(Handle.class);
    connection = mock(Connection.class);
    metadata = mock(DatabaseMetaData.class);

    when(handle.getConnection()).thenReturn(connection);
    when(connection.getMetaData()).thenReturn(metadata);
  }

  @Test
  void archiveLegacyThreadStorageRenamesMysqlLegacyTable() {
    stubTables(Set.of("thread_entity_legacy"));

    MigrationUtil migrationUtil = new MigrationUtil(handle, ConnectionType.MYSQL);

    assertDoesNotThrow(migrationUtil::archiveLegacyThreadStorage);
    verify(handle).execute("RENAME TABLE thread_entity_legacy TO thread_entity_archived");
  }

  @Test
  void archiveLegacyThreadStorageSkipsWhenArchiveAlreadyExists() {
    stubTables(Set.of("thread_entity_legacy", "thread_entity_archived"));

    MigrationUtil migrationUtil = new MigrationUtil(handle, ConnectionType.POSTGRES);

    assertDoesNotThrow(migrationUtil::archiveLegacyThreadStorage);
    verify(handle, never()).execute(anyString());
  }

  @Test
  void archiveLegacyThreadStorageSkipsWhenLegacyTableIsMissing() {
    stubTables(Set.of());

    MigrationUtil migrationUtil = new MigrationUtil(handle, ConnectionType.POSTGRES);

    assertDoesNotThrow(migrationUtil::archiveLegacyThreadStorage);
    verify(handle, never()).execute(anyString());
  }

  private void stubTables(Set<String> tables) {
    try {
      when(metadata.getTables(any(), any(), anyString(), any()))
          .thenAnswer(
              invocation -> {
                String tableName = invocation.getArgument(2);
                ResultSet resultSet = mock(ResultSet.class);

                if (tables.contains(tableName)) {
                  when(resultSet.next()).thenReturn(true, false);
                  when(resultSet.getString("TABLE_NAME")).thenReturn(tableName);
                } else {
                  when(resultSet.next()).thenReturn(false);
                }

                return resultSet;
              });
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }
}
