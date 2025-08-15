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
Snowplow models
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SnowplowPipelineState(str, Enum):
    """Snowplow pipeline states"""

    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"


class IgluSchema(BaseModel):
    """Iglu schema model"""

    vendor: str
    name: str
    format: str
    version: str
    self_describing: bool = True
    schema_content: Dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_public: bool = True


class SnowplowEnrichment(BaseModel):
    """Snowplow enrichment configuration"""

    name: str
    enabled: bool
    enrichment_type: Optional[
        str
    ] = None  # e.g., "ip_lookups", "ua_parser", "referer_parser"
    version: Optional[str] = None

    # Enrichment-specific configurations
    input_fields: List[str] = Field(
        default_factory=list
    )  # Fields this enrichment reads
    output_fields: List[str] = Field(
        default_factory=list
    )  # Fields this enrichment adds
    output_schema: Optional[str] = None  # Schema for structured outputs

    # For SQL/API enrichments
    external_source: Optional[Dict[str, str]] = None  # Database/API connection info

    parameters: Dict[str, Any] = Field(default_factory=dict)


class SnowplowCollector(BaseModel):
    """Snowplow collector configuration"""

    name: str
    endpoint: str
    enabled: bool = True
    parameters: Dict[str, Any] = Field(default_factory=dict)


class SnowplowLoader(BaseModel):
    """Snowplow loader configuration"""

    name: str
    destination_type: str  # e.g., "redshift", "bigquery", "snowflake"
    enabled: bool = True
    parameters: Dict[str, Any] = Field(default_factory=dict)


class SnowplowPipeline(BaseModel):
    """Snowplow pipeline model"""

    id: str
    name: str
    description: Optional[str] = None
    state: SnowplowPipelineState
    collectors: List[SnowplowCollector] = Field(default_factory=list)
    enrichments: List[SnowplowEnrichment] = Field(default_factory=list)
    loaders: List[SnowplowLoader] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: Dict[str, str] = Field(default_factory=dict)
    trackers: List[str] = Field(default_factory=list)  # List of tracker types
    event_volumes: Dict[str, int] = Field(default_factory=dict)  # Event counts by type


class SnowplowDataModel(BaseModel):
    """Snowplow dbt data model"""

    name: str
    model_type: str  # e.g., "unified_digital", "ecommerce", "media_player"
    target_schema: str
    target_tables: List[str]
    refresh_schedule: Optional[str] = None
    dependencies: List[str] = Field(default_factory=list)


class SnowplowEventType(BaseModel):
    """Snowplow event type"""

    name: str
    category: str  # e.g., "standard", "custom", "structured"
    schema_uri: Optional[str] = None
    contexts: List[str] = Field(default_factory=list)
    volume_last_24h: Optional[int] = None


class SnowplowFailedEvents(BaseModel):
    """Failed events monitoring"""

    pipeline_id: str
    failure_type: str  # e.g., "schema_violation", "enrichment_failure"
    count_last_24h: int
    sample_errors: List[Dict[str, Any]] = Field(default_factory=list)
