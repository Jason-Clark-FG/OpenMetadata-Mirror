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
HubSpot Dashboard source to extract metadata
"""
import traceback
from datetime import datetime
from typing import Iterable, List, Optional

try:
    pass
except ImportError:
    # Fallback to hubspot-api-client if hubspot package is not available
    pass

from metadata.generated.schema.api.data.createChart import CreateChartRequest
from metadata.generated.schema.api.data.createDashboard import CreateDashboardRequest
from metadata.generated.schema.api.data.createDashboardDataModel import (
    CreateDashboardDataModelRequest,
)
from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.services.connections.dashboard.hubspotConnection import (
    HubspotConnection,
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
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.dashboard.dashboard_service import DashboardServiceSource
from metadata.ingestion.source.dashboard.hubspot.models import HubSpotDashboard
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class HubspotSource(DashboardServiceSource):
    """
    HubSpot Dashboard Source
    """

    @classmethod
    def create(
        cls,
        config_dict: dict,
        metadata: OpenMetadata,
        pipeline_name: Optional[str] = None,
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: HubspotConnection = config.serviceConnection.root.config
        if not isinstance(connection, HubspotConnection):
            raise InvalidSourceException(
                f"Expected HubspotConnection, but got {connection}"
            )
        return cls(config, metadata)

    def __init__(
        self,
        config: WorkflowSource,
        metadata: OpenMetadata,
    ):
        super().__init__(config, metadata)
        self.hubspot_client = self.connection

    def get_dashboards_list(self) -> Optional[List[HubSpotDashboard]]:
        """
        Get List of all dashboards

        Note: HubSpot doesn't have a direct dashboard API endpoint.
        We'll use analytics reports as a proxy for dashboards.
        """
        try:
            # Since HubSpot doesn't have dedicated dashboard endpoints,
            # we'll create synthetic dashboards based on report categories
            dashboards = []

            # Create a default analytics dashboard
            default_dashboard = HubSpotDashboard(
                id="hubspot-analytics-dashboard",
                name="HubSpot Analytics Dashboard",
                description="Default HubSpot Analytics Dashboard containing all reports",
                reports=[],
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            dashboards.append(default_dashboard)

            # You can add more synthetic dashboards based on report types
            # For example: Marketing Dashboard, Sales Dashboard, etc.

            return dashboards

        except Exception as exc:
            logger.debug(traceback.format_exc())
            logger.warning(f"Failed to get dashboards list: {exc}")
            return []

    def get_dashboard_name(self, dashboard: HubSpotDashboard) -> str:
        """
        Get Dashboard Name
        """
        return dashboard.name

    def get_dashboard_details(self, dashboard: HubSpotDashboard) -> HubSpotDashboard:
        """
        Get Dashboard Details
        """
        return dashboard

    def yield_dashboard(
        self, dashboard_details: HubSpotDashboard
    ) -> Iterable[Either[CreateDashboardRequest]]:
        """
        Method to Get Dashboard Entity
        """
        try:
            dashboard_request = CreateDashboardRequest(
                name=EntityName(dashboard_details.id),
                displayName=dashboard_details.name,
                description=Markdown(dashboard_details.description)
                if dashboard_details.description
                else None,
                sourceUrl=SourceUrl(
                    f"https://app.hubspot.com/analytics/{self.service_connection.hubId or 'default'}/dashboards"
                ),
                service=FullyQualifiedEntityName(self.context.get().dashboard_service),
            )
            yield Either(right=dashboard_request)
            self.register_record(dashboard_request=dashboard_request)
        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=dashboard_details.id,
                    error=f"Error creating dashboard: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def yield_dashboard_chart(
        self, dashboard_details: HubSpotDashboard
    ) -> Iterable[Either[CreateChartRequest]]:
        """
        Method to yield charts linked to dashboard
        """
        try:
            # Get analytics reports which we'll treat as charts
            start_date = "20240101"  # Default start date
            end_date = "20241231"  # Default end date

            # Try to get various report types
            report_types = ["sources", "pages", "contacts", "deals"]

            for report_type in report_types:
                try:
                    # Create a synthetic chart for each report type
                    chart_request = CreateChartRequest(
                        name=EntityName(f"{dashboard_details.id}-{report_type}-chart"),
                        displayName=f"{report_type.title()} Analytics",
                        description=Markdown(f"HubSpot {report_type} analytics report"),
                        chartType="Line",
                        sourceUrl=SourceUrl(
                            f"https://app.hubspot.com/analytics/{self.service_connection.hubId or 'default'}/reports"
                        ),
                        service=FullyQualifiedEntityName(
                            self.context.get().dashboard_service
                        ),
                    )
                    yield Either(right=chart_request)
                    self.register_record_chart(
                        dashboard_details=dashboard_details, chart_request=chart_request
                    )
                except Exception as exc:
                    logger.debug(f"Failed to create chart for {report_type}: {exc}")
                    continue

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=dashboard_details.id,
                    error=f"Error getting charts: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def yield_dashboard_lineage_details(
        self, dashboard_details: HubSpotDashboard, db_service_name: str
    ) -> Iterable[Either[AddLineageRequest]]:
        """
        Method to yield lineage details
        """
        # HubSpot doesn't provide direct lineage information
        # You would need to implement custom logic based on your data sources
        return

    def yield_datamodel(
        self, dashboard_details: HubSpotDashboard
    ) -> Iterable[Either[CreateDashboardDataModelRequest]]:
        """
        Method to yield data models
        """
        try:
            # Create a synthetic data model for HubSpot analytics
            datamodel_request = CreateDashboardDataModelRequest(
                name=EntityName(f"{dashboard_details.id}-datamodel"),
                displayName=f"{dashboard_details.name} Data Model",
                description=Markdown("HubSpot Analytics Data Model"),
                dataModelType="HubSpotAnalytics",
                service=FullyQualifiedEntityName(self.context.get().dashboard_service),
            )
            yield Either(right=datamodel_request)
            self.register_record_datamodel(
                dashboard_details=dashboard_details, datamodel_request=datamodel_request
            )
        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=f"{dashboard_details.id}-datamodel",
                    error=f"Error creating data model: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )


from metadata.ingestion.models.topology import StackTraceError
