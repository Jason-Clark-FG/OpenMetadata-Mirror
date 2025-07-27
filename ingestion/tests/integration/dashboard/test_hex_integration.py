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
Integration test for Hex Dashboard connector
This test requires a running OpenMetadata instance
"""

import os
from unittest import TestCase, skipIf
from unittest.mock import Mock, patch

from metadata.generated.schema.entity.services.dashboardService import (
    DashboardService,
    DashboardServiceType,
)
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.dashboard.hex.metadata import HexSource


@skipIf(
    os.getenv("SKIP_INTEGRATION_TESTS", "true").lower() == "true",
    "Skipping integration tests",
)
class HexIntegrationTest(TestCase):
    """Integration test for Hex connector"""

    service_name = "test_hex_integration"

    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        cls.metadata = OpenMetadata(
            OpenMetadata.create_server_config_obj(
                {
                    "hostPort": os.getenv("OM_HOST", "http://localhost:8585/api"),
                    "authProvider": "openmetadata",
                    "securityConfig": {
                        "jwtToken": os.getenv("OM_JWT_TOKEN", "test_token")
                    },
                }
            )
        )

    def setUp(self):
        """Set up for each test"""
        # Clean up any existing service
        try:
            service = self.metadata.get_by_name(
                entity=DashboardService, fqn=self.service_name
            )
            if service:
                self.metadata.delete(
                    entity=DashboardService, entity_id=service.id, hard_delete=True
                )
        except Exception:
            pass

    def tearDown(self):
        """Clean up after each test"""
        try:
            service = self.metadata.get_by_name(
                entity=DashboardService, fqn=self.service_name
            )
            if service:
                self.metadata.delete(
                    entity=DashboardService, entity_id=service.id, hard_delete=True
                )
        except Exception:
            pass

    @patch("metadata.ingestion.source.dashboard.hex.client.HexApiClient")
    def test_hex_ingestion_workflow(self, mock_client_class):
        """Test the complete Hex ingestion workflow"""

        # Mock Hex API responses
        mock_projects = [
            {
                "id": "test-project-1",
                "title": "Test Dashboard 1",
                "description": "Test description",
                "type": "PROJECT",
                "creator": {"email": "test@example.com"},
                "owner": {"email": "owner@example.com"},
                "status": {"name": "Published"},
                "categories": ["Test", "Integration"],
                "created_at": "2024-01-01T00:00:00Z",
                "last_edited_at": "2024-01-02T00:00:00Z",
                "analytics": {"view_count": 100},
            }
        ]

        mock_client = Mock()
        mock_client.get_projects.return_value = [
            HexSource.Project.model_validate(p) for p in mock_projects
        ]
        mock_client.get_project_url.return_value = (
            "https://app.hex.tech/app/projects/test-project-1"
        )
        mock_client.test_connection.return_value = True
        mock_client_class.return_value = mock_client

        config = {
            "source": {
                "type": "hex",
                "serviceName": self.service_name,
                "serviceConnection": {
                    "config": {
                        "type": "Hex",
                        "hostPort": "https://app.hex.tech",
                        "token": "test_token",
                        "tokenType": "personal",
                        "includeCategories": True,
                    }
                },
                "sourceConfig": {
                    "config": {
                        "dashboardFilterPattern": {},
                        "chartFilterPattern": {},
                    }
                },
            }
        }

        # Create the source
        hex_source = HexSource.create(
            config["source"],
            self.metadata,
        )

        # Test service creation
        service_entity = None
        for either_service in hex_source.yield_create_request_dashboard_service(
            hex_source.config
        ):
            if either_service.right:
                service_entity = self.metadata.create_or_update(either_service.right)
                break

        self.assertIsNotNone(service_entity)
        self.assertEqual(service_entity.name.root, self.service_name)
        self.assertEqual(service_entity.serviceType, DashboardServiceType.Hex)

        # Set up context
        hex_source.context.get().__dict__[
            "dashboard_service"
        ] = service_entity.fullyQualifiedName.root

        # Test dashboard ingestion
        hex_source.prepare()

        dashboards_created = 0
        charts_created = 0

        for project in hex_source.get_dashboards_list():
            project_details = hex_source.get_dashboard_details(project)

            # Yield charts
            for either_chart in hex_source.yield_dashboard_chart(project_details):
                if either_chart.right:
                    chart = self.metadata.create_or_update(either_chart.right)
                    charts_created += 1
                    hex_source.context.get().__dict__.setdefault("charts", []).append(
                        chart.name.root
                    )

            # Yield dashboard
            for either_dashboard in hex_source.yield_dashboard(project_details):
                if either_dashboard.right:
                    dashboard = self.metadata.create_or_update(either_dashboard.right)
                    dashboards_created += 1

                    # Verify dashboard properties
                    self.assertEqual(dashboard.name.root, "test-project-1")
                    self.assertEqual(dashboard.displayName, "Test Dashboard 1")
                    self.assertEqual(dashboard.description.root, "Test description")
                    self.assertIsNotNone(dashboard.sourceUrl)

        self.assertEqual(dashboards_created, 1)
        self.assertEqual(charts_created, 1)

        # Test tags creation
        tags_created = 0
        for either_tag in hex_source.yield_bulk_tags():
            if either_tag.right:
                self.metadata.create_or_update_tag(either_tag.right)
                tags_created += 1

        # Should create classification and 2 tags
        self.assertGreater(tags_created, 0)
