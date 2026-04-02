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
Tests for column name hashing utility.

The hash function must produce identical output to the Java implementation
in ColumnNameHash.java. Both use MD5 with UTF-8 encoding.
"""
import hashlib

import pytest

from metadata.utils.column_name_hash import (
    HASH_LENGTH,
    HASH_PREFIX,
    hash_column_name,
    is_hashed_column_fqn_segment,
)


class TestColumnNameHash:
    """Tests for hash_column_name and related utilities."""

    def test_basic_hash(self):
        result = hash_column_name("customer_email")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_deterministic(self):
        assert hash_column_name("col") == hash_column_name("col")

    def test_different_names_different_hashes(self):
        assert hash_column_name("col_a") != hash_column_name("col_b")

    def test_known_md5_value(self):
        """Verify against known MD5 to ensure cross-language compatibility."""
        name = "customer_email"
        expected_md5 = hashlib.md5(name.encode("utf-8")).hexdigest()
        result = hash_column_name(name)
        assert result == f"md5_{expected_md5}"

    def test_special_characters_colon(self):
        result = hash_column_name("col::with::colons")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_special_characters_quotes(self):
        result = hash_column_name('col"with"quotes')
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_special_characters_arrow(self):
        result = hash_column_name("col>with>arrows")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_unicode(self):
        result = hash_column_name("列名_カラム_컬럼")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_very_long_name(self):
        long_name = "a" * 2000
        result = hash_column_name(long_name)
        assert len(result) == HASH_LENGTH

    def test_nested_struct_path(self):
        """Simulate a deeply nested BigQuery struct column path."""
        nested = ".".join([f"level_{i}" for i in range(20)])
        result = hash_column_name(nested)
        assert len(result) == HASH_LENGTH

    def test_empty_string(self):
        result = hash_column_name("")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_spaces(self):
        result = hash_column_name("column with spaces")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH

    def test_dash_column_name(self):
        """BigQuery unnamed struct fields use '-' as name."""
        result = hash_column_name("-")
        assert result.startswith(HASH_PREFIX)
        assert len(result) == HASH_LENGTH


class TestIsHashedColumnFQNSegment:
    """Tests for is_hashed_column_fqn_segment."""

    def test_valid_hash(self):
        hashed = hash_column_name("test")
        assert is_hashed_column_fqn_segment(hashed) is True

    def test_raw_column_name(self):
        assert is_hashed_column_fqn_segment("customer_email") is False

    def test_wrong_prefix(self):
        assert is_hashed_column_fqn_segment("sha_" + "a" * 32) is False

    def test_wrong_length(self):
        assert is_hashed_column_fqn_segment("md5_abc") is False

    def test_none(self):
        assert is_hashed_column_fqn_segment(None) is False

    def test_empty(self):
        assert is_hashed_column_fqn_segment("") is False


class TestCrossLanguageCompatibility:
    """
    These test values can be verified against the Java implementation.

    To verify in Java:
        ColumnNameHash.hashColumnName("customer_email")
    should produce the same result as:
        hash_column_name("customer_email")

    Both implementations use:
        "md5_" + MD5(input.getBytes("UTF-8")).toHexString()
    """

    @pytest.mark.parametrize(
        "input_name",
        [
            "customer_email",
            "id",
            "",
            "col::with::colons",
            'col"quoted"',
            "col>arrow",
            "列名",
            "a" * 300,
            "deeply.nested.struct.field.name",
            "-",
            " ",
            "UPPER_CASE",
        ],
    )
    def test_hash_matches_java_algorithm(self, input_name):
        """Verify Python hash matches the expected MD5 algorithm used by Java."""
        expected = "md5_" + hashlib.md5(input_name.encode("utf-8")).hexdigest()
        assert hash_column_name(input_name) == expected
