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
Source connection handler for Snowplow
"""
from typing import Optional

from metadata.generated.schema.entity.automations.workflow import (
    Workflow as AutomationWorkflow,
)
from metadata.generated.schema.entity.services.connections.pipeline.snowplowConnection import (
    SnowplowConnection,
    SnowplowDeployment,
)
from metadata.ingestion.connections.test_connections import test_connection_steps
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.pipeline.snowplow.client import (
    SnowplowBDPClient,
    SnowplowCommunityClient,
)


def get_connection(connection: SnowplowConnection):
    """
    Create connection based on deployment type
    """
    if connection.deployment == SnowplowDeployment.BDP:
        return SnowplowBDPClient(
            console_url=str(connection.consoleUrl),
            api_key=connection.apiKey.get_secret_value(),
            organization_id=connection.organizationId,
        )
    else:
        return SnowplowCommunityClient(
            config_path=connection.configPath,
        )


def test_connection(
    metadata: OpenMetadata,
    client,
    service_connection: SnowplowConnection,
    automation_workflow: Optional[AutomationWorkflow] = None,
) -> None:
    """
    Test connection to Snowplow
    """
    test_fn = {
        "CheckAccess": client.test_connection,
        "GetPipelines": lambda: bool(list(client.get_pipelines())),
    }

    test_connection_steps(
        metadata=metadata,
        test_fn=test_fn,
        service_type=service_connection.type.value,
        automation_workflow=automation_workflow,
    )
