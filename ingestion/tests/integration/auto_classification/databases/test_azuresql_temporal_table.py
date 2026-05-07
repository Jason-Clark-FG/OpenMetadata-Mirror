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
Integration tests for AzureSQL temporal table column filtering in sampler.

Tests that temporal table system columns (ValidFrom, ValidTo) are properly
excluded from sample data generation, addressing issue #21329.

Required environment variables to run these tests:
  AZURE_SQL_HOST       - AzureSQL server host (e.g. "myserver.database.windows.net,1433")
  AZURE_SQL_DATABASE   - Database name
  AZURE_SQL_USERNAME   - SQL authentication username
  AZURE_SQL_PASSWORD   - SQL authentication password

Optional:
  AZURE_SQL_DRIVER     - ODBC driver name (default: "ODBC Driver 18 for SQL Server")
"""

import os
import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, text

from metadata.generated.schema.entity.data.table import (
    Column as ColumnEntity,
)
from metadata.generated.schema.entity.data.table import (
    ColumnName,
    DataType,
    TableType,
)
from metadata.generated.schema.entity.data.table import (
    Table as TableEntity,
)
from metadata.generated.schema.entity.services.connections.database.azureSQLConnection import (
    AzureSQLConnection,
    AzureSQLScheme,
    AzureSQLType,
)
from metadata.generated.schema.type.basic import (
    EntityName,
    FullyQualifiedEntityName,
    Uuid,
)
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.sampler.models import SampleConfig
from metadata.sampler.sqlalchemy.azuresql.sampler import AzureSQLSampler

REQUIRED_ENV_VARS = [
    "AZURE_SQL_HOST",
    "AZURE_SQL_DATABASE",
    "AZURE_SQL_USERNAME",
    "AZURE_SQL_PASSWORD",
]

AZURE_SQL_DRIVER = os.environ.get("AZURE_SQL_DRIVER", "ODBC Driver 18 for SQL Server")

pytestmark = pytest.mark.skipif(
    not all(os.environ.get(v) for v in REQUIRED_ENV_VARS),
    reason=("AzureSQL temporal table integration tests require environment variables: " + ", ".join(REQUIRED_ENV_VARS)),
)


@pytest.fixture(scope="module")
def azuresql_engine():
    host = os.environ.get("AZURE_SQL_HOST")
    database = os.environ.get("AZURE_SQL_DATABASE")
    username = os.environ.get("AZURE_SQL_USERNAME")
    password = os.environ.get("AZURE_SQL_PASSWORD")
    driver = AZURE_SQL_DRIVER.replace(" ", "+")

    connection_url = (
        f"mssql+pyodbc://{username}:{password}@{host}/{database}?driver={driver}&Encrypt=yes&TrustServerCertificate=no"
    )
    return create_engine(connection_url, echo=False)


@pytest.fixture(scope="module")
def table_suffix():
    return uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def create_temporal_table(azuresql_engine, table_suffix):
    table_name = f"om_test_temporal_{table_suffix}"
    history_name = f"{table_name}_history"

    with azuresql_engine.connect() as conn:
        conn.execute(
            text(f"""
            CREATE TABLE dbo.[{table_name}] (
                id INT PRIMARY KEY,
                name NVARCHAR(100),
                email NVARCHAR(100),
                ValidFrom DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
                ValidTo   DATETIME2 GENERATED ALWAYS AS ROW END   HIDDEN NOT NULL,
                PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo)
            ) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.[{history_name}]))
        """)
        )
        conn.commit()
        conn.execute(
            text(f"""
            INSERT INTO dbo.[{table_name}] (id, name, email) VALUES
            (1, 'Alice', 'alice@example.com'),
            (2, 'Bob',   'bob@example.com'),
            (3, 'Carol', 'carol@example.com')
        """)
        )
        conn.commit()

    yield table_name

    with azuresql_engine.connect() as conn:
        for stmt in [
            f"ALTER TABLE dbo.[{table_name}] SET (SYSTEM_VERSIONING = OFF)",
            f"DROP TABLE IF EXISTS dbo.[{table_name}]",
            f"DROP TABLE IF EXISTS dbo.[{history_name}]",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass


@pytest.fixture(scope="module")
def azuresql_connection_config():
    return AzureSQLConnection(
        type=AzureSQLType.AzureSQL,
        scheme=AzureSQLScheme.mssql_pyodbc,
        username=os.environ.get("AZURE_SQL_USERNAME"),
        password=os.environ.get("AZURE_SQL_PASSWORD"),
        hostPort=os.environ.get("AZURE_SQL_HOST"),
        database=os.environ.get("AZURE_SQL_DATABASE"),
        driver=AZURE_SQL_DRIVER,
    )


@pytest.fixture(scope="module")
def table_entity(create_temporal_table):
    table_name = create_temporal_table
    table_id = uuid.uuid4()
    schema_id = uuid.uuid4()
    return TableEntity(
        id=Uuid(root=table_id),
        name=EntityName(root=table_name),
        fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}"),
        tableType=TableType.Regular,
        columns=[
            ColumnEntity(
                name=ColumnName(root="id"),
                dataType=DataType.INT,
                dataLength=1,
                dataTypeDisplay="int",
                fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}.id"),
            ),
            ColumnEntity(
                name=ColumnName(root="name"),
                dataType=DataType.STRING,
                dataLength=100,
                dataTypeDisplay="nvarchar",
                fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}.name"),
            ),
            ColumnEntity(
                name=ColumnName(root="email"),
                dataType=DataType.STRING,
                dataLength=100,
                dataTypeDisplay="nvarchar",
                fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}.email"),
            ),
            ColumnEntity(
                name=ColumnName(root="ValidFrom"),
                dataType=DataType.DATETIME,
                dataLength=1,
                dataTypeDisplay="datetime2",
                fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}.ValidFrom"),
            ),
            ColumnEntity(
                name=ColumnName(root="ValidTo"),
                dataType=DataType.DATETIME,
                dataLength=1,
                dataTypeDisplay="datetime2",
                fullyQualifiedName=FullyQualifiedEntityName(root=f"azuresql_test.testdb.dbo.{table_name}.ValidTo"),
            ),
        ],
        databaseSchema=EntityReference(
            id=Uuid(root=schema_id),
            type="databaseSchema",
            name="dbo",
        ),
    )


@pytest.fixture(scope="module")
def azuresql_sampler(azuresql_connection_config, table_entity):
    ometa_client = MagicMock()
    return AzureSQLSampler(
        service_connection_config=azuresql_connection_config,
        ometa_client=ometa_client,
        entity=table_entity,
        sample_config=SampleConfig(),
    )


class TestAzureSQLTemporalTableSampler:
    def test_temporal_columns_excluded_from_sample_data(
        self,
        azuresql_sampler: AzureSQLSampler,
    ) -> None:
        sample_data = azuresql_sampler.fetch_sample_data()

        assert sample_data is not None
        column_names = [col.root for col in (sample_data.columns or [])]

        assert "ValidFrom" not in column_names, "ValidFrom should be excluded from sample data"
        assert "ValidTo" not in column_names, "ValidTo should be excluded from sample data"
        assert "id" in column_names
        assert "name" in column_names
        assert "email" in column_names

    def test_sampler_does_not_raise_on_temporal_table(
        self,
        azuresql_sampler: AzureSQLSampler,
    ) -> None:
        try:
            sample_data = azuresql_sampler.fetch_sample_data()
            assert sample_data is not None
        except Exception as exc:
            pytest.fail(f"AzureSQLSampler.fetch_sample_data() raised {type(exc).__name__}: {exc}")
