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
Client for interacting with Snowplow APIs and configuration
"""
import json
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import requests
from requests import HTTPError

from metadata.ingestion.source.pipeline.snowplow.models import (
    IgluSchema,
    SnowplowCollector,
    SnowplowDataModel,
    SnowplowEnrichment,
    SnowplowEventType,
    SnowplowFailedEvents,
    SnowplowLoader,
    SnowplowPipeline,
    SnowplowPipelineState,
)
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class SnowplowClient(ABC):
    """Abstract base class for Snowplow clients"""

    @abstractmethod
    def get_pipelines(self) -> List[SnowplowPipeline]:
        """Get all pipelines"""

    @abstractmethod
    def get_schemas(self) -> List[IgluSchema]:
        """Get all schemas from Iglu"""

    @abstractmethod
    def test_connection(self) -> bool:
        """Test connection to Snowplow"""

    def get_data_models(self) -> List[SnowplowDataModel]:
        """Get dbt data models"""
        return []

    def get_event_types(self) -> List[SnowplowEventType]:
        """Get event types"""
        return []

    def get_failed_events(self) -> List[SnowplowFailedEvents]:
        """Get failed events statistics"""
        return []


class SnowplowBDPClient(SnowplowClient):
    """Client for Snowplow BDP (Business Data Platform)"""

    def __init__(
        self,
        console_url: str,
        api_key: str,
        organization_id: str,
        timeout: int = 30,
    ):
        self.console_url = console_url.rstrip("/")
        self.api_key = api_key
        self.organization_id = organization_id
        self.timeout = timeout
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _make_request(self, endpoint: str, method: str = "GET") -> Dict:
        """Make API request to Snowplow Console"""
        url = f"{self.console_url}/api/msc/v1{endpoint}"
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except HTTPError as err:
            logger.error(f"HTTP error occurred: {err}")
            raise
        except Exception as err:
            logger.error(f"Error occurred: {err}")
            raise

    def get_pipelines(self) -> List[SnowplowPipeline]:
        """Get all pipelines from Snowplow BDP"""
        try:
            # This is a hypothetical endpoint - actual BDP API may differ
            pipelines_data = self._make_request(
                f"/organizations/{self.organization_id}/pipelines"
            )
            pipelines = []
            for pipeline_data in pipelines_data.get("pipelines", []):
                pipeline = SnowplowPipeline(
                    id=pipeline_data["id"],
                    name=pipeline_data["name"],
                    description=pipeline_data.get("description"),
                    state=SnowplowPipelineState(
                        pipeline_data.get("state", "UNKNOWN").upper()
                    ),
                    collectors=self._parse_collectors(
                        pipeline_data.get("collectors", [])
                    ),
                    enrichments=self._parse_enrichments(
                        pipeline_data.get("enrichments", [])
                    ),
                    loaders=self._parse_loaders(pipeline_data.get("loaders", [])),
                )
                pipelines.append(pipeline)
            return pipelines
        except Exception as err:
            logger.error(f"Failed to get pipelines: {err}")
            return []

    def get_schemas(self) -> List[IgluSchema]:
        """Get all schemas from Iglu Server"""
        try:
            # Fetch schemas from Iglu API
            schemas_data = self._make_request(
                f"/organizations/{self.organization_id}/schemas"
            )
            schemas = []
            for schema_data in schemas_data.get("schemas", []):
                schema = IgluSchema(
                    vendor=schema_data["vendor"],
                    name=schema_data["name"],
                    format=schema_data["format"],
                    version=schema_data["version"],
                    schema_content=schema_data.get("content", {}),
                    created_at=schema_data.get("created_at"),
                    updated_at=schema_data.get("updated_at"),
                    is_public=schema_data.get("is_public", True),
                )
                schemas.append(schema)
            return schemas
        except Exception as err:
            logger.error(f"Failed to get schemas: {err}")
            return []

    def test_connection(self) -> bool:
        """Test connection to Snowplow BDP"""
        try:
            self._make_request(f"/organizations/{self.organization_id}")
            return True
        except Exception:
            return False

    @staticmethod
    def _parse_collectors(collectors_data: List[Dict]) -> List[SnowplowCollector]:
        """Parse collector configurations"""
        collectors = []
        for collector_data in collectors_data:
            collector = SnowplowCollector(
                name=collector_data["name"],
                endpoint=collector_data["endpoint"],
                enabled=collector_data.get("enabled", True),
                parameters=collector_data.get("parameters", {}),
            )
            collectors.append(collector)
        return collectors

    @staticmethod
    def _parse_enrichments(enrichments_data: List[Dict]) -> List[SnowplowEnrichment]:
        """Parse enrichment configurations"""
        enrichments = []
        for enrichment_data in enrichments_data:
            # Try to determine enrichment type from name or parameters
            enrichment_type = enrichment_data.get("type")
            if not enrichment_type:
                # Infer from name
                name_lower = enrichment_data["name"].lower()
                if "ip" in name_lower:
                    enrichment_type = "ip_lookups"
                elif "ua" in name_lower or "user_agent" in name_lower:
                    enrichment_type = "ua_parser"
                elif "referer" in name_lower:
                    enrichment_type = "referer_parser"
                elif "campaign" in name_lower:
                    enrichment_type = "campaign_attribution"
                elif "weather" in name_lower:
                    enrichment_type = "weather"
                elif "sql" in name_lower:
                    enrichment_type = "sql_query"
                elif "api" in name_lower:
                    enrichment_type = "api_request"
                elif "javascript" in name_lower or "js" in name_lower:
                    enrichment_type = "javascript"

            enrichment = SnowplowEnrichment(
                name=enrichment_data["name"],
                enabled=enrichment_data.get("enabled", True),
                enrichment_type=enrichment_type,
                version=enrichment_data.get("version"),
                input_fields=enrichment_data.get("input_fields", []),
                output_fields=enrichment_data.get("output_fields", []),
                output_schema=enrichment_data.get("output_schema"),
                external_source=enrichment_data.get("external_source"),
                parameters=enrichment_data.get("parameters", {}),
            )
            enrichments.append(enrichment)
        return enrichments

    @staticmethod
    def _parse_loaders(loaders_data: List[Dict]) -> List[SnowplowLoader]:
        """Parse loader configurations"""
        loaders = []
        for loader_data in loaders_data:
            loader = SnowplowLoader(
                name=loader_data["name"],
                destination_type=loader_data["destination_type"],
                enabled=loader_data.get("enabled", True),
                parameters=loader_data.get("parameters", {}),
            )
            loaders.append(loader)
        return loaders


class SnowplowCommunityClient(SnowplowClient):
    """Client for Snowplow Community Edition"""

    def __init__(self, config_path: str, iglu_server_url: Optional[str] = None):
        self.config_path = config_path
        self.iglu_server_url = iglu_server_url

    def get_pipelines(self) -> List[SnowplowPipeline]:
        """Get pipelines from configuration files"""
        pipelines = []
        try:
            # Read pipeline configurations from local files
            config_files = self._find_config_files()
            for config_file in config_files:
                with open(config_file, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    pipeline = self._parse_pipeline_config(config)
                    if pipeline:
                        pipelines.append(pipeline)
        except Exception as err:
            logger.error(f"Failed to read pipeline configurations: {err}")
        return pipelines

    def get_schemas(self) -> List[IgluSchema]:
        """Get schemas from Iglu Server or local repository"""
        schemas = []
        if self.iglu_server_url:
            try:
                # Fetch from Iglu Server
                response = requests.get(
                    f"{self.iglu_server_url}/api/schemas/public",
                    timeout=30,
                )
                response.raise_for_status()
                schemas_data = response.json()
                for schema_data in schemas_data.get("schemas", []):
                    schema = IgluSchema(
                        vendor=schema_data["vendor"],
                        name=schema_data["name"],
                        format=schema_data["format"],
                        version=schema_data["version"],
                        schema_content=schema_data.get("content", {}),
                    )
                    schemas.append(schema)
            except Exception as err:
                logger.error(f"Failed to fetch schemas from Iglu Server: {err}")
        else:
            # Read from local schema repository
            schemas = self._read_local_schemas()
        return schemas

    def test_connection(self) -> bool:
        """Test connection to configuration files"""
        return os.path.exists(self.config_path) and os.path.isdir(self.config_path)

    def _find_config_files(self) -> List[str]:
        """Find all configuration files in the config path"""
        config_files = []
        for root, _, files in os.walk(self.config_path):
            for file in files:
                if file.endswith((".conf", ".json", ".hocon")):
                    config_files.append(os.path.join(root, file))
        return config_files

    def _parse_pipeline_config(self, config: Dict) -> Optional[SnowplowPipeline]:
        """Parse pipeline configuration from config file"""
        try:
            return SnowplowPipeline(
                id=config.get("id", "default"),
                name=config.get("name", "Snowplow Pipeline"),
                description=config.get("description"),
                state=SnowplowPipelineState.RUNNING,  # Assume running for community
                collectors=self._parse_collectors(config.get("collectors", [])),
                enrichments=self._parse_enrichments(config.get("enrichments", [])),
                loaders=self._parse_loaders(config.get("loaders", [])),
            )
        except Exception as err:
            logger.error(f"Failed to parse pipeline config: {err}")
            return None

    def _read_local_schemas(self) -> List[IgluSchema]:
        """Read schemas from local Iglu repository"""
        schemas = []
        schema_path = os.path.join(self.config_path, "schemas")
        if os.path.exists(schema_path):
            for root, _, files in os.walk(schema_path):
                for file in files:
                    if file.endswith(".json"):
                        try:
                            with open(
                                os.path.join(root, file), "r", encoding="utf-8"
                            ) as f:
                                schema_content = json.load(f)
                                # Extract schema info from self-describing JSON
                                if "self" in schema_content:
                                    schema_uri = schema_content["self"]
                                    parts = schema_uri["name"].split("/")
                                    if len(parts) >= 2:
                                        schema = IgluSchema(
                                            vendor=schema_uri["vendor"],
                                            name=parts[0],
                                            format=parts[1]
                                            if len(parts) > 1
                                            else "jsonschema",
                                            version=schema_uri["version"],
                                            schema_content=schema_content,
                                        )
                                        schemas.append(schema)
                        except Exception as err:
                            logger.error(f"Failed to read schema {file}: {err}")
        return schemas

    @staticmethod
    def _parse_collectors(collectors_data: List[Dict]) -> List[SnowplowCollector]:
        """Parse collector configurations"""
        return SnowplowBDPClient._parse_collectors(collectors_data)

    @staticmethod
    def _parse_enrichments(enrichments_data: List[Dict]) -> List[SnowplowEnrichment]:
        """Parse enrichment configurations"""
        return SnowplowBDPClient._parse_enrichments(enrichments_data)

    @staticmethod
    def _parse_loaders(loaders_data: List[Dict]) -> List[SnowplowLoader]:
        """Parse loader configurations"""
        return SnowplowBDPClient._parse_loaders(loaders_data)
