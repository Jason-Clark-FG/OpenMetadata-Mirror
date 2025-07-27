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
Custom SQLAlchemy dialect for Dremio using pyodbc
"""
from sqlalchemy.dialects import registry
from sqlalchemy.dialects.mssql.pyodbc import MSDialect_pyodbc
from sqlalchemy.sql import sqltypes


class DremioDialect(MSDialect_pyodbc):
    """
    Custom dialect for Dremio using pyodbc
    """

    name = "dremio"
    driver = "pyodbc"

    # Dremio-specific settings
    supports_statement_cache = False
    supports_sane_rowcount = False
    supports_sane_multi_rowcount = False
    supports_native_boolean = True
    supports_unicode_statements = True
    supports_unicode_binds = True
    returns_unicode_strings = True
    description_encoding = None
    postfetch_lastrowid = False

    # Override type mappings for Dremio
    colspecs = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Override some MSSQL-specific behavior
        self.use_scope_identity = False
        self.max_identifier_length = 128

    def _get_server_version_info(self, connection):
        """
        Get Dremio version info
        """
        return (1, 0, 0)

    def get_schema_names(self, connection, **kw):
        """
        Get schema names from Dremio
        """
        query = """
            SELECT DISTINCT TABLE_SCHEMA
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA IS NOT NULL
            ORDER BY TABLE_SCHEMA
        """
        result = connection.execute(query)
        return [row[0] for row in result]

    def get_table_names(self, connection, schema=None, **kw):
        """
        Get table names from Dremio
        """
        query = """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE IN ('BASE TABLE', 'TABLE')
        """
        if schema:
            query += f" AND TABLE_SCHEMA = '{schema}'"
        query += " ORDER BY TABLE_NAME"

        result = connection.execute(query)
        return [row[0] for row in result]

    def get_view_names(self, connection, schema=None, **kw):
        """
        Get view names from Dremio
        """
        query = """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'VIEW'
        """
        if schema:
            query += f" AND TABLE_SCHEMA = '{schema}'"
        query += " ORDER BY TABLE_NAME"

        result = connection.execute(query)
        return [row[0] for row in result]

    def get_columns(self, connection, table_name, schema=None, **kw):
        """
        Get column information from Dremio
        """
        query = """
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT,
                CHARACTER_MAXIMUM_LENGTH,
                NUMERIC_PRECISION,
                NUMERIC_SCALE,
                ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = ?
        """
        params = [table_name]

        if schema:
            query += " AND TABLE_SCHEMA = ?"
            params.append(schema)

        query += " ORDER BY ORDINAL_POSITION"

        result = connection.execute(query, params)

        columns = []
        for row in result:
            col_info = {
                "name": row.COLUMN_NAME,
                "type": self._resolve_type(row.DATA_TYPE),
                "nullable": row.IS_NULLABLE == "YES",
                "default": row.COLUMN_DEFAULT,
            }

            if row.CHARACTER_MAXIMUM_LENGTH:
                col_info["length"] = row.CHARACTER_MAXIMUM_LENGTH
            if row.NUMERIC_PRECISION:
                col_info["precision"] = row.NUMERIC_PRECISION
            if row.NUMERIC_SCALE:
                col_info["scale"] = row.NUMERIC_SCALE

            columns.append(col_info)

        return columns

    def _resolve_type(self, type_name):
        """
        Map Dremio types to SQLAlchemy types
        """
        type_map = {
            "BIGINT": sqltypes.BigInteger,
            "INT": sqltypes.Integer,
            "INTEGER": sqltypes.Integer,
            "SMALLINT": sqltypes.SmallInteger,
            "TINYINT": sqltypes.SmallInteger,
            "BOOLEAN": sqltypes.Boolean,
            "DOUBLE": sqltypes.Float,
            "FLOAT": sqltypes.Float,
            "DECIMAL": sqltypes.Numeric,
            "NUMERIC": sqltypes.Numeric,
            "VARCHAR": sqltypes.String,
            "CHAR": sqltypes.String,
            "TEXT": sqltypes.Text,
            "DATE": sqltypes.Date,
            "TIME": sqltypes.Time,
            "TIMESTAMP": sqltypes.DateTime,
            "BINARY": sqltypes.LargeBinary,
            "VARBINARY": sqltypes.LargeBinary,
        }

        base_type = type_name.upper().split("(")[0]
        return type_map.get(base_type, sqltypes.String)

    def has_table(self, connection, table_name, schema=None):
        """
        Check if table exists in Dremio
        """
        query = """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = ?
        """
        params = [table_name]

        if schema:
            query += " AND TABLE_SCHEMA = ?"
            params.append(schema)

        result = connection.execute(query, params)
        return result.scalar() > 0


# Register the dialect
registry.register(
    "dremio.pyodbc",
    "metadata.ingestion.source.database.dremio.pyodbc_dialect",
    "DremioDialect",
)
