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
QlikCloud Models
"""
from typing import List, Optional

from pydantic import BaseModel, Field


# App Models
class QlikApp(BaseModel):
    """QlikCloud App model"""

    description: Optional[str] = None
    name: Optional[str] = None
    id: str
    app_id: Optional[str] = Field(None, alias="resourceId")
    published: Optional[bool] = None


class QlikLink(BaseModel):
    href: Optional[str] = None


class QlikLinks(BaseModel):
    next: Optional[QlikLink] = None


class QlikAppResponse(BaseModel):
    """QlikCloud Apps List"""

    apps: Optional[List[QlikApp]] = Field(None, alias="data")
    links: Optional[QlikLinks] = None
