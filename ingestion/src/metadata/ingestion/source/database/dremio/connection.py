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
Dremio connection module for OpenMetadata
"""
from typing import Optional
from urllib.parse import quote_plus

from sqlalchemy.engine import Engine

from metadata.generated.schema.entity.services.connections.database.dremioConnection import (
    DremioConnection,
)
from metadata.ingestion.connections.builders import (
    create_generic_db_connection,
    get_connection_args_common,
    get_connection_options_dict,
    init_empty_connection_arguments,
    init_empty_connection_options,
)
from metadata.ingestion.connections.test_connections import test_connection_db_common


def get_connection_url(connection: DremioConnection) -> str:
    """
    Create Dremio connection URL using pyodbc

    Since Dremio doesn't have native SQLAlchemy support, we'll use pyodbc
    with a custom dialect to connect via ODBC driver
    """
    url_params = {"driver": "Dremio ODBC Driver"}

    if connection.projectId:
        url_params["routing_tag"] = connection.projectId

    if connection.sslMode:
        url_params["ssl"] = "true"

    params = "&".join(f"{key}={value}" for key, value in url_params.items())

    # Using generic ODBC connection format
    # Format: mssql+pyodbc://<username>:<password>@<host>:<port>/?driver=...
    # We'll register a custom dialect for dremio
    return (
        f"dremio+pyodbc://"
        f"{quote_plus(connection.username)}"
        f":{quote_plus(connection.password.get_secret_value())}"
        f"@{connection.hostPort}/?{params}"
    )


def get_connection(connection: DremioConnection) -> Engine:
    """
    Create Dremio connection engine
    """
    if connection.connectionArguments:
        if not isinstance(connection.connectionArguments, dict):
            connection.connectionArguments = (
                connection.connectionArguments.model_dump()
                if hasattr(connection.connectionArguments, "model_dump")
                else connection.connectionArguments
            )
    else:
        connection.connectionArguments = init_empty_connection_arguments()

    if connection.connectionOptions:
        if not isinstance(connection.connectionOptions, dict):
            connection.connectionOptions = (
                connection.connectionOptions.model_dump()
                if hasattr(connection.connectionOptions, "model_dump")
                else connection.connectionOptions
            )
    else:
        connection.connectionOptions = init_empty_connection_options()

    connection_options = get_connection_options_dict(connection.connectionOptions)
    connection_arguments = get_connection_args_common(connection.connectionArguments)

    connection_url = get_connection_url(connection)

    engine = create_generic_db_connection(
        connection=connection,
        connection_url=connection_url,
        connection_options=connection_options,
        connection_arguments=connection_arguments,
    )

    return engine


def test_connection(
    engine: Engine,
    service_connection: DremioConnection,
    automation_workflow: Optional[str] = None,
) -> None:
    """
    Test Dremio connection
    """
    test_connection_db_common(
        engine=engine,
        service_connection=service_connection,
        automation_workflow=automation_workflow,
    )
