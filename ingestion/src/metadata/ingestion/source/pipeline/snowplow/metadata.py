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
Snowplow Pipeline source to extract metadata
"""
import traceback
from typing import Dict, Iterable, List, Optional

from metadata.generated.schema.api.data.createDatabase import CreateDatabaseRequest
from metadata.generated.schema.api.data.createDatabaseSchema import (
    CreateDatabaseSchemaRequest,
)
from metadata.generated.schema.api.data.createPipeline import CreatePipelineRequest
from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.data.database import Database
from metadata.generated.schema.entity.data.databaseSchema import DatabaseSchema
from metadata.generated.schema.entity.data.pipeline import (
    Pipeline,
    PipelineStatus,
    StatusType,
    Task,
)
from metadata.generated.schema.entity.data.table import Column, DataType, Table
from metadata.generated.schema.entity.services.connections.pipeline.snowplowConnection import (
    SnowplowConnection,
)
from metadata.generated.schema.entity.services.databaseService import DatabaseService
from metadata.generated.schema.entity.services.ingestionPipelines.status import (
    StackTraceError,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.generated.schema.type.basic import (
    EntityName,
    FullyQualifiedEntityName,
    Markdown,
)
from metadata.generated.schema.type.entityLineage import EntitiesEdge, LineageDetails
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.models.pipeline_status import OMetaPipelineStatus
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.pipeline.pipeline_service import PipelineServiceSource
from metadata.ingestion.source.pipeline.snowplow.client import (
    SnowplowBDPClient,
    SnowplowCommunityClient,
)
from metadata.ingestion.source.pipeline.snowplow.models import (
    IgluSchema,
    SnowplowDataModel,
    SnowplowEnrichment,
    SnowplowEventType,
    SnowplowFailedEvents,
    SnowplowPipeline,
    SnowplowPipelineState,
)
from metadata.utils import fqn
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()

# Mapping of enrichment types to their standard output fields
ENRICHMENT_OUTPUT_MAPPING = {
    "ip_lookups": [
        "geo_country",
        "geo_region",
        "geo_city",
        "geo_zipcode",
        "geo_latitude",
        "geo_longitude",
        "geo_timezone",
        "geo_region_name",
    ],
    "ua_parser": [
        "br_name",
        "br_family",
        "br_version",
        "br_type",
        "br_renderengine",
        "os_name",
        "os_family",
        "os_manufacturer",
        "dvce_type",
        "dvce_ismobile",
    ],
    "referer_parser": ["refr_medium", "refr_source", "refr_term"],
    "campaign_attribution": [
        "mkt_medium",
        "mkt_source",
        "mkt_term",
        "mkt_content",
        "mkt_campaign",
        "mkt_network",
        "mkt_clickid",
    ],
    "event_fingerprint": ["event_fingerprint"],
    "cookie_extractor": ["domain_userid", "network_userid"],
    "weather": [
        "weather_temperature",
        "weather_conditions",
        "weather_wind_speed",
        "weather_humidity",
        "weather_pressure",
    ],
    "sql_query": [],  # Dynamic based on query
    "api_request": [],  # Dynamic based on API response
    "javascript": [],  # Dynamic based on script
}


class SnowplowSource(PipelineServiceSource):
    """
    Implements the necessary methods to extract
    Pipeline metadata from Snowplow source
    """

    @classmethod
    def create(
        cls, config_dict, metadata: OpenMetadata, pipeline_name: Optional[str] = None
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: SnowplowConnection = config.serviceConnection.root.config
        if not isinstance(connection, SnowplowConnection):
            raise InvalidSourceException(
                f"Expected SnowplowConnection, but got {connection}"
            )
        return cls(config, metadata)

    def __init__(
        self,
        config: WorkflowSource,
        metadata: OpenMetadata,
    ):
        super().__init__(config, metadata)
        self.connection = self.config.serviceConnection.root.config

        # Initialize the appropriate client based on deployment type
        if self.connection.deployment.value == "BDP":
            self.client = SnowplowBDPClient(
                console_url=str(self.connection.consoleUrl),
                api_key=self.connection.apiKey.get_secret_value(),
                organization_id=self.connection.organizationId,
            )
        else:
            self.client = SnowplowCommunityClient(
                config_path=self.connection.configPath,
            )

        # Store schemas and database service info
        self._schemas: List[IgluSchema] = []
        self._data_models: List[SnowplowDataModel] = []
        self._event_types: List[SnowplowEventType] = []
        self._failed_events: List[SnowplowFailedEvents] = []
        self._pipelines: List[SnowplowPipeline] = []
        self._database_service = None
        self._database = None
        self._schema = None

    def prepare(self):
        """Prepare the source"""
        # Fetch all schemas upfront
        self._schemas = self.client.get_schemas()
        logger.info(f"Found {len(self._schemas)} Iglu schemas")

        # Fetch pipelines to get enrichment info
        self._pipelines = list(self.client.get_pipelines())
        logger.info(f"Found {len(self._pipelines)} pipelines")

        # Create database entities for storing schema-based tables
        self._create_database_entities()

    def _create_database_entities(self):
        """Create database and schema entities for Snowplow data"""
        # Skip database entity creation if no schemas are available
        if not self._schemas:
            logger.info("No schemas found, skipping database entity creation")
            return

        try:
            # Use the destination warehouse info from loaders if available
            destination_info = self._get_destination_info()
            if not destination_info:
                logger.warning(
                    "No destination warehouse found in pipeline configuration"
                )
                return

            # Use existing database service from the destination
            self._database_service = self.metadata.get_by_name(
                entity=DatabaseService,
                fqn=destination_info["service_name"],
            )

            if not self._database_service:
                logger.warning(
                    f"Database service {destination_info['service_name']} not found"
                )
                return

            # Get existing database or use default
            database_name = destination_info.get("database", "snowplow_events")
            self._database = self.metadata.get_by_name(
                entity=Database,
                fqn=fqn.build(
                    self.metadata,
                    entity_type=Database,
                    service_name=destination_info["service_name"],
                    database_name=database_name,
                ),
            )

            database_request = CreateDatabaseRequest(
                name=EntityName(database_name),
                service=self._database_service.fullyQualifiedName,
            )

            self._database = self.metadata.create_or_update(database_request)

            # Create schema
            schema_name = "atomic"
            schema_fqn = fqn.build(
                self.metadata,
                entity_type=DatabaseSchema,
                service_name=destination_info["service_name"],
                database_name=database_name,
                schema_name=schema_name,
            )

            schema_request = CreateDatabaseSchemaRequest(
                name=EntityName(schema_name),
                database=self._database.fullyQualifiedName,
            )

            self._schema = self.metadata.create_or_update(schema_request)

        except Exception as err:
            logger.warning(f"Could not create database entities: {err}")

    def _get_destination_info(self) -> Optional[Dict[str, str]]:
        """Extract destination warehouse information from pipeline loaders"""
        # Map Snowplow destination types to OpenMetadata service types
        destination_mapping = {
            "redshift": {
                "service_type": "Redshift",
                "default_db": "dev",
                "default_schema": "atomic",
            },
            "bigquery": {
                "service_type": "BigQuery",
                "default_db": "snowplow",
                "default_schema": "atomic",
            },
            "snowflake": {
                "service_type": "Snowflake",
                "default_db": "SNOWPLOW",
                "default_schema": "ATOMIC",
            },
            "databricks": {
                "service_type": "Databricks",
                "default_db": "default",
                "default_schema": "atomic",
            },
            "postgres": {
                "service_type": "Postgres",
                "default_db": "snowplow",
                "default_schema": "atomic",
            },
            "s3": {
                "service_type": "Datalake",
                "default_db": "default",
                "default_schema": "atomic",
            },
        }

        # Get pipelines to check their loaders
        pipelines = list(self.client.get_pipelines())
        if not pipelines:
            return None

        # Look for the first enabled loader with a known destination
        for pipeline in pipelines:
            for loader in pipeline.loaders:
                if (
                    loader.enabled
                    and loader.destination_type.lower() in destination_mapping
                ):
                    dest_info = destination_mapping[loader.destination_type.lower()]

                    # Try to extract actual service name from loader parameters
                    service_name = loader.parameters.get("service_name")
                    if not service_name:
                        # Construct a default service name
                        service_name = f"{loader.destination_type.lower()}_warehouse"

                    return {
                        "service_name": service_name,
                        "service_type": dest_info["service_type"],
                        "database": loader.parameters.get(
                            "database", dest_info["default_db"]
                        ),
                        "schema": loader.parameters.get(
                            "schema", dest_info["default_schema"]
                        ),
                        "destination_type": loader.destination_type,
                    }

        return None

    def yield_pipeline(
        self, pipeline_details: SnowplowPipeline
    ) -> Iterable[Either[CreatePipelineRequest]]:
        """Convert a Snowplow pipeline to a CreatePipelineRequest"""
        try:
            # Map pipeline state to OpenMetadata status
            status_type = StatusType.Successful
            if pipeline_details.state == SnowplowPipelineState.FAILED:
                status_type = StatusType.Failed
            elif pipeline_details.state == SnowplowPipelineState.PAUSED:
                status_type = StatusType.Pending

            # Create tasks from pipeline components
            tasks = []

            # Add collector tasks
            for collector in pipeline_details.collectors:
                task = Task(
                    name=collector.name,
                    displayName=f"Collector: {collector.name}",
                    taskType="COLLECTOR",
                    description=f"Snowplow collector endpoint: {collector.endpoint}",
                )
                tasks.append(task)

            # Add enrichment tasks
            for enrichment in pipeline_details.enrichments:
                # Get output fields for this enrichment
                output_fields = (
                    enrichment.output_fields
                    or ENRICHMENT_OUTPUT_MAPPING.get(
                        enrichment.enrichment_type or enrichment.name, []
                    )
                )

                task = Task(
                    name=enrichment.name,
                    displayName=f"Enrichment: {enrichment.name}",
                    taskType="ENRICHMENT",
                    description=f"Snowplow {enrichment.enrichment_type or enrichment.name} enrichment "
                    f"{'enabled' if enrichment.enabled else 'disabled'}"
                    f"{f' - adds fields: {', '.join(output_fields)}' if output_fields else ''}",
                )
                tasks.append(task)

            # Add loader tasks
            for loader in pipeline_details.loaders:
                task = Task(
                    name=loader.name,
                    displayName=f"Loader: {loader.name}",
                    taskType="LOADER",
                    description=f"Loading to {loader.destination_type}",
                )
                tasks.append(task)

            # Add data model tasks if available
            for model in self._data_models:
                task = Task(
                    name=f"model_{model.name}",
                    displayName=f"Data Model: {model.name}",
                    taskType="DBT_MODEL",
                    description=f"dbt {model.model_type} model targeting {model.target_schema}",
                )
                tasks.append(task)

            pipeline_request = CreatePipelineRequest(
                name=EntityName(pipeline_details.name),
                displayName=pipeline_details.name,
                description=Markdown(pipeline_details.description or ""),
                tasks=tasks,
                service=FullyQualifiedEntityName(
                    self.context.get().pipeline_service.fullyQualifiedName
                ),
            )

            yield Either(right=pipeline_request)

            # Store pipeline in context for lineage
            self.context.get().pipeline = pipeline_details.name

            # Create tables from schemas if we have database entities
            if self._database_service and self._schemas:
                yield from self._yield_schema_tables()

        except Exception as err:
            yield Either(
                left=StackTraceError(
                    name=pipeline_details.name,
                    error=f"Failed to process pipeline: {err}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _yield_schema_tables(self) -> Iterable[Either[CreateTableRequest]]:
        """Create table entities from Iglu schemas"""
        for schema in self._schemas:
            try:
                # Convert schema to table
                table_name = f"{schema.vendor}_{schema.name}".replace(".", "_").replace(
                    "-", "_"
                )

                # Extract columns from schema
                columns = self._extract_columns_from_schema(schema)

                table_request = CreateTableRequest(
                    name=EntityName(table_name),
                    displayName=f"{schema.vendor}.{schema.name}",
                    description=Markdown(
                        f"Snowplow event table for {schema.vendor}.{schema.name} v{schema.version}"
                    ),
                    columns=columns,
                    databaseSchema=FullyQualifiedEntityName(
                        self._schema.fullyQualifiedName
                    ),
                )

                yield Either(right=table_request)

            except Exception as err:
                logger.warning(
                    f"Failed to create table for schema {schema.name}: {err}"
                )

    def _extract_columns_from_schema(self, schema: IgluSchema) -> List[Column]:
        """Extract column definitions from Iglu schema"""
        columns = []

        # Add standard Snowplow columns
        standard_columns = [
            Column(
                name="event_id",
                dataType=DataType.STRING,
                description="Unique event identifier",
            ),
            Column(
                name="collector_tstamp",
                dataType=DataType.TIMESTAMP,
                description="Timestamp when event was collected",
            ),
            Column(
                name="dvce_created_tstamp",
                dataType=DataType.TIMESTAMP,
                description="Timestamp when event was created on device",
            ),
            Column(name="event", dataType=DataType.STRING, description="Event type"),
            Column(
                name="event_name", dataType=DataType.STRING, description="Event name"
            ),
            Column(
                name="user_id", dataType=DataType.STRING, description="User identifier"
            ),
            Column(
                name="domain_userid",
                dataType=DataType.STRING,
                description="Domain user identifier",
            ),
        ]
        columns.extend(standard_columns)

        # Extract columns from schema content
        if "properties" in schema.schema_content:
            for prop_name, prop_def in schema.schema_content["properties"].items():
                column = Column(
                    name=prop_name,
                    dataType=self._map_json_type_to_data_type(
                        prop_def.get("type", "string")
                    ),
                    description=prop_def.get("description", ""),
                )
                columns.append(column)

        # Add enrichment output columns
        # Get all enrichments from the first pipeline (assuming consistent enrichments)
        if hasattr(self, "_pipelines") and self._pipelines:
            pipeline = self._pipelines[0]
            for enrichment in pipeline.enrichments:
                if enrichment.enabled:
                    output_fields = (
                        enrichment.output_fields
                        or ENRICHMENT_OUTPUT_MAPPING.get(
                            enrichment.enrichment_type or enrichment.name, []
                        )
                    )
                    for field in output_fields:
                        # Check if column already exists
                        if not any(col.name == field for col in columns):
                            columns.append(
                                Column(
                                    name=field,
                                    dataType=DataType.STRING,  # Default to string, could be enhanced
                                    description=f"Added by {enrichment.name} enrichment",
                                )
                            )

        return columns

    @staticmethod
    def _map_json_type_to_data_type(json_type: str) -> DataType:
        """Map JSON schema types to OpenMetadata DataTypes"""
        mapping = {
            "string": DataType.STRING,
            "number": DataType.DOUBLE,
            "integer": DataType.INT,
            "boolean": DataType.BOOLEAN,
            "array": DataType.ARRAY,
            "object": DataType.JSON,
        }
        return mapping.get(json_type, DataType.STRING)

    def yield_pipeline_status(
        self, pipeline_details: SnowplowPipeline
    ) -> Iterable[Either[OMetaPipelineStatus]]:
        """Yield pipeline status"""
        try:
            # Map Snowplow state to OpenMetadata status
            if pipeline_details.state == SnowplowPipelineState.RUNNING:
                pipeline_status = PipelineStatus(
                    executionStatus=StatusType.Successful,
                    timestamp=pipeline_details.updated_at or 0,
                )
            elif pipeline_details.state == SnowplowPipelineState.FAILED:
                pipeline_status = PipelineStatus(
                    executionStatus=StatusType.Failed,
                    timestamp=pipeline_details.updated_at or 0,
                )
            else:
                pipeline_status = PipelineStatus(
                    executionStatus=StatusType.Pending,
                    timestamp=pipeline_details.updated_at or 0,
                )

            pipeline_fqn = fqn.build(
                self.metadata,
                entity_type=Pipeline,
                service_name=self.context.get().pipeline_service.name,
                pipeline_name=pipeline_details.name,
            )

            yield Either(
                right=OMetaPipelineStatus(
                    pipeline_fqn=pipeline_fqn,
                    pipeline_status=pipeline_status,
                )
            )
        except Exception as err:
            yield Either(
                left=StackTraceError(
                    name=pipeline_details.name,
                    error=f"Failed to yield pipeline status: {err}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def yield_pipeline_lineage_details(
        self, pipeline_details: SnowplowPipeline
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage between pipeline components and tables"""
        try:
            pipeline_entity = self.metadata.get_by_name(
                entity=Pipeline,
                fqn=fqn.build(
                    self.metadata,
                    entity_type=Pipeline,
                    service_name=self.context.get().pipeline_service.name,
                    pipeline_name=pipeline_details.name,
                ),
            )

            if not pipeline_entity:
                return

            # 1. Create lineage from pipeline to schema-based tables
            if self._database_service and self._schema:
                for schema in self._schemas:
                    table_name = f"{schema.vendor}_{schema.name}".replace(
                        ".", "_"
                    ).replace("-", "_")
                    table_fqn = fqn.build(
                        self.metadata,
                        entity_type=Table,
                        service_name=self._database_service.name.root,
                        database_name=self._database.name.root
                        if self._database
                        else "snowplow_events",
                        schema_name=self._schema.name.root
                        if self._schema
                        else "atomic",
                        table_name=table_name,
                    )

                    table_entity = self.metadata.get_by_name(
                        entity=Table,
                        fqn=table_fqn,
                    )

                    if table_entity:
                        lineage_request = AddLineageRequest(
                            edge=EntitiesEdge(
                                fromEntity=EntityReference(
                                    id=pipeline_entity.id,
                                    type="pipeline",
                                ),
                                toEntity=EntityReference(
                                    id=table_entity.id,
                                    type="table",
                                ),
                                lineageDetails=LineageDetails(
                                    description=f"Snowplow pipeline creates {schema.name} events table from Iglu schema v{schema.version}"
                                ),
                            )
                        )
                        yield Either(right=lineage_request)

            # 2. Create lineage for data models
            for data_model in self._data_models:
                # Create lineage from pipeline to data model target tables
                for target_table in data_model.target_tables:
                    if self._database_service:
                        target_table_fqn = fqn.build(
                            self.metadata,
                            entity_type=Table,
                            service_name=self._database_service.name.root,
                            database_name=self._database.name.root
                            if self._database
                            else None,
                            schema_name=data_model.target_schema,
                            table_name=target_table,
                        )

                        target_table_entity = self.metadata.get_by_name(
                            entity=Table,
                            fqn=target_table_fqn,
                        )

                        if target_table_entity:
                            # Pipeline -> dbt model table lineage
                            lineage_request = AddLineageRequest(
                                edge=EntitiesEdge(
                                    fromEntity=EntityReference(
                                        id=pipeline_entity.id,
                                        type="pipeline",
                                    ),
                                    toEntity=EntityReference(
                                        id=target_table_entity.id,
                                        type="table",
                                    ),
                                    lineageDetails=LineageDetails(
                                        description=f"Snowplow {data_model.model_type} data model creates {target_table} table",
                                        pipeline=EntityReference(
                                            id=pipeline_entity.id,
                                            type="pipeline",
                                        ),
                                    ),
                                )
                            )
                            yield Either(right=lineage_request)

            # 3. Create lineage for enrichment outputs
            if self._database_service and self._schema:
                # Get pipeline entity to access tasks
                pipeline_entity = self.metadata.get_by_name(
                    entity=Pipeline,
                    fqn=fqn.build(
                        self.metadata,
                        entity_type=Pipeline,
                        service_name=self.context.get().pipeline_service.name,
                        pipeline_name=pipeline_details.name,
                    ),
                    fields=["tasks"],
                )

                if pipeline_entity and pipeline_entity.tasks:
                    # Create lineage for each enrichment
                    for enrichment in pipeline_details.enrichments:
                        if enrichment.enabled:
                            yield from self._yield_enrichment_lineage(
                                pipeline_entity, pipeline_details, enrichment
                            )

        except Exception as err:
            yield Either(
                left=StackTraceError(
                    name=pipeline_details.name,
                    error=f"Failed to create lineage: {err}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _yield_enrichment_lineage(
        self,
        pipeline_entity: Pipeline,
        pipeline_details: SnowplowPipeline,
        enrichment: SnowplowEnrichment,
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage for enrichment outputs"""
        try:
            # Find the enrichment task
            enrichment_task = next(
                (
                    task
                    for task in pipeline_entity.tasks
                    if task.name == enrichment.name
                ),
                None,
            )

            if not enrichment_task:
                logger.warning(f"Could not find task for enrichment {enrichment.name}")
                return

            # Get output fields for this enrichment
            output_fields = enrichment.output_fields or ENRICHMENT_OUTPUT_MAPPING.get(
                enrichment.enrichment_type or enrichment.name, []
            )

            if not output_fields:
                logger.debug(
                    f"No output fields defined for enrichment {enrichment.name}"
                )
                return

            # For each schema, check if it has the enrichment output fields
            for schema in self._schemas:
                table_name = f"{schema.vendor}_{schema.name}".replace(".", "_").replace(
                    "-", "_"
                )
                table_fqn = fqn.build(
                    self.metadata,
                    entity_type=Table,
                    service_name=self._database_service.name.root,
                    database_name=self._database.name.root
                    if self._database
                    else "snowplow_events",
                    schema_name=self._schema.name.root if self._schema else "atomic",
                    table_name=table_name,
                )

                table_entity = self.metadata.get_by_name(
                    entity=Table, fqn=table_fqn, fields=["columns"]
                )

                if table_entity and table_entity.columns:
                    # Find columns that match enrichment outputs
                    for output_field in output_fields:
                        column = next(
                            (
                                col
                                for col in table_entity.columns
                                if col.name.root == output_field
                            ),
                            None,
                        )

                        if column:
                            # Create task-to-column lineage
                            lineage_request = AddLineageRequest(
                                edge=EntitiesEdge(
                                    fromEntity=EntityReference(
                                        id=pipeline_entity.id,
                                        type="pipeline",
                                    ),
                                    toEntity=EntityReference(
                                        id=table_entity.id,
                                        type="table",
                                    ),
                                    lineageDetails=LineageDetails(
                                        description=f"Enrichment '{enrichment.name}' adds field '{output_field}' to table",
                                        columnsLineage=[
                                            {
                                                "fromColumns": [],  # No source columns for enrichments
                                                "toColumn": output_field,
                                                "function": f"{enrichment.enrichment_type or enrichment.name}_enrichment",
                                            }
                                        ],
                                    ),
                                )
                            )
                            yield Either(right=lineage_request)

            # Handle external source lineage for SQL/API enrichments
            if enrichment.external_source:
                yield from self._yield_enrichment_source_lineage(
                    enrichment, pipeline_entity
                )

        except Exception as err:
            logger.warning(
                f"Failed to create enrichment lineage for {enrichment.name}: {err}"
            )
            yield Either(
                left=StackTraceError(
                    name=f"enrichment_{enrichment.name}",
                    error=f"Failed to create enrichment lineage: {err}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _yield_enrichment_source_lineage(
        self, enrichment: SnowplowEnrichment, pipeline_entity: Pipeline
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage from external sources to enrichment"""
        try:
            if enrichment.enrichment_type == "sql_query" and enrichment.external_source:
                source_table_fqn = enrichment.external_source.get("table_fqn")
                if source_table_fqn:
                    source_table = self.metadata.get_by_name(
                        entity=Table, fqn=source_table_fqn
                    )

                    if source_table:
                        lineage_request = AddLineageRequest(
                            edge=EntitiesEdge(
                                fromEntity=EntityReference(
                                    id=source_table.id,
                                    type="table",
                                ),
                                toEntity=EntityReference(
                                    id=pipeline_entity.id,
                                    type="pipeline",
                                ),
                                lineageDetails=LineageDetails(
                                    description=f"SQL enrichment '{enrichment.name}' queries data from {source_table_fqn}",
                                ),
                            )
                        )
                        yield Either(right=lineage_request)

        except Exception as err:
            logger.warning(f"Failed to create enrichment source lineage: {err}")

    def get_pipelines_list(self) -> Iterable[SnowplowPipeline]:
        """Get the list of pipelines from Snowplow"""
        for pipeline in self.client.get_pipelines():
            yield pipeline

    def get_pipeline_name(self, pipeline_details: SnowplowPipeline) -> str:
        """Get the pipeline name"""
        return pipeline_details.name

    def test_connection(self) -> None:
        """Test the connection to Snowplow"""
        test_connection_fn = {
            "CheckAccess": self.client.test_connection,
            "GetPipelines": lambda: bool(list(self.client.get_pipelines())),
        }

        for test_fn in test_connection_fn.values():
            test_fn()
