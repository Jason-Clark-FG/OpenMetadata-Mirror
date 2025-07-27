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
Dremio usage module
"""
import traceback
from datetime import datetime
from typing import Dict, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

from metadata.ingestion.source.database.query_parser_source import QueryParserSource
from metadata.ingestion.source.database.usage_source import UsageSource
from metadata.utils.helpers import get_start_and_end
from metadata.utils.logger import ingestion_logger
from metadata.utils.sql_queries import QUERY_COUNT, QUERY_USER_COUNT

logger = ingestion_logger()


class DremioUsageSource(QueryParserSource, UsageSource):
    """
    Implements Usage Extraction from Dremio
    """

    def get_sql_statement(self, start_time: datetime, end_time: datetime) -> str:
        """
        Get SQL statement to retrieve queries from Dremio
        """
        return f"""
            SELECT 
                QUERY_ID as query_id,
                SQL as query_text,
                "USER" as user_name,
                SUBMITTED as start_time,
                QUERY_TYPE as query_type,
                EXECUTION_TIME_MILLIS as duration
            FROM sys.project.history.jobs
            WHERE SUBMITTED >= '{start_time.strftime("%Y-%m-%d %H:%M:%S")}'
              AND SUBMITTED < '{end_time.strftime("%Y-%m-%d %H:%M:%S")}'
              AND QUERY_TYPE IN ('UI_RUN', 'JDBC', 'ODBC', 'REST', 'FLIGHT')
              AND SQL IS NOT NULL
            ORDER BY SUBMITTED DESC
            LIMIT {self.source_config.resultLimit}
        """

    def get_table_usage_query(
        self,
        table_name: str,
        schema_name: str,
        database_name: Optional[str],
        start_time: datetime,
        end_time: datetime,
    ) -> str:
        """
        Get query to extract table usage statistics
        """
        table_filter = f"{database_name}.{schema_name}.{table_name}"

        return f"""
            WITH table_queries AS (
                SELECT 
                    j."USER",
                    j.QUERY_ID,
                    j.SUBMITTED
                FROM sys.project.history.jobs j
                WHERE j.SUBMITTED >= '{start_time.strftime("%Y-%m-%d %H:%M:%S")}'
                  AND j.SUBMITTED < '{end_time.strftime("%Y-%m-%d %H:%M:%S")}'
                  AND j.QUERY_TYPE IN ('UI_RUN', 'JDBC', 'ODBC', 'REST', 'FLIGHT')
                  AND j.SQL IS NOT NULL
                  AND (
                      LOWER(j.SQL) LIKE '%{table_name.lower()}%'
                      OR LOWER(j.SQL) LIKE '%{table_filter.lower()}%'
                  )
            )
            SELECT 
                COUNT(DISTINCT "USER") as {QUERY_USER_COUNT.value},
                COUNT(*) as {QUERY_COUNT.value}
            FROM table_queries
        """

    def yield_table_queries(self) -> Iterable[Dict[str, any]]:
        """
        Yield queries for usage processing
        """
        start, end = get_start_and_end(self.source_config.queryLogDuration)

        try:
            engine: Engine = self.connection
            query = self.get_sql_statement(start, end)

            results = engine.execute(text(query))

            for row in results:
                try:
                    query_dict = dict(row)
                    yield {
                        "query_id": query_dict.get("query_id"),
                        "query_text": query_dict.get("query_text"),
                        "user_name": query_dict.get("user_name"),
                        "start_time": query_dict.get("start_time"),
                        "query_type": query_dict.get("query_type"),
                        "duration": query_dict.get("duration", 0) / 1000.0
                        if query_dict.get("duration")
                        else 0,
                    }
                except Exception as exc:
                    logger.debug(f"Error processing query row: {exc}")
                    logger.debug(traceback.format_exc())

        except Exception as exc:
            logger.error(f"Error extracting usage queries: {exc}")
            logger.debug(traceback.format_exc())
