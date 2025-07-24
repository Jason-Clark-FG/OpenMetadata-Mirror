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
HubSpot API response models
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HubSpotReport(BaseModel):
    """
    HubSpot Report Model
    """

    id: str
    name: str
    description: Optional[str] = None
    type: Optional[str] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")
    owner_id: Optional[str] = Field(None, alias="ownerId")

    class Config:
        populate_by_name = True


class HubSpotDashboard(BaseModel):
    """
    HubSpot Dashboard Model
    """

    id: str
    name: str
    description: Optional[str] = None
    reports: Optional[List[str]] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")
    owner_id: Optional[str] = Field(None, alias="ownerId")

    class Config:
        populate_by_name = True


class HubSpotAnalyticsReport(BaseModel):
    """
    HubSpot Analytics Report Model
    """

    report_id: str = Field(alias="reportId")
    report_name: str = Field(alias="reportName")
    report_type: str = Field(alias="reportType")
    metrics: List[str] = []
    dimensions: List[str] = []
    filters: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class HubSpotDataSource(BaseModel):
    """
    HubSpot Data Source Model
    """

    source_id: str = Field(alias="sourceId")
    source_name: str = Field(alias="sourceName")
    source_type: str = Field(alias="sourceType")
    properties: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True
