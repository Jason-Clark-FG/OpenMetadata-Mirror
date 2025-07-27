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
Dremio lineage module
"""
import traceback
from datetime import datetime
from typing import Dict, Iterator, List

from sqlalchemy import text
from sqlalchemy.engine import Engine

from metadata.generated.schema.type.tableQuery import TableQuery
from metadata.ingestion.source.database.lineage_source import LineageSource
from metadata.ingestion.source.database.query_parser_source import QueryParserSource
from metadata.utils.helpers import get_start_and_end
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class DremioLineageSource(QueryParserSource, LineageSource):
    """
    Implements Lineage Extraction from Dremio
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
                EXECUTION_TIME_MILLIS as duration,
                ROWCOUNT as rows_affected
            FROM sys.project.history.jobs
            WHERE SUBMITTED >= '{start_time.strftime("%Y-%m-%d %H:%M:%S")}'
              AND SUBMITTED < '{end_time.strftime("%Y-%m-%d %H:%M:%S")}'
              AND QUERY_TYPE IN ('UI_RUN', 'JDBC', 'ODBC', 'REST', 'FLIGHT')
              AND SQL IS NOT NULL
              AND (
                  UPPER(SQL) LIKE '%CREATE%TABLE%AS%SELECT%'
                  OR UPPER(SQL) LIKE '%INSERT%INTO%'
                  OR UPPER(SQL) LIKE '%UPDATE%'
                  OR UPPER(SQL) LIKE '%MERGE%'
                  OR UPPER(SQL) LIKE '%CREATE%VIEW%'
                  OR UPPER(SQL) LIKE '%CREATE%OR%REPLACE%VIEW%'
              )
            ORDER BY SUBMITTED DESC
            LIMIT {self.source_config.resultLimit}
        """

    def yield_table_query(self) -> Iterator[TableQuery]:
        """
        Yield table queries for lineage extraction
        """
        start, end = get_start_and_end(self.source_config.queryLogDuration)

        try:
            engine: Engine = self.connection
            query = self.get_sql_statement(start, end)

            results = engine.execute(text(query))

            for row in results:
                try:
                    query_dict = dict(row)

                    # Skip if query text is empty
                    if not query_dict.get("query_text"):
                        continue

                    yield TableQuery(
                        query=query_dict["query_text"],
                        userName=query_dict.get("user_name", ""),
                        startTime=query_dict.get("start_time", ""),
                        endTime=query_dict.get(
                            "start_time", ""
                        ),  # Dremio doesn't provide end time
                        duration=query_dict.get("duration", 0) / 1000.0
                        if query_dict.get("duration")
                        else 0,
                        analysisDate=datetime.now(),
                        serviceName=self.config.serviceName,
                    )

                except Exception as exc:
                    logger.debug(f"Error processing query row: {exc}")
                    logger.debug(traceback.format_exc())

        except Exception as exc:
            logger.error(f"Error extracting lineage queries: {exc}")
            logger.debug(traceback.format_exc())

    def get_stored_procedures(self) -> List[Dict[str, str]]:
        """
        Dremio doesn't support stored procedures
        """
        return []

    def get_stored_procedure_queries(self) -> List[Dict[str, str]]:
        """
        Dremio doesn't support stored procedures
        """
        return []
