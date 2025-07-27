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
Dremio source module
"""
import traceback
from typing import Iterable, List, Optional, Tuple

import requests
from sqlalchemy import text
from sqlalchemy.engine import Inspector

from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.entity.data.table import Column, TableType
from metadata.generated.schema.entity.services.connections.database.dremioConnection import (
    DremioConnection,
)
from metadata.generated.schema.entity.services.ingestionPipelines.status import (
    StackTraceError,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.generated.schema.type.basic import EntityName
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.database.column_type_parser import ColumnTypeParser
from metadata.ingestion.source.database.common_db_source import (
    CommonDbSourceService,
    TableNameAndType,
)
from metadata.utils.filters import filter_by_database, filter_by_schema, filter_by_table
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class DremioSource(CommonDbSourceService):
    """
    Implements the necessary methods to extract
    Database metadata from Dremio
    """

    def __init__(
        self,
        config: WorkflowSource,
        metadata: OpenMetadata,
    ):
        super().__init__(config, metadata)
        self.dremio_api_client = self._init_dremio_api_client()

    def _init_dremio_api_client(self) -> Optional[requests.Session]:
        """
        Initialize Dremio REST API client for catalog operations
        """
        try:
            service_conn = self.config.serviceConnection.root.config
            if not isinstance(service_conn, DremioConnection):
                return None

            session = requests.Session()

            # Get auth token via API v2
            auth_url = f"http://{service_conn.hostPort}/apiv2/login"
            auth_data = {
                "userName": service_conn.username.root.get_secret_value(),
                "password": service_conn.password.root.get_secret_value(),
            }

            response = session.post(auth_url, json=auth_data)
            response.raise_for_status()

            token = response.json().get("token")
            session.headers.update(
                {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            )

            return session
        except Exception as exc:
            logger.warning(f"Failed to initialize Dremio API client: {exc}")
            return None

    def _get_catalog_datasets(self) -> List[dict]:
        """
        Get all datasets from Dremio catalog
        """
        if not self.dremio_api_client:
            return []

        try:
            catalog_url = f"http://{self.config.serviceConnection.root.config.hostPort}/api/v3/catalog"
            response = self.dremio_api_client.get(catalog_url)
            response.raise_for_status()

            catalog_data = response.json()
            datasets = []

            # Recursively get datasets from catalog
            def extract_datasets(items):
                for item in items:
                    if item.get("type") == "DATASET":
                        datasets.append(item)
                    elif item.get("type") in ["CONTAINER", "SOURCE", "SPACE", "HOME"]:
                        # Get children
                        if "id" in item:
                            child_url = f"{catalog_url}/{item['id']}"
                            try:
                                child_response = self.dremio_api_client.get(child_url)
                                if child_response.status_code == 200:
                                    child_data = child_response.json()
                                    if "children" in child_data:
                                        extract_datasets(child_data["children"])
                            except Exception:
                                pass

            if "data" in catalog_data:
                extract_datasets(catalog_data["data"])

            return datasets
        except Exception as exc:
            logger.warning(f"Failed to get catalog datasets: {exc}")
            return []

    @classmethod
    def create(
        cls,
        config_dict: dict,
        metadata_config: OpenMetadata,
        pipeline_name: Optional[str] = None,
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: DremioConnection = config.serviceConnection.root.config
        if not isinstance(connection, DremioConnection):
            raise InvalidSourceException(
                f"Expected DremioConnection, but got {connection}"
            )
        return cls(config, metadata_config)

    def get_database_names(self) -> Iterable[str]:
        """
        Get list of databases/spaces from Dremio
        """
        configured_db = self.config.serviceConnection.root.config.database
        if configured_db:
            yield configured_db
        else:
            # In Dremio, databases are typically represented as Sources or Spaces
            if self.dremio_api_client:
                try:
                    catalog_url = f"http://{self.config.serviceConnection.root.config.hostPort}/api/v3/catalog"
                    response = self.dremio_api_client.get(catalog_url)
                    response.raise_for_status()

                    catalog_data = response.json()
                    for item in catalog_data.get("data", []):
                        if item.get("type") in ["SOURCE", "SPACE"]:
                            db_name = item.get("path", [item.get("name", "")])[-1]
                            if filter_by_database(
                                self.source_config.databaseFilterPattern,
                                database_name=db_name,
                            ):
                                yield db_name
                except Exception as exc:
                    logger.warning(f"Failed to get databases from API: {exc}")

            # Fallback to SQL query
            results = self.connection.execute(
                text("SELECT DISTINCT TABLE_CATALOG FROM INFORMATION_SCHEMA.TABLES")
            )
            for row in results:
                db_name = row[0]
                if filter_by_database(
                    self.source_config.databaseFilterPattern,
                    database_name=db_name,
                ):
                    yield db_name

    def get_database_schema_names(self) -> Iterable[str]:
        """
        Get list of schemas from current database
        """
        if self.dremio_api_client and hasattr(self.context, "get"):
            try:
                current_db = self.context.get().database

                # Try to get schemas via API
                catalog_url = f"http://{self.config.serviceConnection.root.config.hostPort}/api/v3/catalog/by-path/{current_db}"
                response = self.dremio_api_client.get(catalog_url)

                if response.status_code == 200:
                    data = response.json()
                    for child in data.get("children", []):
                        if child.get("type") in ["FOLDER", "SCHEMA"]:
                            schema_name = child.get("name", "")
                            if filter_by_schema(
                                self.source_config.schemaFilterPattern,
                                schema_name=schema_name,
                            ):
                                yield schema_name
                    return
            except Exception as exc:
                logger.debug(f"Failed to get schemas from API: {exc}")

        # Fallback to SQL query
        results = self.connection.execute(
            text(
                """
                SELECT DISTINCT TABLE_SCHEMA
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_CATALOG = :database
            """
            ),
            {"database": self.context.get().database},
        )

        for row in results:
            schema_name = row[0]
            if filter_by_schema(
                self.source_config.schemaFilterPattern, schema_name=schema_name
            ):
                yield schema_name

    def get_tables_name_and_type(self) -> Optional[Iterable[Tuple[str, str]]]:
        """
        Get table names and types from current schema
        """
        current_db = self.context.get().database
        current_schema = self.context.get().database_schema

        # Query tables from INFORMATION_SCHEMA
        query = text(
            """
            SELECT TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_CATALOG = :database
              AND TABLE_SCHEMA = :schema
        """
        )

        results = self.connection.execute(
            query, {"database": current_db, "schema": current_schema}
        )

        for table_name, table_type in results:
            if filter_by_table(
                self.source_config.tableFilterPattern, table_name=table_name
            ):
                # Map Dremio table types to OpenMetadata types
                if table_type == "VIEW":
                    yield TableNameAndType(name=table_name, type_=TableType.View)
                else:
                    yield TableNameAndType(name=table_name, type_=TableType.Regular)

    def get_view_definition(
        self, table_type: str, table_name: str, schema_name: str, inspector: Inspector
    ) -> Optional[str]:
        """
        Get view definition from Dremio
        """
        if table_type != TableType.View:
            return None

        try:
            current_db = self.context.get().database
            result = self.connection.execute(
                text(
                    """
                    SELECT VIEW_DEFINITION
                    FROM INFORMATION_SCHEMA.VIEWS
                    WHERE TABLE_CATALOG = :database
                      AND TABLE_SCHEMA = :schema
                      AND TABLE_NAME = :view_name
                """
                ),
                {
                    "database": current_db,
                    "schema": schema_name,
                    "view_name": table_name,
                },
            ).first()

            return result[0] if result else None
        except Exception as exc:
            logger.debug(f"Failed to get view definition for {table_name}: {exc}")
            return None

    def yield_table(
        self, table_name_and_type: Tuple[str, TableType]
    ) -> Iterable[Either[CreateTableRequest]]:
        """
        Custom yield_table implementation to handle Dremio-specific metadata
        """
        table_name, table_type = table_name_and_type.name, table_name_and_type.type_

        try:
            current_db = self.context.get().database
            current_schema = self.context.get().database_schema

            # Get columns using INFORMATION_SCHEMA
            columns = []
            column_results = self.connection.execute(
                text(
                    """
                    SELECT 
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT,
                        ORDINAL_POSITION,
                        CHARACTER_MAXIMUM_LENGTH,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_CATALOG = :database
                      AND TABLE_SCHEMA = :schema
                      AND TABLE_NAME = :table_name
                    ORDER BY ORDINAL_POSITION
                """
                ),
                {
                    "database": current_db,
                    "schema": current_schema,
                    "table_name": table_name,
                },
            )

            for col in column_results:
                parsed_type = ColumnTypeParser.get_column_type(col.DATA_TYPE)
                columns.append(
                    Column(
                        name=col.COLUMN_NAME,
                        dataType=parsed_type,
                        dataLength=col.CHARACTER_MAXIMUM_LENGTH,
                        precision=col.NUMERIC_PRECISION,
                        scale=col.NUMERIC_SCALE,
                        dataTypeDisplay=col.DATA_TYPE,
                        nullable=col.IS_NULLABLE == "YES",
                        defaultValue=str(col.COLUMN_DEFAULT)
                        if col.COLUMN_DEFAULT
                        else None,
                        ordinalPosition=col.ORDINAL_POSITION,
                    )
                )

            # Get view definition if it's a view
            view_definition = None
            if table_type == TableType.View:
                view_definition = self.get_view_definition(
                    table_type, table_name, current_schema, None
                )

            yield Either(
                right=CreateTableRequest(
                    name=EntityName(table_name),
                    tableType=table_type,
                    columns=columns,
                    viewDefinition=view_definition,
                    databaseSchema=self.context.get().database_schema,
                )
            )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=table_name,
                    error=f"Error processing table {table_name}: {str(exc)}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def prepare(self):
        """
        Prepare any prerequisites
        """
        pass
