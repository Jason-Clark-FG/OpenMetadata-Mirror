#  Copyright 2026 Collate
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
Regression tests for the databricks `get_columns` override.

Incident: DESCRIBE TABLE EXTENDED on some Delta / streaming / partition-marker
rows returns an empty col_type string. `_get_column_rows` (metadata.py:166)
normalizes empty strings to None via ``col.strip() if col else None``. The
filter on metadata.py:169 only validates row[0] (col_name), so rows with
col_type=None survive. The loop body then calls
``re.search(r"^\\w+", col_type).group(0)`` which raises
``TypeError: expected string or bytes-like object``.

The base sql_column_handler catches the exception, logs a warning, and
returns an empty columns list — which the topology runner then sees as
"no change", silently dropping all column metadata for the table.
"""

from unittest.mock import Mock, patch

import pytest

from metadata.ingestion.source.database.databricks.metadata import (
    _get_column_rows,
    get_columns,
)


class TestDatabricksGetColumnsDefensive:
    """Defensive handling of malformed rows returned by DESCRIBE TABLE EXTENDED."""

    def test_row_with_none_col_type_does_not_crash(self):
        """A row where col_type is None must not raise.

        This reproduces the production TypeError seen at
        ``metadata.py:200`` where ``re.search(r"^\\w+", None)`` was called.
        """
        mock_self = Mock()
        mock_connection = Mock()

        with patch(
            "metadata.ingestion.source.database.databricks.metadata._get_column_rows"
        ) as mock_rows:
            mock_rows.return_value = [
                ("id", "bigint", "primary key"),
                ("mystery_col", None, "col_type came back None"),
                ("name", "string", "user name"),
            ]

            result = get_columns(
                mock_self,
                mock_connection,
                "users",
                "test_schema",
                db_name="test_db",
            )

        names = [col["name"] for col in result]
        assert "id" in names, "valid column before the None row must survive"
        assert "name" in names, "valid column after the None row must survive"

    def test_row_with_empty_col_type_does_not_crash(self):
        """A row where col_type is an empty string must also not raise."""
        mock_self = Mock()
        mock_connection = Mock()

        with patch(
            "metadata.ingestion.source.database.databricks.metadata._get_column_rows"
        ) as mock_rows:
            mock_rows.return_value = [
                ("id", "bigint", "primary key"),
                ("empty_type_col", "", "col_type is empty string"),
            ]

            result = get_columns(
                mock_self,
                mock_connection,
                "users",
                "test_schema",
                db_name="test_db",
            )

        assert any(col["name"] == "id" for col in result)

    def test_valid_rows_still_produce_full_column_metadata(self):
        """Sanity check: unaffected path still produces columns correctly."""
        mock_self = Mock()
        mock_connection = Mock()

        with patch(
            "metadata.ingestion.source.database.databricks.metadata._get_column_rows"
        ) as mock_rows:
            mock_rows.return_value = [
                ("id", "bigint", "primary key"),
                ("name", "string", "user name"),
            ]

            result = get_columns(
                mock_self,
                mock_connection,
                "users",
                "test_schema",
                db_name="test_db",
            )

        assert len(result) == 2
        assert result[0]["name"] == "id"
        assert result[0]["ordinal_position"] == 0
        assert result[1]["name"] == "name"
        assert result[1]["ordinal_position"] == 1


class TestGetColumnRowsFilter:
    """The first line of defense: `_get_column_rows` must drop malformed rows."""

    @patch("metadata.ingestion.source.database.databricks.metadata._get_table_columns")
    def test_filter_drops_rows_with_none_col_type(self, mock_get_table_columns):
        mock_get_table_columns.return_value = [
            ("id", "bigint", "primary key"),
            ("mystery_col", None, "col_type came back None"),
            ("name", "string", "user name"),
        ]

        result = _get_column_rows(Mock(), Mock(), "users", "test_schema", "test_db")

        names = [row[0] for row in result]
        assert "mystery_col" not in names
        assert names == ["id", "name"]

    @patch("metadata.ingestion.source.database.databricks.metadata._get_table_columns")
    def test_filter_drops_rows_with_empty_col_type(self, mock_get_table_columns):
        mock_get_table_columns.return_value = [
            ("id", "bigint", "primary key"),
            ("empty_type_col", "", "col_type empty string"),
            ("   ", None, None),
        ]

        result = _get_column_rows(Mock(), Mock(), "users", "test_schema", "test_db")

        names = [row[0] for row in result]
        assert names == ["id"]

    @patch("metadata.ingestion.source.database.databricks.metadata._get_table_columns")
    def test_filter_preserves_valid_rows(self, mock_get_table_columns):
        mock_get_table_columns.return_value = [
            ("id", "bigint", "primary key"),
            ("name", "string", "user name"),
            ("# col_name", "data_type", "comment"),
        ]

        result = _get_column_rows(Mock(), Mock(), "users", "test_schema", "test_db")

        names = [row[0] for row in result]
        assert names == ["id", "name"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
