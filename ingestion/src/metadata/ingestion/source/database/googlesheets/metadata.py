#  Copyright 2021 Collate
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  http://www.apache.org/licenses/LICENSE-2.0
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

"""
Google Sheets source implementation
"""
import traceback
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from metadata.generated.schema.api.classification.createTag import CreateTagRequest
from metadata.generated.schema.api.data.createDatabase import CreateDatabaseRequest
from metadata.generated.schema.api.data.createDatabaseSchema import (
    CreateDatabaseSchemaRequest,
)
from metadata.generated.schema.api.data.createStoredProcedure import (
    CreateStoredProcedureRequest,
)
from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.data.database import Database
from metadata.generated.schema.entity.data.databaseSchema import DatabaseSchema
from metadata.generated.schema.entity.data.table import (
    Column,
    DataType,
    Table,
    TableData,
    TableType,
)
from metadata.generated.schema.entity.services.connections.database.googleSheetsConnection import (
    GoogleSheetsConnection,
)
from metadata.generated.schema.entity.services.ingestionPipelines.status import (
    StackTraceError,
)
from metadata.generated.schema.metadataIngestion.databaseServiceMetadataPipeline import (
    DatabaseServiceMetadataPipeline,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.models.topology import TopologyContextManager
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.database.database_service import (
    DatabaseServiceSource,
    DatabaseServiceTopology,
)
from metadata.ingestion.source.database.googlesheets.connection import get_connection
from metadata.ingestion.source.database.googlesheets.models import (
    ColumnInfo,
    GoogleSheetInfo,
    SheetData,
)
from metadata.utils import fqn
from metadata.utils.filters import filter_by_schema, filter_by_table
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class GoogleSheetsSource(DatabaseServiceSource):
    """
    Google Sheets Source implementation
    """

    def __init__(self, config: WorkflowSource, metadata: OpenMetadata):
        super().__init__()
        self.config = config
        self.source_config: DatabaseServiceMetadataPipeline = (
            self.config.sourceConfig.config
        )
        self.metadata = metadata
        self.service_connection = self.config.serviceConnection.root.config
        self.client = get_connection(self.service_connection)
        self._spreadsheets_cache: Dict[str, GoogleSheetInfo] = {}
        self.context = TopologyContextManager(DatabaseServiceTopology())
        self.database_source_state = set()
        self.stored_procedure_source_state = set()

    @classmethod
    def create(
        cls, config_dict, metadata: OpenMetadata, pipeline_name: Optional[str] = None
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: GoogleSheetsConnection = config.serviceConnection.root.config
        if not isinstance(connection, GoogleSheetsConnection):
            raise InvalidSourceException(
                f"Expected GoogleSheetsConnection, but got {connection}"
            )
        return cls(config, metadata)

    def get_database_names(self) -> Iterable[str]:
        """
        Default database name is 'default' or user-provided name
        """
        database_name = self.service_connection.databaseName or "default"
        yield database_name

    def yield_database(
        self, database_name: str
    ) -> Iterable[Either[CreateDatabaseRequest]]:
        """
        From topology.
        Prepare a database request and pass it to the sink
        """
        yield Either(
            right=CreateDatabaseRequest(
                name=database_name,
                service=self.context.get().database_service,
            )
        )

    def get_database_schema_names(self) -> Iterable[str]:
        """
        Each Google Sheet spreadsheet is treated as a schema
        """
        try:
            # Build query for spreadsheets
            query = "mimeType='application/vnd.google-apps.spreadsheet'"

            # Add folder filter if specified
            if self.service_connection.folderFilterPattern:
                # This would need more complex implementation to filter by folder
                pass

            # Handle pagination
            page_token = None
            while True:
                params = {
                    "q": query,
                    "pageSize": 100,
                    "fields": "nextPageToken, files(id, name, webViewLink, createdTime, modifiedTime, parents)",
                    "includeItemsFromAllDrives": self.service_connection.includeSharedDrives,
                    "supportsAllDrives": True,
                }

                if page_token:
                    params["pageToken"] = page_token

                results = self.client.drive.files().list(**params).execute()

                files = results.get("files", [])
                logger.info(f"Found {len(files)} files in this batch")

                for file in files:
                    sheet_info = GoogleSheetInfo(**file)

                    # Apply sheet filter pattern
                    if not filter_by_schema(
                        self.service_connection.sheetFilterPattern, sheet_info.name
                    ):
                        self._spreadsheets_cache[sheet_info.id] = sheet_info
                        yield sheet_info.name

                page_token = results.get("nextPageToken")
                if not page_token:
                    break

            logger.info(
                f"Total spreadsheets found and cached: {len(self._spreadsheets_cache)}"
            )

        except Exception as exc:
            logger.error(f"Error retrieving spreadsheets: {exc}")
            logger.error(f"Exception type: {type(exc)}")
            logger.error(f"Full traceback: {traceback.format_exc()}")

    def yield_database_schema(
        self, schema_name: str
    ) -> Iterable[Either[CreateDatabaseSchemaRequest]]:
        """
        From topology.
        Prepare a database schema request and pass it to the sink
        """
        # Find the spreadsheet info from cache
        sheet_info = None
        for sheet_id, info in self._spreadsheets_cache.items():
            if info.name == schema_name:
                sheet_info = info
                break

        if sheet_info:
            logger.info(f"Creating database schema for: {schema_name}")

            # Get the context values with proper error handling
            try:
                database_service = self.context.get().database_service
                database = self.context.get().database

                if not database_service or not database:
                    # This shouldn't happen with proper topology setup
                    raise ValueError(
                        f"Missing context values - database_service: {database_service}, database: {database}"
                    )

                database_fqn = fqn.build(
                    metadata=self.metadata,
                    entity_type=Database,
                    service_name=database_service,
                    database_name=database,
                )

                yield Either(
                    right=CreateDatabaseSchemaRequest(
                        name=schema_name,
                        database=database_fqn,
                        sourceUrl=sheet_info.webViewLink,
                    )
                )
            except Exception as e:
                logger.error(f"Error building database schema request: {e}")
                logger.error(f"Exception type: {type(e)}")
                logger.error(traceback.format_exc())
        else:
            logger.warning(f"Sheet info not found in cache for: {schema_name}")

    def get_tables_name_and_type(self) -> Optional[Iterable[Tuple[str, TableType]]]:
        """
        Get all sheets (tabs) from the current spreadsheet
        """
        schema_name = self.context.get().database_schema

        # Find spreadsheet ID from name
        spreadsheet_id = None
        for sheet_id, info in self._spreadsheets_cache.items():
            if info.name == schema_name:
                spreadsheet_id = sheet_id
                break

        if not spreadsheet_id:
            logger.warning(f"Could not find spreadsheet ID for {schema_name}")
            return

        try:
            # Get spreadsheet metadata
            spreadsheet = (
                self.client.sheets.spreadsheets()
                .get(spreadsheetId=spreadsheet_id)
                .execute()
            )

            sheets = spreadsheet.get("sheets", [])

            for sheet in sheets:
                properties = sheet.get("properties", {})
                sheet_name = properties.get("title", "")

                # Apply table filter pattern
                if not filter_by_table(
                    self.source_config.tableFilterPattern, sheet_name
                ):
                    yield sheet_name, TableType.Regular

        except Exception as exc:
            logger.error(f"Error retrieving sheets for {schema_name}: {exc}")
            logger.debug(traceback.format_exc())

    def yield_table(
        self, table_name_and_type: Tuple[str, TableType]
    ) -> Iterable[Either[CreateTableRequest]]:
        """
        From topology.
        Prepare a table request and pass it to the sink
        """
        table_name, table_type = table_name_and_type
        schema_name = self.context.get().database_schema

        try:
            # Get spreadsheet ID
            spreadsheet_id = None
            for sheet_id, info in self._spreadsheets_cache.items():
                if info.name == schema_name:
                    spreadsheet_id = sheet_id
                    break

            if not spreadsheet_id:
                return

            # Get sheet data to extract columns
            sheet_data = self._get_sheet_data(spreadsheet_id, table_name)

            if not sheet_data:
                return

            # Create columns from sheet data
            columns = []
            for col_info in sheet_data.columns:
                column = Column(
                    name=col_info.name,
                    displayName=col_info.name,
                    dataType=self._map_data_type(col_info.data_type),
                    description=col_info.description,
                    ordinalPosition=col_info.index,
                )
                columns.append(column)

            # Create table request
            table_request = CreateTableRequest(
                name=table_name,
                displayName=table_name,
                tableType=table_type,
                columns=columns,
                databaseSchema=fqn.build(
                    metadata=self.metadata,
                    entity_type=DatabaseSchema,
                    service_name=self.context.get().database_service,
                    database_name=self.context.get().database,
                    schema_name=self.context.get().database_schema,
                ),
                sourceUrl=f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit#gid={sheet_data.sheet_id}",
            )

            yield Either(right=table_request)

            # Register the table to track it was discovered
            self.register_record(table_request=table_request)

            # Store sheet data for sample data extraction if needed
            self.context.get().sheet_data = sheet_data

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=table_name,
                    error=f"Error processing table {table_name}: {str(exc)}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _get_sheet_data(
        self, spreadsheet_id: str, sheet_name: str
    ) -> Optional[SheetData]:
        """
        Get sheet data including columns and their types
        """
        try:
            # Get spreadsheet info
            spreadsheet = (
                self.client.sheets.spreadsheets()
                .get(spreadsheetId=spreadsheet_id, includeGridData=False)
                .execute()
            )

            # Find the sheet
            sheet_props = None
            for sheet in spreadsheet.get("sheets", []):
                if sheet["properties"]["title"] == sheet_name:
                    sheet_props = sheet["properties"]
                    break

            if not sheet_props:
                return None

            # Get data from the sheet
            # Assuming first row contains headers
            range_name = f"'{sheet_name}'!1:1000"  # Get first 1000 rows for analysis

            result = (
                self.client.sheets.spreadsheets()
                .values()
                .get(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueRenderOption="UNFORMATTED_VALUE",
                    dateTimeRenderOption="FORMATTED_STRING",
                )
                .execute()
            )

            values = result.get("values", [])

            if not values:
                return None

            # Extract columns from first row
            headers = values[0] if values else []
            columns = []

            for idx, header in enumerate(headers):
                # Get column values for type inference (excluding header)
                column_values = [
                    row[idx]
                    for row in values[1:]
                    if len(row) > idx and row[idx] is not None
                ]

                # Infer data type
                data_type = self._infer_data_type(column_values)

                # Get formula if any (would need additional API call with includeGridData=True)
                formula = None
                description = None

                column_info = ColumnInfo(
                    name=str(header) if header else f"Column_{idx + 1}",
                    index=idx,
                    data_type=data_type,
                    formula=formula,
                    description=description,
                    sample_values=column_values[:10] if column_values else [],
                )
                columns.append(column_info)

            # Get sheet info from cache
            sheet_info = self._spreadsheets_cache.get(spreadsheet_id)

            return SheetData(
                spreadsheet_id=spreadsheet_id,
                spreadsheet_name=sheet_info.name if sheet_info else spreadsheet_id,
                sheet_name=sheet_name,
                sheet_id=sheet_props["sheetId"],
                columns=columns,
                row_count=sheet_props.get("gridProperties", {}).get("rowCount", 0),
                column_count=sheet_props.get("gridProperties", {}).get(
                    "columnCount", 0
                ),
            )

        except Exception as exc:
            logger.error(f"Error getting sheet data for {sheet_name}: {exc}")
            logger.debug(traceback.format_exc())
            return None

    def _infer_data_type(self, values: List[Any]) -> str:
        """
        Infer data type from sample values
        """
        if not values:
            return "STRING"

        # Check for consistent types
        types = set()
        for value in values[:100]:  # Sample first 100 values
            if value is None:
                continue
            elif isinstance(value, bool):
                types.add("BOOLEAN")
            elif isinstance(value, int):
                types.add("INTEGER")
            elif isinstance(value, float):
                types.add("NUMBER")
            elif isinstance(value, str):
                # Check if it looks like a date
                if self._is_date_string(value):
                    types.add("DATE")
                else:
                    types.add("STRING")
            else:
                types.add("STRING")

        # Return the most specific type
        if len(types) == 1:
            return types.pop()
        elif "STRING" in types:
            return "STRING"
        elif "NUMBER" in types and "INTEGER" in types:
            return "NUMBER"
        else:
            return "STRING"

    def _is_date_string(self, value: str) -> bool:
        """
        Check if a string looks like a date
        """
        date_patterns = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y/%m/%d",
            "%d-%m-%Y",
            "%m-%d-%Y",
        ]

        for pattern in date_patterns:
            try:
                datetime.strptime(value, pattern)
                return True
            except ValueError:
                continue
        return False

    def _map_data_type(self, sheets_type: Optional[str]) -> DataType:
        """
        Map Google Sheets inferred type to OpenMetadata DataType
        """
        type_mapping = {
            "STRING": DataType.STRING,
            "INTEGER": DataType.INT,
            "NUMBER": DataType.DOUBLE,
            "BOOLEAN": DataType.BOOLEAN,
            "DATE": DataType.DATE,
        }

        return type_mapping.get(sheets_type, DataType.STRING)

    def yield_table_sample_data(self, table: Table) -> Optional[Either[TableData]]:
        """
        Yield sample data for the table if enabled
        """
        if (
            not self.source_config.sampleDataConfig
            or not self.source_config.sampleDataConfig.generateSampleData
        ):
            return None

        try:
            # Get the sheet data from context
            sheet_data = getattr(self.context.get(), "sheet_data", None)

            if not sheet_data:
                return None

            # Get more data if needed for sampling
            sample_size = self.source_config.sampleDataConfig.sampleDataCount or 100
            range_name = (
                f"'{sheet_data.sheet_name}'!1:{sample_size + 1}"  # +1 for header
            )

            result = (
                self.client.sheets.spreadsheets()
                .values()
                .get(
                    spreadsheetId=sheet_data.spreadsheet_id,
                    range=range_name,
                    valueRenderOption="FORMATTED_VALUE",
                )
                .execute()
            )

            values = result.get("values", [])

            if len(values) <= 1:  # Only header or no data
                return None

            # Skip header row
            data_rows = values[1:]

            # Convert to TableData format
            rows = []
            for row in data_rows[:sample_size]:
                # Ensure row has all columns
                padded_row = row + [None] * (len(sheet_data.columns) - len(row))
                rows.append(padded_row[: len(sheet_data.columns)])

            table_data = TableData(
                columns=[col.name for col in table.columns.root], rows=rows
            )

            return Either(right=table_data)

        except Exception as exc:
            logger.error(f"Error getting sample data for {table.name.root}: {exc}")
            logger.debug(traceback.format_exc())
            return None

    def get_stored_procedures(self) -> Iterable[Any]:
        """Google Sheets doesn't have stored procedures"""
        return []

    def yield_stored_procedure(
        self, stored_procedure: Any
    ) -> Iterable[Either[CreateStoredProcedureRequest]]:
        """Google Sheets doesn't have stored procedures"""
        return []

    def yield_procedure_lineage_and_queries(
        self,
    ) -> Iterable[Either[AddLineageRequest]]:
        """Google Sheets doesn't have stored procedures"""
        return []

    def standardize_table_name(self, schema_name: str, table_name: str) -> str:
        """
        Standardize table name
        """
        return table_name

    def close(self):
        """
        Close any connections
        """
        pass

    def yield_tag(self, schema_name: str) -> Iterable[Either[CreateTagRequest]]:
        """
        Google Sheets doesn't have tags
        """
        return []
