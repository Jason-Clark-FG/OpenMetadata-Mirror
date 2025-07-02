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
ThoughtSpot connection handler
"""
from typing import Optional

from metadata.generated.schema.entity.automations.workflow import (
    Workflow as AutomationWorkflow,
)
from metadata.generated.schema.entity.services.connections.dashboard.thoughtSpotConnection import (
    ThoughtSpotConnection,
)
from metadata.ingestion.connections.test_connections import test_connection_steps
from metadata.ingestion.source.dashboard.thoughtspot.client import ThoughtSpotClient
from metadata.utils.constants import THREE_MIN
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


def get_connection(connection: ThoughtSpotConnection) -> ThoughtSpotClient:
    """
    Create connection to ThoughtSpot
    """
    return ThoughtSpotClient(connection)


def test_connection(
    metadata: Optional[AutomationWorkflow],
    client: Optional[ThoughtSpotClient] = None,
    service_connection: Optional[ThoughtSpotConnection] = None,
    automation_workflow: Optional[AutomationWorkflow] = None,
) -> None:
    """
    Test connection to ThoughtSpot instance
    """
    # Handle the case where test_connection_common calls with just metadata
    # In this case, we need to raise TypeError to trigger the retry with all params
    if client is None and service_connection is None:
        raise TypeError("test_connection() missing required arguments")

    # Use the client if provided, otherwise create one from service_connection
    if client and isinstance(client, ThoughtSpotClient):
        connection = client
    elif service_connection:
        connection = get_connection(service_connection)
    else:
        raise ValueError("Either client or service_connection must be provided")

    test_fn = {
        "GetAuthentication": connection.test_authentication,
        "GetLiveboards": connection.test_list_liveboards,
        "GetWorksheets": connection.test_list_worksheets,
    }

    return test_connection_steps(
        metadata=metadata,
        test_fn=test_fn,
        service_type=service_connection.type.value,
        automation_workflow=automation_workflow,
        timeout_seconds=THREE_MIN,
    )
