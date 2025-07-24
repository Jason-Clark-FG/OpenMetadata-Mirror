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
Test HubSpot Dashboard Metadata Source
"""
from unittest import TestCase
from unittest.mock import Mock, patch

from metadata.generated.schema.entity.services.connections.dashboard.hubspotConnection import (
    HubspotConnection,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    OpenMetadataWorkflowConfig,
    Source,
    SourceConfig,
)
from metadata.generated.schema.type.basic import ComponentConfig
from metadata.ingestion.source.dashboard.hubspot.metadata import HubspotSource
from metadata.ingestion.source.dashboard.hubspot.models import HubSpotDashboard


class TestHubspotSource(TestCase):
    """
    Test HubSpot Dashboard Source
    """

    @patch("metadata.ingestion.source.dashboard.hubspot.metadata.HubSpot")
    def setUp(self, mock_hubspot):
        """Set up test fixtures"""
        self.mock_hubspot_client = Mock()
        mock_hubspot.return_value = self.mock_hubspot_client

        self.config = OpenMetadataWorkflowConfig(
            source=Source(
                type="hubspot",
                serviceName="test_hubspot",
                serviceConnection=SourceConfig(
                    config=HubspotConnection(
                        accessToken="test-token", hubId="test-hub-id"
                    )
                ),
                sourceConfig=ComponentConfig(),
            )
        )

        self.metadata = Mock()
        self.hubspot_source = HubspotSource.create(
            self.config.model_dump(), self.metadata, "test_pipeline"
        )

    def test_get_dashboards_list(self):
        """Test getting dashboards list"""
        dashboards = self.hubspot_source.get_dashboards_list()

        # Should return at least one default dashboard
        self.assertIsNotNone(dashboards)
        self.assertGreater(len(dashboards), 0)
        self.assertEqual(dashboards[0].id, "hubspot-analytics-dashboard")
        self.assertEqual(dashboards[0].name, "HubSpot Analytics Dashboard")

    def test_get_dashboard_name(self):
        """Test getting dashboard name"""
        dashboard = HubSpotDashboard(id="test-dashboard", name="Test Dashboard")

        name = self.hubspot_source.get_dashboard_name(dashboard)
        self.assertEqual(name, "Test Dashboard")

    def test_get_dashboard_details(self):
        """Test getting dashboard details"""
        dashboard = HubSpotDashboard(
            id="test-dashboard", name="Test Dashboard", description="Test Description"
        )

        details = self.hubspot_source.get_dashboard_details(dashboard)
        self.assertEqual(details, dashboard)

    def test_yield_dashboard(self):
        """Test yielding dashboard entities"""
        dashboard = HubSpotDashboard(
            id="test-dashboard", name="Test Dashboard", description="Test Description"
        )

        # Mock the context
        self.hubspot_source.context.get = Mock()
        self.hubspot_source.context.get().dashboard_service = "test_service"

        results = list(self.hubspot_source.yield_dashboard(dashboard))

        self.assertEqual(len(results), 1)
        self.assertTrue(results[0].right)

        dashboard_request = results[0].right
        self.assertEqual(dashboard_request.name.root, "test-dashboard")
        self.assertEqual(dashboard_request.displayName, "Test Dashboard")
        self.assertEqual(dashboard_request.description.root, "Test Description")

    def test_yield_dashboard_chart(self):
        """Test yielding chart entities"""
        dashboard = HubSpotDashboard(id="test-dashboard", name="Test Dashboard")

        # Mock the context
        self.hubspot_source.context.get = Mock()
        self.hubspot_source.context.get().dashboard_service = "test_service"

        results = list(self.hubspot_source.yield_dashboard_chart(dashboard))

        # Should create charts for different report types
        self.assertGreater(len(results), 0)

        for result in results:
            if result.right:
                chart_request = result.right
                self.assertIn("test-dashboard", chart_request.name.root)
                self.assertIsNotNone(chart_request.displayName)
                self.assertEqual(chart_request.chartType, "Line")

    def test_yield_datamodel(self):
        """Test yielding data model entities"""
        dashboard = HubSpotDashboard(id="test-dashboard", name="Test Dashboard")

        # Mock the context
        self.hubspot_source.context.get = Mock()
        self.hubspot_source.context.get().dashboard_service = "test_service"

        results = list(self.hubspot_source.yield_datamodel(dashboard))

        self.assertEqual(len(results), 1)
        self.assertTrue(results[0].right)

        datamodel_request = results[0].right
        self.assertEqual(datamodel_request.name.root, "test-dashboard-datamodel")
        self.assertEqual(datamodel_request.displayName, "Test Dashboard Data Model")
        self.assertEqual(datamodel_request.dataModelType, "HubSpotAnalytics")
