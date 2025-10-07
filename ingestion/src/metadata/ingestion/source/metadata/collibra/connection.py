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
Source connection handler for Collibra
"""
from metadata.generated.schema.entity.automations.workflow import (
    Workflow as AutomationWorkflow,
)
from metadata.generated.schema.entity.services.connections.metadata.collibraConnection import (
    CollibraConnection,
)
from metadata.ingestion.connections.test_connections import test_connection_steps
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.metadata.collibra.client import CollibraClient


def get_connection(connection: CollibraConnection) -> CollibraClient:
    """
    Create Collibra client connection
    """
    return CollibraClient(connection)


def test_connection(
    metadata: OpenMetadata,
    client: CollibraClient,
    service_connection: CollibraConnection,
    automation_workflow: AutomationWorkflow = None,
) -> None:
    """
    Test Collibra connection
    """

    def custom_test_connection():
        client.list_glossaries(limit=1)

    test_fn = {"GetGlossaries": custom_test_connection}

    test_connection_steps(
        metadata=metadata,
        test_fn=test_fn,
        service_type=service_connection.type.value,
        automation_workflow=automation_workflow,
    )
