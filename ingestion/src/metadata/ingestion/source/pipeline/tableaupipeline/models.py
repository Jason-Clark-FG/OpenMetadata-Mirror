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
Tableau Pipeline Source Model module
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TableauFlowItem(BaseModel):
    """Represents a Tableau Prep flow"""

    model_config = ConfigDict(extra="allow")

    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    owner_id: Optional[str] = None
    webpage_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TableauFlowRunItem(BaseModel):
    """Represents a Tableau Prep flow run"""

    model_config = ConfigDict(extra="allow")

    id: str
    flow_id: Optional[str] = None
    status: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: Optional[str] = None


class TableauTaskType(str, Enum):
    EXTRACT_REFRESH = "extractRefresh"
    FLOW_RUN = "flowRun"


class TableauPipelineDetails(BaseModel):
    """Wrapper for a pipeline entity in Tableau (Prep flow)"""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    pipeline_type: TableauTaskType
    project_name: Optional[str] = None
    webpage_url: Optional[str] = None
