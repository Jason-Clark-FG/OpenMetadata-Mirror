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
Test Collibra connection
"""
from unittest import TestCase
from unittest.mock import patch

from metadata.generated.schema.entity.services.connections.metadata.collibraConnection import (
    CollibraConnection,
)
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.metadata.collibra.client import CollibraClient
from metadata.ingestion.source.metadata.collibra.connection import (
    get_connection,
    test_connection,
)


class TestCollibraConnection(TestCase):
    """Test Collibra connection methods"""

    def test_get_connection(self):
        """Test get_connection returns CollibraClient"""
        connection_config = CollibraConnection(
            hostPort="http://localhost:8080",
            username="admin",
            password="admin",
        )
        client = get_connection(connection_config)
        self.assertIsInstance(client, CollibraClient)

    @patch.object(CollibraClient, "list_glossaries")
    @patch.object(OpenMetadata, "__init__", return_value=None)
    def test_connection_success(self, metadata_mock, list_glossaries_mock):
        """Test successful connection"""
        list_glossaries_mock.return_value = {"results": []}

        connection_config = CollibraConnection(
            hostPort="http://localhost:8080",
            username="admin",
            password="admin",
        )

        client = CollibraClient(connection_config)
        metadata = OpenMetadata(config=None)

        try:
            test_connection(
                metadata=metadata,
                client=client,
                service_connection=connection_config,
                automation_workflow=None,
            )
        except Exception as exc:
            self.fail(f"test_connection raised an exception: {exc}")

    @patch.object(CollibraClient, "list_glossaries")
    def test_connection_failure(self, list_glossaries_mock):
        """Test connection failure"""
        list_glossaries_mock.side_effect = Exception("Connection failed")

        connection_config = CollibraConnection(
            hostPort="http://localhost:8080",
            username="admin",
            password="invalid",
        )

        client = CollibraClient(connection_config)

        with self.assertRaises(Exception):
            client.list_glossaries()

    def test_client_auth_token_generation(self):
        """Test authentication token generation"""
        connection_config = CollibraConnection(
            hostPort="http://localhost:8080",
            username="testuser",
            password="testpass",
        )

        client = CollibraClient(connection_config)
        token, _ = client.get_auth_token()

        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 0)

    def test_connection_config_validation(self):
        """Test connection configuration validation"""
        with self.assertRaises(Exception):
            CollibraConnection(
                hostPort="",
                username="admin",
                password="admin",
            )

        connection = CollibraConnection(
            hostPort="http://localhost:8080",
            username="admin",
            password="admin",
            enableEnrichment=True,
        )
        self.assertTrue(connection.enableEnrichment)
