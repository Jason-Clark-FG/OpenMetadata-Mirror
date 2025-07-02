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
ThoughtSpot API response models
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ThoughtSpotObjectType(str, Enum):
    """ThoughtSpot object types"""

    LIVEBOARD = "LIVEBOARD"
    ANSWER = "ANSWER"
    WORKSHEET = "WORKSHEET"
    VIEW = "VIEW"
    TABLE = "TABLE"
    LOGICAL_TABLE = "LOGICAL_TABLE"
    CONNECTION = "DATA_SOURCE"
    USER = "USER"
    GROUP = "USER_GROUP"


class ThoughtSpotPermission(BaseModel):
    """Permission model"""

    principal: Optional[str] = None
    permission: Optional[str] = None
    share_mode: Optional[str] = None


class ThoughtSpotTag(BaseModel):
    """Tag model"""

    name: str
    id: Optional[str] = None
    color: Optional[str] = None


class ThoughtSpotOwner(BaseModel):
    """Owner information"""

    id: str
    name: str
    display_name: Optional[str] = None
    type: Optional[str] = None


class ThoughtSpotColumn(BaseModel):
    """Column information for worksheets and data models"""

    id: str
    name: str
    display_name: Optional[str] = Field(None, alias="displayName")
    data_type: Optional[str] = Field(None, alias="dataType")
    column_type: Optional[str] = Field(None, alias="columnType")
    is_hidden: Optional[bool] = Field(False, alias="isHidden")
    description: Optional[str] = None
    formula: Optional[str] = None
    synonym: Optional[List[str]] = None
    index_priority: Optional[int] = Field(None, alias="indexPriority")
    format_pattern: Optional[str] = Field(None, alias="formatPattern")
    currency_type: Optional[str] = Field(None, alias="currencyType")
    aggregation: Optional[str] = None
    is_additive: Optional[bool] = Field(True, alias="isAdditive")

    class Config:
        populate_by_name = True


class ThoughtSpotJoin(BaseModel):
    """Join information for worksheets"""

    id: Optional[str] = None
    name: Optional[str] = None
    source: Optional[str] = None
    destination: Optional[str] = None
    type: Optional[str] = None
    is_one_to_one: Optional[bool] = Field(False, alias="isOneToOne")


class ThoughtSpotTable(BaseModel):
    """Table reference in worksheets"""

    id: str
    name: str
    fqn: Optional[str] = None
    connection_id: Optional[str] = Field(None, alias="connectionId")
    connection_name: Optional[str] = Field(None, alias="connectionName")


class ThoughtSpotVisualization(BaseModel):
    """Visualization/Chart information"""

    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    viz_type: Optional[str] = Field(None, alias="vizType")
    chart_type: Optional[str] = Field(None, alias="chartType")
    answer_id: Optional[str] = Field(None, alias="answerId")
    columns: Optional[List[ThoughtSpotColumn]] = None

    class Config:
        populate_by_name = True


class ThoughtSpotMetadataObject(BaseModel):
    """Base metadata object"""

    id: str = Field(alias="metadata_id")
    name: str = Field(alias="metadata_name")
    type: ThoughtSpotObjectType = Field(alias="metadata_type")
    display_name: Optional[str] = None
    description: Optional[str] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    author: Optional[ThoughtSpotOwner] = None
    owner: Optional[ThoughtSpotOwner] = None
    tags: Optional[List[ThoughtSpotTag]] = None
    is_hidden: Optional[bool] = False
    is_deprecated: Optional[bool] = False
    metadata_header: Optional[Dict[str, Any]] = None
    visualization_headers: Optional[List[Dict[str, Any]]] = None
    visualizations: Optional[List[Any]] = None  # Will be populated during processing

    class Config:
        populate_by_name = True


class ThoughtSpotLiveboard(ThoughtSpotMetadataObject):
    """Liveboard (Dashboard) model"""

    is_draft: Optional[bool] = Field(False, alias="isDraft")


class ThoughtSpotAnswer(ThoughtSpotMetadataObject):
    """Answer model"""

    question: Optional[str] = None
    worksheet_id: Optional[str] = Field(None, alias="worksheetId")
    worksheet_name: Optional[str] = Field(None, alias="worksheetName")
    view_id: Optional[str] = Field(None, alias="viewId")
    view_name: Optional[str] = Field(None, alias="viewName")


class ThoughtSpotWorksheet(ThoughtSpotMetadataObject):
    """Worksheet (Data Model) model"""

    columns: Optional[List[ThoughtSpotColumn]] = None
    tables: Optional[List[ThoughtSpotTable]] = None
    joins: Optional[List[ThoughtSpotJoin]] = None
    filters: Optional[List[Dict[str, Any]]] = None
    properties: Optional[Dict[str, Any]] = None


class ThoughtSpotView(ThoughtSpotMetadataObject):
    """View model"""

    answer_id: Optional[str] = Field(None, alias="answerId")
    answer_name: Optional[str] = Field(None, alias="answerName")
    columns: Optional[List[ThoughtSpotColumn]] = None
    worksheet_id: Optional[str] = Field(None, alias="worksheetId")
    worksheet_name: Optional[str] = Field(None, alias="worksheetName")


class ThoughtSpotConnection(BaseModel):
    """Connection/Data Source model"""

    id: str
    name: str
    description: Optional[str] = None
    type: Optional[str] = None
    database_name: Optional[str] = Field(None, alias="databaseName")
    schema_name: Optional[str] = Field(None, alias="schemaName")
    host: Optional[str] = None
    port: Optional[int] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    author: Optional[ThoughtSpotOwner] = None

    class Config:
        populate_by_name = True


class ThoughtSpotSearchResponse(BaseModel):
    """Search API response"""

    headers: List[ThoughtSpotMetadataObject]
    total_count: Optional[int] = Field(None, alias="totalCount")
    is_last_batch: Optional[bool] = Field(True, alias="isLastBatch")

    class Config:
        populate_by_name = True


class ThoughtSpotDetailResponse(BaseModel):
    """Metadata detail API response"""

    metadata_id: str = Field(alias="metadataId")
    metadata_type: ThoughtSpotObjectType = Field(alias="metadataType")
    metadata_details: Dict[str, Any] = Field(alias="metadataDetails")

    class Config:
        populate_by_name = True


class ThoughtSpotTMLObject(BaseModel):
    """TML (ThoughtSpot Modeling Language) object"""

    guid: str
    name: str
    type: ThoughtSpotObjectType
    tml_content: Optional[str] = Field(None, alias="tmlContent")
    info: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True
