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
Utility for hashing column names to produce fixed-length identifiers for use
in FQN construction. This decouples FQN length from raw column name length.

The raw column name is preserved in Column.name; only the FQN segment is hashed.

Algorithm must produce identical output to the Java implementation in
ColumnNameHash.java (both use MD5 with UTF-8 encoding).
"""
import hashlib
from typing import Optional

HASH_PREFIX = "md5_"
HASH_LENGTH = 36  # "md5_" (4) + 32 hex chars


def hash_column_name(raw_column_name: str) -> str:
    """Hash a raw column name for use as the column segment in a fully qualified name.

    Args:
        raw_column_name: the original column name from the source system

    Returns:
        A fixed-length identifier in the format "md5_<32 hex chars>"
    """
    return HASH_PREFIX + hashlib.md5(raw_column_name.encode("utf-8")).hexdigest()


def is_hashed_column_fqn_segment(segment: Optional[str]) -> bool:
    """Check whether a string is a hashed column FQN segment."""
    return (
        segment is not None
        and segment.startswith(HASH_PREFIX)
        and len(segment) == HASH_LENGTH
    )
