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
Test HubSpot Connection
"""
from unittest.mock import Mock, patch

from metadata.generated.schema.entity.services.connections.dashboard.hubspotConnection import (
    HubspotConnection,
)
from metadata.ingestion.source.dashboard.hubspot.connection import (
    get_connection,
    test_connection,
)


@patch("metadata.ingestion.source.dashboard.hubspot.connection.HubSpot")
def test_get_connection(mock_hubspot):
    """
    Test get_connection method
    """
    mock_client = Mock()
    mock_hubspot.return_value = mock_client

    connection = HubspotConnection(accessToken="test-token")

    result = get_connection(connection)

    assert result == mock_client
    mock_hubspot.assert_called_once_with(access_token="test-token")


@patch("metadata.ingestion.source.dashboard.hubspot.connection.test_connection_steps")
@patch("metadata.ingestion.source.dashboard.hubspot.connection.HubSpot")
def test_test_connection(mock_hubspot, mock_test_connection_steps):
    """
    Test test_connection method
    """
    mock_client = Mock()
    mock_metadata = Mock()

    connection = HubspotConnection(accessToken="test-token")

    test_connection(
        metadata=mock_metadata,
        client=mock_client,
        service_connection=connection,
        automation_workflow=None,
    )

    # Verify test_connection_steps was called
    mock_test_connection_steps.assert_called_once()
    call_args = mock_test_connection_steps.call_args

    # Verify the test function is present
    assert "GetReports" in call_args.kwargs["test_fn"]

    # Test the custom test function
    test_fn = call_args.kwargs["test_fn"]["GetReports"]

    # Mock the API call
    mock_client.analytics.reports.v2.source_api.get_all_sources.return_value = {
        "sources": []
    }

    # Should not raise an exception
    test_fn()
