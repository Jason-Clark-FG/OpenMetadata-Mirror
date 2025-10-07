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
Client to interact with Collibra REST APIs
"""
import base64
from typing import Any, Dict, List, Optional

from metadata.generated.schema.entity.services.connections.metadata.collibraConnection import (
    CollibraConnection,
)
from metadata.ingestion.ometa.client import REST, ClientConfig
from metadata.utils.helpers import clean_uri
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class CollibraClient:
    """
    Client to interact with Collibra REST API v2.0
    """

    def __init__(self, config: CollibraConnection):
        self.config = config
        self.auth_token = self._generate_http_basic_token(
            config.username, config.password.get_secret_value()
        )
        client_config: ClientConfig = ClientConfig(
            base_url=clean_uri(config.hostPort),
            auth_header="Authorization",
            api_version="rest/2.0",
            auth_token=self.get_auth_token,
            auth_token_mode="Basic",
        )
        self.client = REST(client_config)

    def get_auth_token(self):
        """Return authentication token"""
        return self.auth_token, 0

    @staticmethod
    def _generate_http_basic_token(username: str, password: str) -> str:
        """
        Generates a HTTP basic token from username and password
        """
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode(
            "utf-8"
        )
        return token

    def list_glossaries(
        self, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List all glossaries from Collibra
        """
        try:
            response = self.client.get(f"/glossaries?offset={offset}&limit={limit}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch glossaries: {exc}")
            return None

    def get_glossary(self, glossary_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific glossary by ID
        """
        try:
            response = self.client.get(f"/glossaries/{glossary_id}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch glossary {glossary_id}: {exc}")
            return None

    def list_glossary_terms(
        self, glossary_id: Optional[str] = None, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List glossary terms (Business Terms in Collibra)
        """
        try:
            params = f"offset={offset}&limit={limit}"
            if glossary_id:
                params += f"&glossaryId={glossary_id}"
            response = self.client.get(
                f"/assets?typeId=00000000-0000-0000-0000-000000031302&{params}"
            )
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch glossary terms: {exc}")
            return None

    def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific asset by ID
        """
        try:
            response = self.client.get(f"/assets/{asset_id}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch asset {asset_id}: {exc}")
            return None

    def get_asset_attributes(
        self, asset_id: str, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        Get attributes for a specific asset
        """
        try:
            response = self.client.get(
                f"/attributes?assetId={asset_id}&offset={offset}&limit={limit}"
            )
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch attributes for asset {asset_id}: {exc}")
            return None

    def list_communities(
        self, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List all communities from Collibra
        """
        try:
            response = self.client.get(f"/communities?offset={offset}&limit={limit}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch communities: {exc}")
            return None

    def list_domains(
        self, community_id: Optional[str] = None, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List domains from Collibra
        """
        try:
            params = f"offset={offset}&limit={limit}"
            if community_id:
                params += f"&communityId={community_id}"
            response = self.client.get(f"/domains?{params}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch domains: {exc}")
            return None

    def get_domain(self, domain_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific domain by ID
        """
        try:
            response = self.client.get(f"/domains/{domain_id}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch domain {domain_id}: {exc}")
            return None

    def list_responsibilities(
        self, asset_id: Optional[str] = None, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List responsibilities (ownership) for assets
        """
        try:
            params = f"offset={offset}&limit={limit}"
            if asset_id:
                params += f"&resourceId={asset_id}"
            response = self.client.get(f"/responsibilities?{params}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch responsibilities: {exc}")
            return None

    def list_tags(self, offset: int = 0, limit: int = 1000) -> Optional[Dict[str, Any]]:
        """
        List tags from Collibra
        """
        try:
            response = self.client.get(f"/tags?offset={offset}&limit={limit}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch tags: {exc}")
            return None

    def get_asset_tags(
        self, asset_id: str, offset: int = 0, limit: int = 1000
    ) -> Optional[List[str]]:
        """
        Get tags assigned to a specific asset
        """
        try:
            response = self.client.get(
                f"/tags?resourceId={asset_id}&offset={offset}&limit={limit}"
            )
            if response and "results" in response:
                return [
                    tag.get("name") for tag in response["results"] if tag.get("name")
                ]
            return []
        except Exception as exc:
            logger.warning(f"Failed to fetch tags for asset {asset_id}: {exc}")
            return []

    def list_users(
        self, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        List users from Collibra
        """
        try:
            response = self.client.get(f"/users?offset={offset}&limit={limit}")
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch users: {exc}")
            return None

    def get_relations(
        self, asset_id: str, offset: int = 0, limit: int = 1000
    ) -> Optional[Dict[str, Any]]:
        """
        Get relations for a specific asset
        """
        try:
            response = self.client.get(
                f"/relations?sourceId={asset_id}&offset={offset}&limit={limit}"
            )
            return response
        except Exception as exc:
            logger.warning(f"Failed to fetch relations for asset {asset_id}: {exc}")
            return None
