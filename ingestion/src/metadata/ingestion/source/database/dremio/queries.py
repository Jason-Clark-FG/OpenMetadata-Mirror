#  Copyright 2025 Collate
#  Licensed under the Collate Community License, Version 1.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  https://github.com/open-metadata/OpenMetadata/blob/main/ingestion/LICENSE
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
"""
SQL queries for Dremio connector
"""

DREMIO_SQL_STATEMENT = """
SELECT 
    QUERY_ID,
    SQL,
    "USER",
    SUBMITTED,
    QUERY_TYPE,
    EXECUTION_TIME_MILLIS,
    ROWCOUNT
FROM sys.project.history.jobs
WHERE SUBMITTED >= '{start_time}'
  AND SUBMITTED < '{end_time}'
  AND QUERY_TYPE IN ('UI_RUN', 'JDBC', 'ODBC', 'REST', 'FLIGHT')
  AND SQL IS NOT NULL
ORDER BY SUBMITTED DESC
LIMIT {result_limit}
"""

DREMIO_USAGE_STATEMENT = """
SELECT 
    tbl.TABLE_NAME as table_name,
    tbl.TABLE_SCHEMA as schema_name,
    tbl.TABLE_CATALOG as database_name,
    COUNT(DISTINCT j."USER") as unique_users,
    COUNT(*) as query_count
FROM sys.project.history.jobs j
CROSS JOIN LATERAL (
    SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_CATALOG
    FROM INFORMATION_SCHEMA.TABLES
    WHERE CONCAT(TABLE_CATALOG, '.', TABLE_SCHEMA, '.', TABLE_NAME) 
        IN (SELECT value FROM TABLE(FLATTEN(input => SPLIT(j.SQL, ' '))))
) tbl
WHERE j.SUBMITTED >= '{start_time}'
  AND j.SUBMITTED < '{end_time}'
  AND j.QUERY_TYPE IN ('UI_RUN', 'JDBC', 'ODBC', 'REST', 'FLIGHT')
  AND j.SQL IS NOT NULL
GROUP BY tbl.TABLE_NAME, tbl.TABLE_SCHEMA, tbl.TABLE_CATALOG
"""

DREMIO_GET_DATABASES = """
SELECT DISTINCT TABLE_CATALOG as database_name
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG IS NOT NULL
ORDER BY TABLE_CATALOG
"""

DREMIO_GET_DATABASE_SCHEMAS = """
SELECT DISTINCT TABLE_SCHEMA as schema_name
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG = '{database}'
  AND TABLE_SCHEMA IS NOT NULL
ORDER BY TABLE_SCHEMA
"""

DREMIO_GET_TABLE_COMMENTS = """
SELECT 
    t.TABLE_NAME,
    t.TABLE_COMMENT
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_CATALOG = '{database}'
  AND t.TABLE_SCHEMA = '{schema}'
  AND t.TABLE_COMMENT IS NOT NULL
"""

DREMIO_GET_VIEW_DEFINITION = """
SELECT VIEW_DEFINITION
FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_CATALOG = '{database}'
  AND TABLE_SCHEMA = '{schema}'
  AND TABLE_NAME = '{view_name}'
"""
