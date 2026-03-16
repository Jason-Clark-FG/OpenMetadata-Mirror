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
SSAS / Azure Analysis Services metadata source.

Extracts databases (catalogs), tables (fact tables and dimensions) and
their columns by querying XMLA DMVs over HTTP.  Measures are surfaced as
extra columns with data type DOUBLE so they appear as metrics in the
lineage / column-level data.
"""
import traceback
from typing import Any, Iterable, List, Optional, Tuple

from metadata.generated.schema.api.data.createDatabase import CreateDatabaseRequest
from metadata.generated.schema.api.data.createDatabaseSchema import (
    CreateDatabaseSchemaRequest,
)
from metadata.generated.schema.api.data.createStoredProcedure import (
    CreateStoredProcedureRequest,
)
from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.entity.data.database import Database
from metadata.generated.schema.entity.data.databaseSchema import DatabaseSchema
from metadata.generated.schema.entity.data.table import Column, DataType, Table, TableType
from metadata.generated.schema.entity.services.connections.database.ssasConnection import (
    SSASConnection,
)
from metadata.generated.schema.entity.services.connections.metadata.openMetadataConnection import (
    OpenMetadataConnection,
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
from metadata.generated.schema.type.basic import EntityName, FullyQualifiedEntityName
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.models.ometa_classification import OMetaTagAndClassification
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.database.database_service import DatabaseServiceSource
from metadata.ingestion.source.database.ssas.client import SSASClient
from metadata.ingestion.source.database.ssas.connection import get_connection
from metadata.utils import fqn
from metadata.utils.filters import filter_by_table
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()

_SSAS_TO_OMETA_TYPE: dict = {
    "DBTYPE_I1": DataType.TINYINT,
    "DBTYPE_I2": DataType.SMALLINT,
    "DBTYPE_I4": DataType.INT,
    "DBTYPE_I8": DataType.BIGINT,
    "DBTYPE_UI1": DataType.TINYINT,
    "DBTYPE_UI2": DataType.SMALLINT,
    "DBTYPE_UI4": DataType.INT,
    "DBTYPE_UI8": DataType.BIGINT,
    "DBTYPE_R4": DataType.FLOAT,
    "DBTYPE_R8": DataType.DOUBLE,
    "DBTYPE_CY": DataType.DOUBLE,
    "DBTYPE_DECIMAL": DataType.DECIMAL,
    "DBTYPE_NUMERIC": DataType.NUMERIC,
    "DBTYPE_BOOL": DataType.BOOLEAN,
    "DBTYPE_BSTR": DataType.VARCHAR,
    "DBTYPE_STR": DataType.VARCHAR,
    "DBTYPE_WSTR": DataType.VARCHAR,
    "DBTYPE_DATE": DataType.DATE,
    "DBTYPE_DBDATE": DataType.DATE,
    "DBTYPE_DBTIME": DataType.TIME,
    "DBTYPE_DBTIMESTAMP": DataType.TIMESTAMP,
    "DBTYPE_VARIANT": DataType.VARCHAR,
}

_DEFAULT_SCHEMA = "Model"


def _map_data_type(ssas_type: str) -> DataType:
    return _SSAS_TO_OMETA_TYPE.get(ssas_type.upper(), DataType.VARCHAR)


class SSASSource(DatabaseServiceSource):
    """
    Implements the necessary methods to extract metadata from
    SQL Server Analysis Services (SSAS) and Azure Analysis Services (AAS).
    """

    def __init__(self, config: WorkflowSource, metadata: OpenMetadata):
        super().__init__()
        self.config = config
        self.metadata = metadata
        self.source_config: DatabaseServiceMetadataPipeline = (
            self.config.sourceConfig.config
        )
        self.service_connection: SSASConnection = (
            self.config.serviceConnection.root.config
        )
        self.client: SSASClient = get_connection(self.service_connection)
        self.connection_obj = self.client
        self.test_connection()

    @classmethod
    def create(
        cls,
        config_dict,
        metadata: OpenMetadataConnection,
        pipeline_name: Optional[str] = None,
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: SSASConnection = config.serviceConnection.root.config
        if not isinstance(connection, SSASConnection):
            raise InvalidSourceException(
                f"Expected SSASConnection, but got {connection}"
            )
        return cls(config, metadata)

    # ------------------------------------------------------------------
    # DatabaseServiceSource interface
    # ------------------------------------------------------------------

    def get_database_names(self) -> Iterable[str]:
        for catalog in self.client.get_catalogs():
            yield catalog

    def get_database_schema_names(self) -> Iterable[str]:
        yield _DEFAULT_SCHEMA

    def yield_database(
        self, database_name: str
    ) -> Iterable[Either[CreateDatabaseRequest]]:
        request = CreateDatabaseRequest(
            name=EntityName(database_name),
            service=FullyQualifiedEntityName(self.context.get().database_service),
        )
        yield Either(right=request)
        self.register_record_database_request(database_request=request)

    def yield_database_schema(
        self, schema_name: str
    ) -> Iterable[Either[CreateDatabaseSchemaRequest]]:
        request = CreateDatabaseSchemaRequest(
            name=EntityName(schema_name),
            database=FullyQualifiedEntityName(
                fqn.build(
                    metadata=self.metadata,
                    entity_type=Database,
                    service_name=self.context.get().database_service,
                    database_name=self.context.get().database,
                )
            ),
        )
        yield Either(right=request)
        self.register_record_schema_request(schema_request=request)

    def get_tables_name_and_type(self) -> Optional[Iterable[Tuple[str, str]]]:
        schema_name = self.context.get().database_schema
        catalog = self.context.get().database
        try:
            if self.source_config.includeTables:
                for row in self.client.get_tables(catalog):
                    table_name = row.get("TABLE_NAME", "")
                    if not table_name:
                        continue
                    table_fqn = fqn.build(
                        self.metadata,
                        entity_type=Table,
                        service_name=self.context.get().database_service,
                        database_name=catalog,
                        schema_name=schema_name,
                        table_name=table_name,
                        skip_es_search=True,
                    )
                    if filter_by_table(
                        self.source_config.tableFilterPattern,
                        (
                            table_fqn
                            if self.source_config.useFqnForFiltering
                            else table_name
                        ),
                    ):
                        self.status.filter(table_fqn, "Table Filtered Out")
                        continue
                    yield table_name, TableType.Regular.value
        except Exception as err:
            logger.error(
                f"Failed fetching tables for catalog [{catalog}] schema [{schema_name}]: {err}"
            )
            logger.debug(traceback.format_exc())
            raise

    def yield_table(
        self, table_name_and_type: Tuple[str, TableType]
    ) -> Iterable[Either[CreateTableRequest]]:
        table_name, table_type = table_name_and_type
        schema_name = self.context.get().database_schema
        db_name = self.context.get().database
        try:
            columns = self._build_columns(db_name, table_name)
            request = CreateTableRequest(
                name=EntityName(table_name),
                tableType=table_type,
                columns=columns,
                databaseSchema=FullyQualifiedEntityName(
                    fqn.build(
                        metadata=self.metadata,
                        entity_type=DatabaseSchema,
                        service_name=self.context.get().database_service,
                        database_name=db_name,
                        schema_name=schema_name,
                    )
                ),
            )
            yield Either(right=request)
            self.register_record(table_request=request)
        except Exception as exc:
            error = (
                f"Unexpected exception for table "
                f"(database=[{db_name}], schema=[{schema_name}], table=[{table_name}]): {exc}"
            )
            logger.error(error)
            logger.debug(traceback.format_exc())
            yield Either(
                left=StackTraceError(
                    name=table_name, error=error, stackTrace=traceback.format_exc()
                )
            )

    # ------------------------------------------------------------------
    # Column helpers
    # ------------------------------------------------------------------

    def _build_columns(self, catalog: str, table_name: str) -> List[Column]:
        columns: List[Column] = []
        for row in self.client.get_columns(catalog, table_name):
            col_name = row.get("COLUMN_NAME", "")
            if not col_name:
                continue
            data_type = _map_data_type(row.get("DATA_TYPE", ""))
            columns.append(
                Column(
                    name=EntityName(col_name),
                    dataType=data_type,
                    dataLength=int(row["CHARACTER_MAXIMUM_LENGTH"])
                    if row.get("CHARACTER_MAXIMUM_LENGTH")
                    else 1,
                )
            )

        # Append measures as DOUBLE columns so they appear in the schema
        for measure in self.client.get_measures(catalog):
            if measure.get("MEASUREGROUP_NAME") == table_name or not measure.get(
                "MEASUREGROUP_NAME"
            ):
                measure_name = measure.get("MEASURE_UNIQUE_NAME") or measure.get(
                    "MEASURE_NAME", ""
                )
                if measure_name and measure_name not in {c.name.root for c in columns}:
                    columns.append(
                        Column(
                            name=EntityName(measure_name),
                            dataType=DataType.DOUBLE,
                        )
                    )
        return columns

    # ------------------------------------------------------------------
    # Unsupported stubs
    # ------------------------------------------------------------------

    def get_stored_procedures(self) -> Iterable[Any]:
        return []

    def yield_stored_procedure(
        self, stored_procedure: Any
    ) -> Iterable[Either[CreateStoredProcedureRequest]]:
        return []

    def yield_tag(
        self, schema_name: str
    ) -> Iterable[Either[OMetaTagAndClassification]]:
        return []

    def close(self) -> None:
        if self.client:
            self.client.close()
