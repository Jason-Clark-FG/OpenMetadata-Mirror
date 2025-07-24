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
Source connection handler for HubSpot
"""
from typing import Optional

try:
    from hubspot import HubSpot
except ImportError:
    # Fallback to hubspot-api-client if hubspot package is not available
    from hubspot.api_client import Client as HubSpot

from metadata.generated.schema.entity.automations.workflow import (
    Workflow as AutomationWorkflow,
)
from metadata.generated.schema.entity.services.connections.dashboard.hubspotConnection import (
    HubspotConnection,
)
from metadata.ingestion.connections.test_connections import (
    SourceConnectionException,
    test_connection_steps,
)
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


def get_connection(connection: HubspotConnection) -> HubSpot:
    """
    Create connection
    """
    try:
        # HubSpot SDK uses access token directly
        return HubSpot(access_token=connection.accessToken.get_secret_value())
    except Exception as exc:
        msg = f"Unknown error connecting with HubSpot: {exc}."
        raise SourceConnectionException(msg) from exc


def test_connection(
    metadata: OpenMetadata,
    client: HubSpot,
    service_connection: HubspotConnection,
    automation_workflow: Optional[AutomationWorkflow] = None,
) -> None:
    """
    Test connection to HubSpot
    """

    def custom_test_list_reports():
        """
        Test if we can list analytics reports
        """
        try:
            # Test the connection by trying to get account information
            client.analytics.reports.v2.source_api.get_all_sources(
                start="20240101", end="20240101"
            )
        except Exception as exc:
            logger.error(f"Failed to list reports: {exc}")
            raise exc

    test_fn = {"GetReports": custom_test_list_reports}

    test_connection_steps(
        metadata=metadata,
        test_fn=test_fn,
        service_type=service_connection.type.value,
        automation_workflow=automation_workflow,
    )
