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
Tests for MySQL median/quartile SQL compilation.

Validates that the MySQL dialect produces valid SQL using window functions
instead of the legacy approach with user-defined variables (@counter :=)
and implicit cross joins that caused ProgrammingError (1064) syntax errors.
"""

import pytest
from sqlalchemy import column
from sqlalchemy.dialects import mysql as mysql_dialect

from metadata.profiler.orm.functions.median import MedianFn


@pytest.fixture()
def dialect():
    return mysql_dialect.dialect()


def _compile(
    percentile, col_name="CustomerId", table="Signal", dialect=None, dimension_col=None
):
    if dimension_col is not None:
        fn = MedianFn(column(col_name), table, percentile, dimension_col)
    else:
        fn = MedianFn(column(col_name), table, percentile)
    return str(fn.compile(dialect=dialect))


class TestMySQLMedianCompilation:
    """Verify the generated SQL is valid MySQL syntax."""

    def test_no_user_variable_assignment(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert ":=" not in sql
        assert "@counter" not in sql

    def test_no_unordered_row_number(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert "ROW_NUMBER() OVER ()" not in sql

    def test_uses_window_count(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert "COUNT(*) OVER ()" in sql

    def test_uses_ordered_row_number(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert "ROW_NUMBER() OVER (ORDER BY" in sql

    def test_no_implicit_cross_join(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert "SELECT @counter" not in sql
        assert "t_count" not in sql

    def test_median_percentile(self, dialect):
        sql = _compile(0.5, dialect=dialect)
        assert "ROUND(0.5 * temp.cnt)" in sql

    def test_first_quartile_percentile(self, dialect):
        sql = _compile(0.25, dialect=dialect)
        assert "ROUND(0.25 * temp.cnt)" in sql

    def test_third_quartile_percentile(self, dialect):
        sql = _compile(0.75, dialect=dialect)
        assert "ROUND(0.75 * temp.cnt)" in sql

    def test_column_name_in_output(self, dialect):
        sql = _compile(0.5, col_name="age", table="users", dialect=dialect)
        assert "age" in sql
        assert "users" in sql

    def test_non_correlated_full_sql(self, dialect):
        sql = _compile(0.5, col_name="CustomerId", table="Signal", dialect=dialect)
        expected = (
            "(SELECT `CustomerId` FROM ("
            "SELECT `CustomerId`,"
            " ROW_NUMBER() OVER (ORDER BY `CustomerId`) AS rn,"
            " COUNT(*) OVER () AS cnt"
            " FROM Signal"
            ") temp WHERE temp.rn = ROUND(0.5 * temp.cnt))"
        )
        assert sql == expected


class TestMySQLMedianCorrelated:
    """Verify correlated mode for dimensionality validation."""

    def test_correlated_includes_where_clause(self, dialect):
        sql = _compile(0.5, dialect=dialect, dimension_col="region")
        assert "median_inner.region = Signal.region" in sql

    def test_correlated_no_user_variables(self, dialect):
        sql = _compile(0.5, dialect=dialect, dimension_col="region")
        assert ":=" not in sql
        assert "@counter" not in sql

    def test_correlated_uses_window_functions(self, dialect):
        sql = _compile(0.5, dialect=dialect, dimension_col="region")
        assert "ROW_NUMBER() OVER (ORDER BY" in sql
        assert "COUNT(*) OVER ()" in sql

    def test_correlated_full_sql(self, dialect):
        sql = _compile(
            0.5,
            col_name="CustomerId",
            table="Signal",
            dialect=dialect,
            dimension_col="region",
        )
        expected = (
            "(SELECT `CustomerId` FROM ("
            "SELECT `CustomerId`,"
            " ROW_NUMBER() OVER (ORDER BY `CustomerId`) AS rn,"
            " COUNT(*) OVER () AS cnt"
            " FROM Signal AS median_inner"
            " WHERE median_inner.region = Signal.region"
            ") temp WHERE temp.rn = ROUND(0.5 * temp.cnt))"
        )
        assert sql == expected
