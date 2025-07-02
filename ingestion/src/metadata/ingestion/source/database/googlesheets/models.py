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
Google Sheets specific models
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GoogleSheetInfo(BaseModel):
    """
    Google Sheet file information
    """

    id: str
    name: str
    webViewLink: Optional[str] = None
    createdTime: Optional[str] = None
    modifiedTime: Optional[str] = None
    parents: Optional[List[str]] = Field(default_factory=list)


class SheetProperties(BaseModel):
    """
    Properties of a sheet/tab within a spreadsheet
    """

    sheetId: int
    title: str
    index: int
    gridProperties: Optional[Dict[str, Any]] = None


class CellData(BaseModel):
    """
    Cell data from a sheet
    """

    value: Optional[Any] = None
    formattedValue: Optional[str] = None
    formula: Optional[str] = None
    note: Optional[str] = None


class ColumnInfo(BaseModel):
    """
    Information about a column in a sheet
    """

    name: str
    index: int
    data_type: Optional[str] = None
    formula: Optional[str] = None
    description: Optional[str] = None
    sample_values: Optional[List[Any]] = Field(default_factory=list)


class SheetData(BaseModel):
    """
    Data from a Google Sheet
    """

    spreadsheet_id: str
    spreadsheet_name: str
    sheet_name: str
    sheet_id: int
    columns: List[ColumnInfo]
    row_count: int
    column_count: int
