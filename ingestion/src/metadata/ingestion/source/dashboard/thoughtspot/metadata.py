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
ThoughtSpot source implementation
"""
import traceback
from typing import Any, Dict, Iterable, List, Optional

from metadata.generated.schema.api.data.createChart import CreateChartRequest
from metadata.generated.schema.api.data.createDashboard import CreateDashboardRequest
from metadata.generated.schema.api.data.createDashboardDataModel import (
    CreateDashboardDataModelRequest,
)
from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.data.chart import Chart
from metadata.generated.schema.entity.data.dashboardDataModel import (
    DashboardDataModel,
    DataModelType,
)
from metadata.generated.schema.entity.data.table import Table
from metadata.generated.schema.entity.services.connections.dashboard.thoughtSpotConnection import (
    ThoughtSpotConnection,
)
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
    SourceUrl,
)
from metadata.generated.schema.type.entityLineage import ColumnLineage, EntitiesEdge
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.lineage.sql_lineage import get_column_fqn
from metadata.ingestion.source.dashboard.dashboard_service import DashboardServiceSource
from metadata.ingestion.source.dashboard.thoughtspot.client import ThoughtSpotClient
from metadata.ingestion.source.dashboard.thoughtspot.models import (
    ThoughtSpotAnswer,
    ThoughtSpotLiveboard,
    ThoughtSpotObjectType,
    ThoughtSpotVisualization,
)
from metadata.utils import fqn
from metadata.utils.filters import (
    filter_by_chart,
    filter_by_dashboard,
    filter_by_datamodel,
)
from metadata.utils.helpers import get_standard_chart_type
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class ThoughtSpotSource(DashboardServiceSource):
    """
    ThoughtSpot Source implementation
    """

    config: WorkflowSource
    client: ThoughtSpotClient

    def __init__(self, config: WorkflowSource, metadata):
        super().__init__(config, metadata)
        self.client = ThoughtSpotClient(self.service_connection)
        self._data_models = {}  # Cache for data models

    @classmethod
    def create(cls, config_dict, metadata, pipeline_name: Optional[str] = None):
        config = WorkflowSource.model_validate(config_dict)
        connection: ThoughtSpotConnection = config.serviceConnection.root.config
        if not isinstance(connection, ThoughtSpotConnection):
            raise InvalidSourceException(
                f"Expected ThoughtSpotConnection, got {connection}"
            )
        return cls(config, metadata)

    def get_dashboards_list(self) -> Optional[List[Any]]:
        """
        Get list of liveboards and optionally answers
        """
        dashboards = []

        try:
            # Get liveboards
            offset = 0
            batch_size = 100

            while True:
                response = self.client.search_metadata(
                    object_type=ThoughtSpotObjectType.LIVEBOARD,
                    include_hidden=False,
                    include_deprecated=False,
                    offset=offset,
                    batch_size=batch_size,
                    include_visualization_headers=True,
                )

                for liveboard in response.headers:
                    if not self._filter_dashboard(liveboard.name):
                        dashboards.append(liveboard)

                if response.is_last_batch:
                    break

                offset += batch_size

            # Get answers if configured
            if self.service_connection.includeAnswers:
                offset = 0

                while True:
                    response = self.client.search_metadata(
                        object_type=ThoughtSpotObjectType.ANSWER,
                        include_hidden=False,
                        include_deprecated=False,
                        offset=offset,
                        batch_size=batch_size,
                    )

                    for answer in response.headers:
                        if not self._filter_answer(answer.name):
                            dashboards.append(answer)

                    if response.is_last_batch:
                        break

                    offset += batch_size

        except Exception as exc:
            logger.error(f"Error getting dashboards list: {exc}")
            logger.debug(traceback.format_exc())

        return dashboards

    def get_dashboard_name(self, dashboard: Any) -> str:
        """
        Get dashboard name
        """
        return dashboard.name

    def get_dashboard_details(self, dashboard: Any) -> Any:
        """
        Get dashboard details including visualizations
        """
        # Check if we have visualization headers from the search response
        if (
            hasattr(dashboard, "visualization_headers")
            and dashboard.visualization_headers
        ):
            # Extract visualizations from headers
            logger.info(
                f"Dashboard {dashboard.name} has {len(dashboard.visualization_headers)} visualization headers"
            )
            extracted_vizs = self._extract_visualizations_from_headers(
                dashboard.visualization_headers
            )
            logger.info(
                f"Extracted {len(extracted_vizs)} visualizations for dashboard {dashboard.name}"
            )
            # Log the extracted visualization names for debugging
            if extracted_vizs:
                viz_names = [v.name for v in extracted_vizs[:5]]  # First 5 names
                logger.debug(f"First few visualization names: {viz_names}")
            dashboard.visualizations = extracted_vizs
        elif dashboard.type == ThoughtSpotObjectType.ANSWER:
            # Answers don't have child visualizations - they are standalone
            dashboard.visualizations = []
        else:
            dashboard.visualizations = []

        return dashboard

    def yield_dashboard(
        self, dashboard_details: Any
    ) -> Iterable[Either[CreateDashboardRequest]]:
        """
        Create dashboard request from liveboard or answer
        """
        if not dashboard_details:
            return

        try:
            # Extract metadata from header if available
            metadata = (
                dashboard_details.metadata_header
                if hasattr(dashboard_details, "metadata_header")
                and dashboard_details.metadata_header
                else dashboard_details
            )

            dashboard_url = self._get_dashboard_url(dashboard_details)

            dashboard_request_dict = {
                "name": EntityName(dashboard_details.name),
                "displayName": metadata.get("name", dashboard_details.name)
                if isinstance(metadata, dict)
                else dashboard_details.name,
                "service": FullyQualifiedEntityName(
                    self.context.get().dashboard_service
                ),
            }

            # Add optional fields only if they have values
            description = (
                metadata.get("description", "")
                if isinstance(metadata, dict)
                else getattr(dashboard_details, "description", None)
            )
            if description:
                dashboard_request_dict["description"] = Markdown(description)

            if dashboard_url:
                dashboard_request_dict["sourceUrl"] = SourceUrl(dashboard_url)

            tags = self._get_tags(dashboard_details)
            if tags:
                dashboard_request_dict["tags"] = tags

            owner = self._get_owner(dashboard_details)
            if owner:
                dashboard_request_dict["owner"] = owner

            # Build chart FQNs manually from the dashboard's visualizations
            chart_fqns = []
            if (
                hasattr(dashboard_details, "visualizations")
                and dashboard_details.visualizations
            ):
                for viz in dashboard_details.visualizations:
                    viz_name = viz.name if hasattr(viz, "name") else str(viz)
                    if viz_name and viz_name != "Untitled":
                        # Build chart FQN: service_name.chart_name
                        chart_fqn = f"{self.context.get().dashboard_service}.{viz_name}"
                        chart_fqns.append(chart_fqn)

                if chart_fqns:
                    dashboard_request_dict["charts"] = chart_fqns

            dashboard_request = CreateDashboardRequest(**dashboard_request_dict)

            yield Either(right=dashboard_request)
            self.register_record(dashboard_request=dashboard_request)

        except Exception as exc:
            dashboard_name = (
                getattr(dashboard_details, "name", "Unknown")
                if dashboard_details
                else "Unknown"
            )
            yield Either(
                left=StackTraceError(
                    name=dashboard_name,
                    error=f"Error yielding dashboard: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def yield_dashboard_chart(
        self, dashboard_details: Any
    ) -> Iterable[Either[CreateChartRequest]]:
        """
        Create chart requests from visualizations
        """
        if not dashboard_details:
            return

        if not hasattr(dashboard_details, "visualizations"):
            return

        if not dashboard_details.visualizations:
            return

        for viz in dashboard_details.visualizations:
            try:
                # Handle both dict and object cases
                if isinstance(viz, dict):
                    # Extract name from dict structure
                    viz_name = viz.get("name", viz.get("id", "Unknown"))
                    if isinstance(viz_name, dict) and "value" in viz_name:
                        if (
                            isinstance(viz_name["value"], dict)
                            and "text" in viz_name["value"]
                        ):
                            viz_name = viz_name["value"]["text"]
                        else:
                            viz_name = str(viz_name.get("value", ""))
                else:
                    viz_name = getattr(viz, "name", None) or getattr(
                        viz, "id", "Unknown"
                    )

                if self._filter_chart(str(viz_name)):
                    continue

                chart_url = self._get_chart_url(dashboard_details, viz)

                # Extract chart type based on viz type
                if isinstance(viz, dict):
                    chart_type = viz.get(
                        "chart_type", viz.get("chartType", viz.get("vizType", "OTHER"))
                    )
                    description = viz.get("description", "")
                else:
                    chart_type = getattr(viz, "chart_type", None) or getattr(
                        viz, "viz_type", "OTHER"
                    )
                    description = getattr(viz, "description", "")

                # Ensure viz_name is a string
                viz_name_str = str(viz_name) if viz_name else "Untitled"

                chart_request = CreateChartRequest(
                    name=EntityName(viz_name_str),
                    displayName=viz_name_str,
                    description=Markdown(description) if description else None,
                    chartType=get_standard_chart_type(chart_type),
                    sourceUrl=SourceUrl(chart_url) if chart_url else None,
                    service=FullyQualifiedEntityName(
                        self.context.get().dashboard_service
                    ),
                )

                yield Either(right=chart_request)

            except Exception as exc:
                viz_name_for_error = "Unknown"
                try:
                    if isinstance(viz, dict):
                        viz_name_for_error = viz.get("name", viz.get("id", "Unknown"))
                    else:
                        viz_name_for_error = getattr(viz, "name", None) or getattr(
                            viz, "id", "Unknown"
                        )
                except:
                    pass

                yield Either(
                    left=StackTraceError(
                        name=str(viz_name_for_error),
                        error=f"Error yielding chart: {exc}",
                        stackTrace=traceback.format_exc(),
                    )
                )

    def yield_dashboard_lineage_details(
        self, dashboard_details: Any, db_service_name: Optional[str]
    ) -> Iterable[Either[AddLineageRequest]]:
        """
        Create lineage between dashboards and data sources
        """
        # Create lineage from data models to dashboards
        if isinstance(dashboard_details, ThoughtSpotAnswer):
            # Create lineage from worksheet/view to answer
            if dashboard_details.worksheet_id:
                yield from self._create_data_model_lineage(
                    dashboard_details, dashboard_details.worksheet_id, "worksheet"
                )
            elif dashboard_details.view_id:
                yield from self._create_data_model_lineage(
                    dashboard_details, dashboard_details.view_id, "view"
                )
        elif (
            hasattr(dashboard_details, "visualization_headers")
            and dashboard_details.visualization_headers
        ):
            # For liveboards, check if visualizations reference worksheets
            processed_worksheets = set()  # Avoid duplicate lineage
            for viz_header in dashboard_details.visualization_headers:
                if isinstance(viz_header, dict):
                    worksheet_id = viz_header.get("worksheetId")
                    if worksheet_id and worksheet_id not in processed_worksheets:
                        # Create lineage from data model to dashboard
                        yield from self._create_data_model_lineage(
                            dashboard_details, worksheet_id, "worksheet"
                        )
                        processed_worksheets.add(worksheet_id)

                        # Create lineage from data model to individual charts
                        yield from self._create_chart_to_datamodel_lineage(
                            dashboard_details, viz_header, worksheet_id
                        )

        # Create lineage from tables to data models if we have db_service_name
        if db_service_name:
            yield from self._create_table_to_datamodel_lineage(db_service_name)

    def list_datamodels(self) -> Optional[Iterable[Any]]:
        """
        List data models (worksheets and views)
        """
        data_models = []

        try:
            # Get worksheets if configured
            if self.service_connection.includeWorksheets:
                offset = 0
                batch_size = 100

                while True:
                    response = self.client.search_metadata(
                        object_type=ThoughtSpotObjectType.WORKSHEET,
                        include_hidden=False,
                        include_deprecated=False,
                        offset=offset,
                        batch_size=batch_size,
                    )

                    for worksheet in response.headers:
                        if not self._filter_data_model(worksheet.name):
                            data_models.append(worksheet)

                    if response.is_last_batch:
                        break

                    offset += batch_size

            # Skip views for now as the API doesn't support VIEW type
            # TODO: Add view support when API is updated

        except Exception as exc:
            logger.error(f"Error listing data models: {exc}")
            logger.debug(traceback.format_exc())

        return data_models

    def yield_bulk_datamodel(
        self, data_model: Any
    ) -> Iterable[Either[CreateDashboardDataModelRequest]]:
        """
        Create data model request from worksheet or view
        """
        try:
            # Get detailed metadata to extract columns
            details = self.client.get_metadata_details(data_model.id, data_model.type)

            # Use metadata from search response or details
            metadata = (
                details
                if details
                else (
                    data_model.metadata_header
                    if hasattr(data_model, "metadata_header")
                    and data_model.metadata_header
                    else {}
                )
            )

            if data_model.type == ThoughtSpotObjectType.WORKSHEET or (
                isinstance(metadata, dict) and metadata.get("type") == "WORKSHEET"
            ):
                model_type = DataModelType.ThoughtSpotWorksheet
            else:  # VIEW
                model_type = DataModelType.ThoughtSpotView

            # Extract name and description from metadata_header if available
            name = (
                metadata.get("name", data_model.name)
                if isinstance(metadata, dict)
                else data_model.name
            )
            description = (
                metadata.get("description", "") if isinstance(metadata, dict) else ""
            )

            # Extract columns from detailed metadata
            columns = []
            worksheet_info = {}
            if isinstance(details, dict):
                # The detailed metadata is in metadata_detail field
                worksheet_info = details.get("metadata_detail", {})
                if isinstance(worksheet_info, dict):
                    # Extract columns
                    columns_data = worksheet_info.get("columns", [])
                    for col in columns_data:
                        if isinstance(col, dict):
                            # Check header for hidden flag
                            header = col.get("header", {})
                            if not header.get("isHidden", False):
                                # Map ThoughtSpot data types to OpenMetadata data types
                                ts_data_type = col.get("dataType", "UNKNOWN")
                                om_data_type = self._map_data_type(ts_data_type)

                                column_dict = {
                                    "dataType": om_data_type,
                                    "name": header.get("name", col.get("name", "")),
                                    "displayName": header.get(
                                        "name", col.get("name", "")
                                    ),
                                    "description": header.get(
                                        "description", col.get("description")
                                    ),
                                }

                                # Add dataLength for string types
                                if om_data_type in [
                                    "VARCHAR",
                                    "CHAR",
                                    "BINARY",
                                    "VARBINARY",
                                ]:
                                    # Use a default length if not specified
                                    column_dict["dataLength"] = (
                                        col.get("precision", 255)
                                        if col.get("precision", -1) > 0
                                        else 255
                                    )

                                columns.append(column_dict)

            # Cache the data model for lineage
            self._data_models[data_model.id] = {
                "name": name,
                "type": model_type,
                "columns": columns,
                "tables": worksheet_info.get("tables", []) if worksheet_info else [],
                "worksheet_info": worksheet_info,
            }

            data_model_request = CreateDashboardDataModelRequest(
                name=EntityName(name),
                displayName=name,
                description=Markdown(description) if description else None,
                dataModelType=model_type,
                columns=columns,
                project=self._get_project(data_model),
                service=FullyQualifiedEntityName(self.context.get().dashboard_service),
            )

            yield Either(right=data_model_request)
            self.register_record_datamodel(datamodel_request=data_model_request)

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=data_model.name,
                    error=f"Error yielding data model: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _filter_dashboard(self, dashboard_name: str) -> bool:
        """Check if dashboard should be filtered"""
        return filter_by_dashboard(
            self.source_config.dashboardFilterPattern, dashboard_name
        )

    def _filter_answer(self, answer_name: str) -> bool:
        """Check if answer should be filtered"""
        if hasattr(self.service_connection, "answerFilterPattern"):
            return filter_by_dashboard(
                self.service_connection.answerFilterPattern, answer_name
            )
        return False

    def _filter_chart(self, chart_name: str) -> bool:
        """Check if chart should be filtered"""
        return filter_by_chart(self.source_config.chartFilterPattern, chart_name)

    def _filter_data_model(self, model_name: str) -> bool:
        """Check if data model should be filtered"""
        return filter_by_datamodel(
            self.source_config.dataModelFilterPattern, model_name
        )

    def _get_dashboard_url(self, dashboard: Any) -> Optional[str]:
        """Get dashboard URL"""
        if not dashboard or not hasattr(dashboard, "id"):
            return None
        base_url = self.service_connection.hostPort
        if (
            hasattr(dashboard, "type")
            and dashboard.type == ThoughtSpotObjectType.LIVEBOARD
        ):
            return f"{base_url}/#/pinboard/{dashboard.id}"
        else:  # Answer
            return f"{base_url}/#/answer/{dashboard.id}"

    def _get_chart_url(
        self, dashboard: Any, viz: ThoughtSpotVisualization
    ) -> Optional[str]:
        """Get chart URL"""
        base_url = self.service_connection.hostPort
        if isinstance(dashboard, ThoughtSpotLiveboard):
            return f"{base_url}/#/pinboard/{dashboard.id}/{viz.id}"
        else:  # Answer
            return f"{base_url}/#/answer/{dashboard.id}"

    def _get_tags(self, obj: Any) -> Optional[List[str]]:
        """Extract tags from object"""
        # Check metadata_header first
        if (
            hasattr(obj, "metadata_header")
            and obj.metadata_header
            and isinstance(obj.metadata_header, dict)
        ):
            tags = obj.metadata_header.get("tags", [])
            if tags:
                return [
                    tag.get("name", tag) if isinstance(tag, dict) else str(tag)
                    for tag in tags
                ]

        if hasattr(obj, "tags") and obj.tags:
            return [tag.name if hasattr(tag, "name") else str(tag) for tag in obj.tags]
        return None

    def _get_owner(self, obj: Any) -> Optional[EntityReference]:
        """Get owner reference"""
        # Check metadata_header first
        if (
            hasattr(obj, "metadata_header")
            and obj.metadata_header
            and isinstance(obj.metadata_header, dict)
        ):
            author_name = obj.metadata_header.get("authorName")
            if author_name:
                return self.metadata.get_reference_by_email(author_name)

        owner = getattr(obj, "owner", None) or getattr(obj, "author", None)
        if owner and hasattr(owner, "name"):
            return self.metadata.get_reference_by_email(owner.name)
        return None

    def _get_columns(self, data_model: Any) -> List[Dict[str, Any]]:
        """Get columns from data model"""
        columns = []
        if hasattr(data_model, "columns") and data_model.columns:
            for col in data_model.columns:
                if not col.is_hidden:
                    columns.append(
                        {
                            "name": col.name,
                            "displayName": col.display_name or col.name,
                            "dataType": col.data_type,
                            "description": col.description,
                        }
                    )
        return columns

    def _get_project(self, obj: Any) -> Optional[str]:
        """Get project/folder name"""
        # TODO: Implement project extraction when available in API
        return None

    def _create_data_model_lineage(
        self, dashboard: Any, model_id: str, model_type: str
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage from data model to dashboard"""
        try:
            # First, find the data model by ID in our cached models
            model_info = self._data_models.get(model_id)
            if not model_info:
                logger.debug(f"Data model {model_id} not found in cache")
                return

            model_name = model_info["name"]
            model_fqn = fqn.build(
                self.metadata,
                entity_type=DashboardDataModel,
                service_name=self.context.get().dashboard_service,
                data_model_name=model_name,
            )

            # Get the actual data model entity to get its FQN/ID
            data_model_entity = self.metadata.get_by_name(
                entity=DashboardDataModel, fqn=model_fqn
            )

            if data_model_entity:
                # Create lineage from data model to dashboard
                lineage = AddLineageRequest(
                    edge=EntitiesEdge(
                        fromEntity=EntityReference(
                            id=data_model_entity.id.root, type="dashboardDataModel"
                        ),
                        toEntity=EntityReference(id=dashboard.id, type="dashboard"),
                    )
                )
                yield Either(right=lineage)

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=f"{model_type}_{model_id}",
                    error=f"Error creating lineage: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_chart_to_datamodel_lineage(
        self, dashboard: Any, viz_header: Dict[str, Any], worksheet_id: str
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage from data model to individual charts"""
        try:
            # Get the worksheet/data model info
            model_info = self._data_models.get(worksheet_id)
            if not model_info:
                logger.debug(
                    f"Data model {worksheet_id} not found in cache for chart lineage"
                )
                return

            # Get the chart name from viz_header
            chart_name = self._extract_chart_name_from_header(viz_header)
            if not chart_name or chart_name == "Untitled":
                return

            # Build FQNs
            model_name = model_info["name"]
            data_model_fqn = fqn.build(
                self.metadata,
                entity_type=DashboardDataModel,
                service_name=self.context.get().dashboard_service,
                data_model_name=model_name,
            )

            chart_fqn = fqn.build(
                self.metadata,
                entity_type=Chart,
                service_name=self.context.get().dashboard_service,
                chart_name=chart_name,
            )

            # Get the actual entities
            data_model_entity = self.metadata.get_by_name(
                entity=DashboardDataModel, fqn=data_model_fqn
            )
            chart_entity = self.metadata.get_by_name(entity=Chart, fqn=chart_fqn)

            if data_model_entity and chart_entity:
                # Create lineage from data model to chart
                lineage = AddLineageRequest(
                    edge=EntitiesEdge(
                        fromEntity=EntityReference(
                            id=data_model_entity.id.root, type="dashboardDataModel"
                        ),
                        toEntity=EntityReference(id=chart_entity.id.root, type="chart"),
                    )
                )
                yield Either(right=lineage)

        except Exception as exc:
            logger.debug(f"Error creating chart to data model lineage: {exc}")

    def _extract_chart_name_from_header(
        self, viz_header: Dict[str, Any]
    ) -> Optional[str]:
        """Extract chart name from visualization header (same logic as in _extract_visualizations_from_headers)"""
        # Handle nested name structure
        name_field = viz_header.get("name", "")
        if isinstance(name_field, dict) and "value" in name_field:
            if isinstance(name_field["value"], dict) and "text" in name_field["value"]:
                name_field = name_field["value"]["text"]
            else:
                name_field = str(name_field.get("value", ""))

        # Handle nested title structure
        title_field = viz_header.get("title", "")
        if isinstance(title_field, dict) and "value" in title_field:
            if (
                isinstance(title_field["value"], dict)
                and "text" in title_field["value"]
            ):
                title_field = title_field["value"]["text"]
            else:
                title_field = str(title_field.get("value", ""))

        # Try to get the actual name from the 'name' field first
        actual_name = viz_header.get("name", "")
        if (
            isinstance(actual_name, str)
            and actual_name
            and actual_name not in ["Chart 0", "Chart 1", "Table 1"]
        ):
            return actual_name
        elif (
            isinstance(name_field, str)
            and name_field
            and name_field not in ["Chart 0", "Chart 1", "Table 1"]
        ):
            return name_field
        elif (
            isinstance(title_field, str)
            and title_field
            and title_field not in ["Chart 0", "Chart 1", "Table 1"]
        ):
            return title_field

        return None

    def _extract_visualizations_from_headers(
        self, viz_headers: List[Dict[str, Any]]
    ) -> List[Any]:
        """Extract visualizations from visualization headers"""
        visualizations = []
        try:
            for viz_header in viz_headers:
                if isinstance(viz_header, dict):
                    # Extract actual chart type from header metadata
                    viz_id = viz_header.get("id", "") or viz_header.get(
                        "visualization_id", ""
                    )

                    # Handle nested name structure
                    name_field = viz_header.get("name", "")
                    if isinstance(name_field, dict) and "value" in name_field:
                        # Handle nested structure like {"value": {"text": "Chart 1"}}
                        if (
                            isinstance(name_field["value"], dict)
                            and "text" in name_field["value"]
                        ):
                            name_field = name_field["value"]["text"]
                        else:
                            name_field = str(name_field.get("value", ""))

                    # Handle nested title structure (same as name)
                    title_field = viz_header.get("title", "")
                    if isinstance(title_field, dict) and "value" in title_field:
                        # Handle nested structure like {"value": {"text": "Chart 0"}}
                        if (
                            isinstance(title_field["value"], dict)
                            and "text" in title_field["value"]
                        ):
                            title_field = title_field["value"]["text"]
                        else:
                            title_field = str(title_field.get("value", ""))

                    # Try to get the actual name from the 'name' field first
                    # The 'name' field seems to contain the actual chart name like "Query Count, Daily"
                    # while 'title' contains generic names like "Chart 0"

                    # First try to get actual name as string
                    actual_name = viz_header.get("name", "")
                    if (
                        isinstance(actual_name, str)
                        and actual_name
                        and actual_name not in ["Chart 0", "Chart 1", "Table 1"]
                    ):
                        viz_name = actual_name
                    # Then try extracted name_field (which handles nested structures)
                    elif (
                        isinstance(name_field, str)
                        and name_field
                        and name_field not in ["Chart 0", "Chart 1", "Table 1"]
                    ):
                        viz_name = name_field
                    # Then try extracted title_field
                    elif (
                        isinstance(title_field, str)
                        and title_field
                        and title_field not in ["Chart 0", "Chart 1", "Table 1"]
                    ):
                        viz_name = title_field
                    # Look for other possible name fields
                    else:
                        viz_name = (
                            viz_header.get("visualization_name", "")
                            or viz_header.get("viz_name", "")
                            or f"Visualization_{viz_id[:8]}"
                            if viz_id
                            else "Untitled"
                        )

                    # Get viz type - this seems to be in 'vizType' field
                    viz_type = viz_header.get(
                        "vizType", viz_header.get("type", "CHART")
                    )

                    # Look for chart type in various possible fields
                    # vizType seems to contain the actual chart type
                    chart_type = (
                        viz_header.get("vizType")
                        or viz_header.get("chartType")
                        or viz_header.get("visualizationType")
                    )
                    if not chart_type:
                        # Try to infer from type or use a generic type
                        if "table" in viz_type.lower():
                            chart_type = "TABLE"
                        elif "chart" in viz_type.lower():
                            chart_type = "CHART"
                        else:
                            chart_type = "OTHER"

                    # Ensure viz_name is a string
                    if not isinstance(viz_name, str):
                        viz_name = str(viz_name) if viz_name else "Untitled"

                    visualization = ThoughtSpotVisualization(
                        id=str(viz_id) if viz_id else "",
                        name=viz_name,
                        viz_type=str(viz_type) if viz_type else "CHART",
                        chart_type=str(chart_type) if chart_type else "OTHER",
                    )
                    visualizations.append(visualization)
        except Exception as exc:
            logger.error(f"Error extracting visualizations from headers: {exc}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Return raw headers as fallback - but this is wrong!
            # Instead, return empty list
            return []
        return visualizations

    def _extract_answer_as_visualization(
        self, answer: Any, viz_data: Dict[str, Any]
    ) -> List[Any]:
        """Extract answer as a visualization"""
        visualizations = []
        try:
            # Use GraphQL response data if available
            if viz_data:
                viz_type = viz_data.get("vizType", "TABLE")
                chart_type = viz_data.get("chartType", "TABLE")
            else:
                viz_type = "TABLE"
                chart_type = "TABLE"

            # Answers are single visualizations
            visualization = ThoughtSpotVisualization(
                id=answer.id,
                name=answer.name,
                viz_type=viz_type,
                chart_type=chart_type,
            )
            visualizations.append(visualization)
        except Exception as exc:
            logger.debug(f"Error extracting answer as visualization: {exc}")
        return visualizations

    def _create_table_to_datamodel_lineage(
        self, db_service_name: str
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage from tables to data models"""
        for data_model_id, data_model_info in self._data_models.items():
            try:
                # Get the data model entity
                data_model_fqn = fqn.build(
                    self.metadata,
                    entity_type=DashboardDataModel,
                    service_name=self.context.get().dashboard_service,
                    data_model_name=data_model_info["name"],
                )

                data_model_entity = self.metadata.get_by_name(
                    entity=DashboardDataModel, fqn=data_model_fqn
                )

                if not data_model_entity:
                    continue

                # Get tables from worksheet info
                tables = data_model_info.get("tables", [])
                columns_lineage = []

                for table_info in tables:
                    if isinstance(table_info, dict):
                        table_name = table_info.get("name")
                        table_id = table_info.get("id")

                        if table_name:
                            # Try to find the table in OpenMetadata
                            # Assuming table naming convention: database.schema.table
                            table_parts = table_name.split(".")
                            if len(table_parts) >= 1:
                                table_fqn = fqn.build(
                                    self.metadata,
                                    entity_type=Table,
                                    service_name=db_service_name,
                                    database_name=table_parts[0]
                                    if len(table_parts) > 2
                                    else None,
                                    schema_name=table_parts[-2]
                                    if len(table_parts) > 1
                                    else None,
                                    table_name=table_parts[-1],
                                )

                                table_entity = self.metadata.get_by_name(
                                    entity=Table, fqn=table_fqn
                                )

                                if table_entity:
                                    # Create table to data model lineage
                                    yield self._get_add_lineage_request(
                                        to_entity=data_model_entity,
                                        from_entity=table_entity,
                                        column_lineage=self._get_column_lineage_for_datamodel(
                                            table_entity,
                                            data_model_entity,
                                            data_model_info,
                                        ),
                                    )

            except Exception as exc:
                logger.debug(
                    f"Error creating table lineage for data model {data_model_id}: {exc}"
                )
                logger.debug(traceback.format_exc())

    def _get_column_lineage_for_datamodel(
        self,
        table_entity: Table,
        data_model_entity: DashboardDataModel,
        data_model_info: Dict,
    ) -> List[ColumnLineage]:
        """Get column lineage between table and data model"""
        column_lineage = []
        try:
            # Get worksheet info with column mappings
            worksheet_info = data_model_info.get("worksheet_info", {})
            column_mappings = worksheet_info.get("columnMappings", [])

            # Map table columns to data model columns
            for mapping in column_mappings:
                if isinstance(mapping, dict):
                    table_col_name = mapping.get("tableColumnName")
                    worksheet_col_name = mapping.get("worksheetColumnName")

                    if table_col_name and worksheet_col_name:
                        # Find table column FQN
                        from_column = get_column_fqn(
                            table_entity=table_entity, column=table_col_name
                        )

                        # Find data model column FQN
                        to_column = self._get_data_model_column_fqn(
                            data_model_entity=data_model_entity,
                            column=worksheet_col_name,
                        )

                        if from_column and to_column:
                            column_lineage.append(
                                ColumnLineage(
                                    fromColumns=[from_column], toColumn=to_column
                                )
                            )

        except Exception as exc:
            logger.debug(f"Error creating column lineage: {exc}")

        return column_lineage

    def _map_data_type(self, thoughtspot_type: str) -> str:
        """Map ThoughtSpot data types to OpenMetadata data types"""
        type_mapping = {
            # Numeric types
            "INT32": "INT",
            "INT64": "BIGINT",
            "FLOAT": "FLOAT",
            "DOUBLE": "DOUBLE",
            # String types
            "VARCHAR": "VARCHAR",
            "CHAR": "CHAR",
            # Date/Time types
            "DATE": "DATE",
            "TIME": "TIME",
            "DATE_TIME": "DATETIME",
            "TIMESTAMP": "TIMESTAMP",
            # Boolean
            "BOOL": "BOOLEAN",
            # Default
            "UNKNOWN": "UNKNOWN",
        }
        return type_mapping.get(thoughtspot_type, "UNKNOWN")
