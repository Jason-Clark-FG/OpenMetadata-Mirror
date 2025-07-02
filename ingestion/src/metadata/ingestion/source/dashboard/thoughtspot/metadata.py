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
from metadata.generated.schema.type.entityLineage import EntitiesEdge
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
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
            dashboard.visualizations = self._extract_visualizations_from_headers(
                dashboard.visualization_headers
            )
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

            # Add charts reference if available
            if hasattr(self.context.get(), "charts") and self.context.get().charts:
                dashboard_request_dict["charts"] = self.context.get().charts

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
                viz_name = getattr(viz, "name", None) or getattr(viz, "id", "Unknown")
                if self._filter_chart(viz_name):
                    continue

                chart_url = self._get_chart_url(dashboard_details, viz)

                chart_request = CreateChartRequest(
                    name=EntityName(viz_name),
                    displayName=viz_name,
                    description=Markdown(getattr(viz, "description", ""))
                    if getattr(viz, "description", None)
                    else None,
                    chartType=get_standard_chart_type(
                        getattr(viz, "chart_type", None)
                        or getattr(viz, "viz_type", "OTHER")
                    ),
                    sourceUrl=SourceUrl(chart_url) if chart_url else None,
                    service=FullyQualifiedEntityName(
                        self.context.get().dashboard_service
                    ),
                )

                yield Either(right=chart_request)
                self.context.get().charts.append(
                    fqn.build(
                        self.metadata,
                        entity_type=Chart,
                        service_name=self.context.get().dashboard_service,
                        chart_name=chart_request.name.root,
                    )
                )

            except Exception as exc:
                yield Either(
                    left=StackTraceError(
                        name=getattr(viz, "name", None)
                        or getattr(viz, "id", "Unknown"),
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
            # Use metadata from search response directly
            metadata = (
                data_model.metadata_header
                if hasattr(data_model, "metadata_header") and data_model.metadata_header
                else {}
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

            data_model_request = CreateDashboardDataModelRequest(
                name=EntityName(name),
                displayName=name,
                description=Markdown(description) if description else None,
                dataModelType=model_type,
                columns=[],  # We don't have column info from search response
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
            model_fqn = fqn.build(
                self.metadata,
                entity_type=DashboardDataModel,
                service_name=self.context.get().dashboard_service,
                data_model_name=model_id,
            )

            if model_fqn:
                lineage = AddLineageRequest(
                    edge=EntitiesEdge(
                        fromEntity=EntityReference(
                            id=model_fqn, type="dashboardDataModel"
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

    def _extract_visualizations_from_headers(
        self, viz_headers: List[Dict[str, Any]]
    ) -> List[Any]:
        """Extract visualizations from visualization headers"""
        visualizations = []
        try:
            for viz_header in viz_headers:
                if isinstance(viz_header, dict):
                    # Extract actual chart type from header metadata
                    viz_id = viz_header.get("id", "")
                    viz_name = viz_header.get("name", "")
                    viz_type = viz_header.get("type", "CHART")

                    # Look for chart type in various possible fields
                    chart_type = (
                        viz_header.get("chartType")
                        or viz_header.get("vizType")
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

                    visualization = ThoughtSpotVisualization(
                        id=viz_id,
                        name=viz_name,
                        viz_type=viz_type,
                        chart_type=chart_type,
                    )
                    visualizations.append(visualization)
        except Exception as exc:
            logger.debug(f"Error extracting visualizations from headers: {exc}")
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

    def _create_table_lineage(
        self, data_model: Any
    ) -> Iterable[Either[AddLineageRequest]]:
        """Create lineage from tables to data model"""
        # For now, we'll skip table lineage as it requires:
        # 1. Mapping ThoughtSpot table IDs to OpenMetadata table FQNs
        # 2. Having the database service configured with matching tables
        # This can be implemented when database services are configured
        logger.debug(f"Table lineage not implemented for data model: {data_model.name}")
        return []
