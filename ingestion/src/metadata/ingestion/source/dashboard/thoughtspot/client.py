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
ThoughtSpot REST API client
"""
from typing import Any, Dict, List, Optional

import requests
from requests import Session

from metadata.generated.schema.entity.services.connections.dashboard.thoughtSpotConnection import (
    ApiTokenAuthentication,
    BasicAuthentication,
    BearerTokenAuthentication,
    ThoughtSpotConnection,
)
from metadata.ingestion.source.dashboard.thoughtspot.models import (
    ThoughtSpotConnection as TSConnection,
)
from metadata.ingestion.source.dashboard.thoughtspot.models import (
    ThoughtSpotObjectType,
    ThoughtSpotSearchResponse,
    ThoughtSpotTMLObject,
)
from metadata.utils.helpers import clean_uri
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()

API_ENDPOINTS = {
    "v1": {
        "login": "/callosum/v1/session/login",
        "metadata_list": "/api/rest/2.0/metadata/list",
        "metadata_search": "/api/rest/2.0/metadata/search",
        "metadata_details": "/api/rest/2.0/metadata/details",
        "tml_export": "/api/rest/2.0/metadata/tml/export",
        "connection_search": "/api/rest/2.0/connection/search",
        "report_liveboard": "/api/rest/2.0/report/liveboard",
        "report_answer": "/api/rest/2.0/report/answer",
    },
    "v2": {
        "login": "/api/rest/2.0/auth/session/login",
        "metadata_list": "/api/rest/2.0/metadata/list",
        "metadata_search": "/api/rest/2.0/metadata/search",
        "metadata_details": "/api/rest/2.0/metadata/details",
        "tml_export": "/api/rest/2.0/metadata/tml/export",
        "connection_search": "/api/rest/2.0/connection/search",
        "report_liveboard": "/api/rest/2.0/report/liveboard",
        "report_answer": "/api/rest/2.0/report/answer",
    },
}


class ThoughtSpotClient:
    """
    ThoughtSpot REST API client
    """

    def __init__(self, config: ThoughtSpotConnection):
        self.config = config
        self.base_url = clean_uri(config.hostPort)
        self.api_version = config.apiVersion.value if config.apiVersion else "v2"
        self.endpoints = API_ENDPOINTS[self.api_version]
        self.session = Session()
        self._setup_session()
        self._authenticate()

    def _setup_session(self) -> None:
        """Setup session headers"""
        self.session.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "OpenMetadata/1.0",  # Required for ThoughtSpot API v2
            }
        )

        # Add org ID header if provided (for multi-tenant instances)
        if self.config.orgId:
            self.session.headers["X-TS-Org-Id"] = self.config.orgId

    def _authenticate(self) -> None:
        """Authenticate with ThoughtSpot"""
        auth_config = self.config.authentication

        if isinstance(auth_config, BasicAuthentication):
            self._basic_auth(auth_config.username, auth_config.password)
        elif isinstance(auth_config, ApiTokenAuthentication):
            self._token_auth(auth_config.apiToken)
        elif isinstance(auth_config, BearerTokenAuthentication):
            self._bearer_token_auth(auth_config.bearerToken)
        else:
            raise ValueError(f"Unsupported authentication type: {type(auth_config)}")

    def _basic_auth(self, username: str, password) -> None:
        """Authenticate using username and password"""
        login_url = f"{self.base_url}{self.endpoints['login']}"
        # Extract the actual password value from SecretStr
        password_value = (
            password.get_secret_value()
            if hasattr(password, "get_secret_value")
            else password
        )
        payload = {
            "username": username,
            "password": password_value,
            "remember_me": True,
        }

        response = self.session.post(login_url, json=payload)
        if response.status_code != 200:
            raise Exception(f"Failed to authenticate: {response.text}")

        logger.info("Successfully authenticated with ThoughtSpot")

    def _token_auth(self, api_token) -> None:
        """Authenticate using API token"""
        # Extract the actual token value from SecretStr
        token_value = (
            api_token.get_secret_value()
            if hasattr(api_token, "get_secret_value")
            else api_token
        )
        self.session.headers["Authorization"] = f"Bearer {token_value}"
        logger.info("Configured API token authentication")

    def _bearer_token_auth(self, bearer_token) -> None:
        """Authenticate using bearer token"""
        # Extract the actual token value from SecretStr
        token_value = (
            bearer_token.get_secret_value()
            if hasattr(bearer_token, "get_secret_value")
            else bearer_token
        )
        self.session.headers["Authorization"] = f"Bearer {token_value}"
        logger.info("Configured bearer token authentication")

    def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
    ) -> requests.Response:
        """Make API request"""
        url = f"{self.base_url}{endpoint}"

        response = self.session.request(
            method=method,
            url=url,
            params=params,
            json=json_data,
        )

        if response.status_code >= 400:
            logger.error(
                f"API request failed: {response.status_code} - {response.text}"
            )
            response.raise_for_status()

        return response

    def search_metadata(
        self,
        object_type: ThoughtSpotObjectType,
        include_hidden: bool = False,
        include_deprecated: bool = False,
        sort: str = "MODIFIED",
        sort_order: str = "DESC",
        offset: int = 0,
        batch_size: int = 100,
        include_visualization_headers: bool = False,
    ) -> ThoughtSpotSearchResponse:
        """Search for metadata objects"""
        payload = {
            "metadata": [
                {
                    "type": "LOGICAL_TABLE"
                    if object_type == ThoughtSpotObjectType.WORKSHEET
                    else object_type.value
                }
            ],
            "include_hidden": include_hidden,
            "include_deprecated": include_deprecated,
            "record_offset": offset,
            "record_size": batch_size,
            "sort_options": {"field_name": sort, "order": sort_order},
        }

        # Add visualization headers for liveboards
        if (
            include_visualization_headers
            and object_type == ThoughtSpotObjectType.LIVEBOARD
        ):
            payload["include_visualization_headers"] = True

        response = self._request(
            "POST", self.endpoints["metadata_search"], json_data=payload
        )

        # The API returns a list directly
        data = response.json()

        if isinstance(data, list):
            return ThoughtSpotSearchResponse(headers=data)
        else:
            return ThoughtSpotSearchResponse(**data)

    def get_metadata_details(
        self, object_id: str, object_type: ThoughtSpotObjectType
    ) -> Dict[str, Any]:
        """Get detailed metadata for an object"""
        payload = {"metadata": [{"identifier": object_id, "type": object_type.value}]}

        response = self._request(
            "POST", self.endpoints["metadata_details"], json_data=payload
        )

        data = response.json()
        if data and len(data) > 0:
            return data[0]
        return {}

    def export_tml(
        self, object_ids: List[str], export_associated: bool = True
    ) -> List[ThoughtSpotTMLObject]:
        """Export objects in TML format"""
        payload = {
            "metadata": [{"identifier": obj_id} for obj_id in object_ids],
            "export_associated": export_associated,
            "export_fqn": True,
        }

        response = self._request(
            "POST", self.endpoints["tml_export"], json_data=payload
        )

        objects = []
        for obj in response.json():
            if obj.get("info", {}).get("status", {}).get("status_code") == "OK":
                objects.append(ThoughtSpotTMLObject(**obj["info"]))

        return objects

    def get_liveboard_data(
        self, liveboard_id: str, visualization_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get liveboard data including visualizations"""
        try:
            # Use the REST API endpoint for liveboard data
            payload = {
                "metadata_identifier": liveboard_id,
                "file_format": "JSON",  # Request JSON format for data
            }

            if visualization_ids:
                payload["visualization_identifiers"] = visualization_ids

            response = self._request(
                "POST", self.endpoints["report_liveboard"], json_data=payload
            )

            return response.json()
        except Exception as e:
            return {}

    def get_answer_data(self, answer_id: str) -> Dict[str, Any]:
        """Get answer data"""
        try:
            # Use the REST API endpoint for answer data
            payload = {
                "metadata_identifier": answer_id,
                "file_format": "JSON",  # Request JSON format for data
            }

            response = self._request(
                "POST", self.endpoints["report_answer"], json_data=payload
            )

            return response.json()
        except Exception as e:
            return {}

    def list_connections(self) -> List[TSConnection]:
        """List all connections/data sources"""
        payload = {"record_size": 1000, "record_offset": 0}

        response = self._request(
            "POST", self.endpoints["connection_search"], json_data=payload
        )

        connections = []
        for conn in response.json():
            connections.append(TSConnection(**conn))

        return connections

    def test_authentication(self) -> None:
        """Test authentication by making a simple API call"""
        try:
            # Try to search for one liveboard to test auth
            self.search_metadata(
                object_type=ThoughtSpotObjectType.LIVEBOARD, batch_size=1
            )
        except Exception as e:
            logger.error(f"Authentication test failed: {e}")
            raise

    def test_list_liveboards(self) -> None:
        """Test listing liveboards"""
        try:
            response = self.search_metadata(
                object_type=ThoughtSpotObjectType.LIVEBOARD, batch_size=5
            )
            logger.info(
                f"Found {response.total_count or len(response.headers)} liveboards"
            )
        except Exception as e:
            logger.error(f"Failed to list liveboards: {e}")
            raise

    def test_list_worksheets(self) -> None:
        """Test listing worksheets"""
        try:
            response = self.search_metadata(
                object_type=ThoughtSpotObjectType.WORKSHEET, batch_size=5
            )
            logger.info(
                f"Found {response.total_count or len(response.headers)} worksheets"
            )
        except Exception as e:
            logger.error(f"Failed to list worksheets: {e}")
            raise
