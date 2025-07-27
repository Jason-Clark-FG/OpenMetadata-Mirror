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
Test Hex imports and basic functionality
"""

from unittest import TestCase

from metadata.generated.schema.entity.services.connections.dashboard.hexConnection import (
    HexConnection,
    HexType,
)
from metadata.ingestion.source.dashboard.hex.client import HexApiClient
from metadata.ingestion.source.dashboard.hex.metadata import HexSource
from metadata.ingestion.source.dashboard.hex.models import Project


class HexImportTest(TestCase):
    """Test that all Hex modules can be imported"""

    def test_imports(self):
        """Test all imports work"""
        # This test passes if no import errors occur
        self.assertIsNotNone(HexConnection)
        self.assertIsNotNone(HexType)
        self.assertIsNotNone(HexApiClient)
        self.assertIsNotNone(HexSource)
        self.assertIsNotNone(Project)

    def test_connection_model(self):
        """Test HexConnection model creation"""
        connection = HexConnection(
            type=HexType.Hex,
            hostPort="https://app.hex.tech",
            token="test_token",
            tokenType="personal",
            includeCategories=True,
        )

        self.assertEqual(connection.type, HexType.Hex)
        self.assertEqual(str(connection.hostPort), "https://app.hex.tech/")
        self.assertEqual(connection.token.get_secret_value(), "test_token")
        self.assertEqual(connection.tokenType.value, "personal")
        self.assertTrue(connection.includeCategories)

    def test_project_model(self):
        """Test Project model creation"""
        project_data = {
            "id": "test-123",
            "title": "Test Project",
            "description": "Test Description",
            "type": "PROJECT",
            "creator": {"email": "test@example.com"},
            "owner": {"email": "owner@example.com"},
            "status": {"name": "Published"},
            "categories": ["test", "demo"],
            "created_at": "2024-01-01T00:00:00Z",
        }

        project = Project.model_validate(project_data)

        self.assertEqual(project.id, "test-123")
        self.assertEqual(project.title, "Test Project")
        self.assertEqual(project.description, "Test Description")
        self.assertEqual(project.creator.email, "test@example.com")
        self.assertEqual(project.owner.email, "owner@example.com")
        self.assertEqual(len(project.categories), 2)
