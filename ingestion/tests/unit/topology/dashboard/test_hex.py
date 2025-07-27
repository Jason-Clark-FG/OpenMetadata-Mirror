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
Test Hex Dashboard using the topology
"""

import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

from metadata.generated.schema.entity.services.dashboardService import (
    DashboardConnection,
    DashboardService,
    DashboardServiceType,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    OpenMetadataWorkflowConfig,
)
from metadata.generated.schema.type.basic import FullyQualifiedEntityName
from metadata.generated.schema.type.entityReferenceList import EntityReferenceList
from metadata.ingestion.api.models import Either
from metadata.ingestion.source.dashboard.hex.metadata import HexSource
from metadata.ingestion.source.dashboard.hex.models import Project

mock_file_path = (
    Path(__file__).parent.parent.parent / "resources/datasets/hex_dataset.json"
)
with open(mock_file_path, encoding="UTF-8") as file:
    mock_data: dict = json.load(file)

MOCK_DASHBOARD_SERVICE = DashboardService(
    id="c3eb265f-5445-4ad3-ba5e-797d3a3071bb",
    fullyQualifiedName=FullyQualifiedEntityName("hex_test_service"),
    name="hex_test_service",
    connection=DashboardConnection(),
    serviceType=DashboardServiceType.Hex,
)

mock_hex_config = {
    "source": {
        "type": "hex",
        "serviceName": "hex_test",
        "serviceConnection": {
            "config": {
                "type": "Hex",
                "hostPort": "https://app.hex.tech",
                "token": "test_token_123",
                "tokenType": "personal",
                "includeCategories": True,
            }
        },
        "sourceConfig": {
            "config": {"dashboardFilterPattern": {}, "chartFilterPattern": {}}
        },
    },
    "sink": {"type": "metadata-rest", "config": {}},
    "workflowConfig": {
        "openMetadataServerConfig": {
            "hostPort": "http://localhost:8585/api",
            "authProvider": "openmetadata",
            "securityConfig": {
                "jwtToken": "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJ0eXAiOiJKV1QiLCJhbGc"
                "iOiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlzQm90IjpmYWxzZSwiaXNzIjoib3Blbi1tZXRhZGF0YS5vcmciLCJpYXQiOjE"
                "2NjM5Mzg0NjIsImVtYWlsIjoiYWRtaW5Ab3Blbm1ldGFkYXRhLm9yZyJ9.tS8um_5DKu7HgzGBzS1VTA5uUjKWOCU0B_j08WXB"
                "iEC0mr0zNREkqVfwFDD-d24HlNEbrqioLsBuFRiwIWKc1m_ZlVQbG7P36RUxhuv2vbSp80FKyNM-Tj93FDzq91jsyNmsQhyNv_fN"
                "r3TXfzzSPjHt8Go0FMMP66weoKMgW2PbXlhVKwEuXUHyakLLzewm9UMeQaEiRzhiTMU3UkLXcKbYEJJvfNFcLwSl9W8JCO_l0Yj3u"
                "d-qt_nQYEZwqW6u5nfdQllN133iikV4fM5QZsMCnm8Rq1mvLR0y9bmJiD7fwM1tmJ791TUWqmKaTnP49U493VanKpUAfzIiOiIbhg"
            },
        }
    },
}

# Convert mock data to Project objects
MOCK_PROJECTS = [Project.model_validate(proj) for proj in mock_data["projects"]]


class HexDashboardUnitTest(TestCase):
    """
    Implements the necessary methods to extract
    Hex Dashboard Unit Test
    """

    @patch(
        "metadata.ingestion.source.dashboard.dashboard_service.DashboardServiceSource.test_connection"
    )
    @patch("metadata.ingestion.source.dashboard.hex.client.HexApiClient")
    def __init__(self, methodName, hex_client, test_connection) -> None:
        super().__init__(methodName)
        test_connection.return_value = False

        # Mock client methods
        mock_client = Mock()
        mock_client.get_projects.return_value = MOCK_PROJECTS
        mock_client.get_project_url = (
            lambda project: f"https://app.hex.tech/app/projects/{project.id}"
        )
        hex_client.return_value = mock_client

        self.config = OpenMetadataWorkflowConfig.model_validate(mock_hex_config)

        # Mock metadata client
        mock_metadata = Mock()
        mock_metadata.get_reference_by_email.return_value = EntityReferenceList(root=[])

        self.hex_source = HexSource.create(
            mock_hex_config["source"],
            mock_metadata,
        )
        self.hex_source.context.get().__dict__[
            "dashboard_service"
        ] = MOCK_DASHBOARD_SERVICE.fullyQualifiedName.root

    def test_dashboard_list(self):
        """Test getting dashboard list"""
        self.hex_source.prepare()
        dashboards = self.hex_source.get_dashboards_list()
        self.assertEqual(len(dashboards), 3)
        self.assertEqual(dashboards[0].title, "Sales Dashboard Q4")

    def test_dashboard_name(self):
        """Test dashboard name extraction"""
        dashboard_name = self.hex_source.get_dashboard_name(MOCK_PROJECTS[0])
        self.assertEqual(dashboard_name, "Sales Dashboard Q4")

    def test_yield_dashboard(self):
        """Test dashboard creation"""
        dashboard_list = []
        results = self.hex_source.yield_dashboard(MOCK_PROJECTS[0])
        for result in results:
            if isinstance(result, Either) and result.right:
                dashboard_list.append(result.right)

        self.assertEqual(len(dashboard_list), 1)
        dashboard = dashboard_list[0]

        # Verify dashboard properties
        self.assertEqual(dashboard.name.root, "project-123-456")
        self.assertEqual(dashboard.displayName, "Sales Dashboard Q4")
        self.assertEqual(
            dashboard.description.root, "Quarterly sales metrics and KPIs for Q4 2024"
        )
        self.assertEqual(
            dashboard.sourceUrl.root,
            "https://app.hex.tech/app/projects/project-123-456",
        )
        self.assertEqual(dashboard.service.root, "hex_test_service")

    def test_yield_dashboard_without_description(self):
        """Test dashboard creation without description"""
        dashboard_list = []
        results = self.hex_source.yield_dashboard(MOCK_PROJECTS[2])
        for result in results:
            if isinstance(result, Either) and result.right:
                dashboard_list.append(result.right)

        self.assertEqual(len(dashboard_list), 1)
        dashboard = dashboard_list[0]
        self.assertIsNone(dashboard.description)

    def test_yield_chart(self):
        """Test chart creation"""
        chart_list = []
        results = self.hex_source.yield_dashboard_chart(MOCK_PROJECTS[0])
        for result in results:
            if isinstance(result, Either) and result.right:
                chart_list.append(result.right)

        self.assertEqual(len(chart_list), 1)
        chart = chart_list[0]

        # Verify chart properties
        self.assertEqual(chart.name.root, "project-123-456_chart")
        self.assertEqual(chart.displayName, "Sales Dashboard Q4")
        self.assertEqual(chart.chartType.value, "Other")
        self.assertEqual(
            chart.sourceUrl.root, "https://app.hex.tech/app/projects/project-123-456"
        )

    def test_owner_extraction(self):
        """Test owner reference extraction"""
        # Mock metadata client to return owner reference
        mock_owner_ref = EntityReferenceList(root=[])
        self.hex_source.metadata.get_reference_by_email = Mock(
            return_value=mock_owner_ref
        )

        owner_ref = self.hex_source.get_owner_ref(MOCK_PROJECTS[0])
        self.assertEqual(owner_ref, mock_owner_ref)
        self.hex_source.metadata.get_reference_by_email.assert_called_with(
            "john.smith@example.com"
        )

    def test_owner_fallback_to_creator(self):
        """Test owner falls back to creator when owner is not available"""
        # Project without owner but with creator
        project_with_creator_only = MOCK_PROJECTS[2]

        mock_owner_ref = EntityReferenceList(root=[])
        self.hex_source.metadata.get_reference_by_email = Mock(
            return_value=mock_owner_ref
        )

        owner_ref = self.hex_source.get_owner_ref(project_with_creator_only)
        self.assertEqual(owner_ref, mock_owner_ref)
        self.hex_source.metadata.get_reference_by_email.assert_called_with(
            "bob.wilson@example.com"
        )

    def test_categories_extraction(self):
        """Test categories are collected for tag creation"""
        self.hex_source.service_connection.includeCategories = True
        self.hex_source.prepare()

        expected_categories = [
            "Sales",
            "Finance",
            "Q4-2024",
            "Analytics",
            "Customer Success",
        ]
        for category in expected_categories:
            self.assertIn(category, self.hex_source.categories)

    def test_api_client_pagination(self):
        """Test API client handles pagination correctly"""
        from metadata.ingestion.source.dashboard.hex.client import HexApiClient

        # Mock REST client
        with patch("metadata.ingestion.source.dashboard.hex.client.REST") as mock_rest:
            # First page response
            first_page = {"projects": mock_data["projects"][:2], "next_page": "2"}
            # Second page response
            second_page = {"projects": mock_data["projects"][2:], "next_page": None}

            mock_rest_instance = Mock()
            mock_rest_instance.get.side_effect = [first_page, second_page]
            mock_rest.return_value = mock_rest_instance

            client = HexApiClient(self.hex_source.service_connection)
            projects = client.get_projects()

            self.assertEqual(len(projects), 3)
            self.assertEqual(mock_rest_instance.get.call_count, 2)

    def test_connection_test(self):
        """Test connection testing functionality"""
        from metadata.ingestion.source.dashboard.hex.client import HexApiClient

        with patch("metadata.ingestion.source.dashboard.hex.client.REST") as mock_rest:
            mock_rest_instance = Mock()
            mock_rest_instance.get.return_value = {"projects": []}
            mock_rest.return_value = mock_rest_instance

            client = HexApiClient(self.hex_source.service_connection)
            result = client.test_connection()

            self.assertTrue(result)
            mock_rest_instance.get.assert_called_with("/projects?limit=1")
