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
Hex connection
"""

from metadata.generated.schema.entity.services.connections.dashboard.hexConnection import (
    HexConnection,
)
from metadata.ingestion.connections.test_connections import test_connection_steps
from metadata.ingestion.source.dashboard.hex.client import HexApiClient
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


def get_connection(connection: HexConnection) -> HexApiClient:
    """
    Create connection
    """
    return HexApiClient(connection)


def test_connection(client: HexApiClient) -> None:
    """
    Test connection to Hex
    """
    test_fn = {"GetProjects": client.test_connection}

    test_connection_steps(
        test_fn=test_fn,
        service_type="Hex",
        logger=logger,
        timeout_seconds=None,
    )
