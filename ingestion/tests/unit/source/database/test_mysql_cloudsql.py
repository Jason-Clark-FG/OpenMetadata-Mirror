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
Tests for GCP CloudSQL MySQL connection handling
"""
from unittest.mock import MagicMock, patch

from metadata.generated.schema.entity.services.connections.database.common.gcpCloudSqlConfig import (
    GcpCloudSqlConfigurationSource,
)
from metadata.generated.schema.entity.services.connections.database.mysqlConnection import (
    MysqlConnection,
)


class TestMySQLCloudSQLConnection:
    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_password_auth(self, mock_connector_cls, mock_create_conn):
        mock_connector = MagicMock()
        mock_connector_cls.return_value = mock_connector
        mock_create_conn.return_value = MagicMock()

        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="dbuser",
            authType=GcpCloudSqlConfigurationSource(
                password="dbpassword",
            ),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        mock_create_conn.assert_called_once()
        call_kwargs = mock_create_conn.call_args
        assert "creator" in call_kwargs.kwargs

        creator_fn = call_kwargs.kwargs["creator"]
        creator_fn()

        mock_connector.connect.assert_called_once()
        connect_kwargs = mock_connector.connect.call_args.kwargs
        assert (
            connect_kwargs["instance_connection_string"]
            == "my-project:us-central1:my-instance"
        )
        assert connect_kwargs["driver"] == "pymysql"
        assert connect_kwargs["user"] == "dbuser"
        assert connect_kwargs["password"] == "dbpassword"
        assert "enable_iam_auth" not in connect_kwargs

    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_iam_auth(self, mock_connector_cls, mock_create_conn):
        mock_connector = MagicMock()
        mock_connector_cls.return_value = mock_connector
        mock_create_conn.return_value = MagicMock()

        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="sa@my-project.iam",
            authType=GcpCloudSqlConfigurationSource(
                enableIamAuth=True,
            ),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        creator_fn = mock_create_conn.call_args.kwargs["creator"]
        creator_fn()

        connect_kwargs = mock_connector.connect.call_args.kwargs
        assert connect_kwargs["enable_iam_auth"] is True
        assert "password" not in connect_kwargs

    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_url_is_bare_scheme(self, mock_connector_cls, mock_create_conn):
        mock_connector_cls.return_value = MagicMock()
        mock_create_conn.return_value = MagicMock()

        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="dbuser",
            authType=GcpCloudSqlConfigurationSource(password="pw"),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        url_fn = mock_create_conn.call_args.kwargs["get_connection_url_fn"]
        assert url_fn(connection) == "mysql+pymysql://"

    @patch("metadata.ingestion.source.database.mysql.connection.set_google_credentials")
    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_sets_gcp_credentials_when_provided(
        self, mock_connector_cls, mock_create_conn, mock_set_creds
    ):
        mock_connector_cls.return_value = MagicMock()
        mock_create_conn.return_value = MagicMock()

        gcp_config = MagicMock()
        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="dbuser",
            authType=GcpCloudSqlConfigurationSource(
                password="pw",
                gcpConfig=gcp_config,
            ),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        mock_set_creds.assert_called_once_with(gcp_config)

    @patch("metadata.ingestion.source.database.mysql.connection.set_google_credentials")
    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_skips_gcp_credentials_when_not_provided(
        self, mock_connector_cls, mock_create_conn, mock_set_creds
    ):
        mock_connector_cls.return_value = MagicMock()
        mock_create_conn.return_value = MagicMock()

        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="dbuser",
            authType=GcpCloudSqlConfigurationSource(password="pw"),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        mock_set_creds.assert_not_called()

    @patch(
        "metadata.ingestion.source.database.mysql.connection.create_generic_db_connection"
    )
    @patch("google.cloud.sql.connectors.Connector")
    def test_cloudsql_passes_database_schema(
        self, mock_connector_cls, mock_create_conn
    ):
        mock_connector = MagicMock()
        mock_connector_cls.return_value = mock_connector
        mock_create_conn.return_value = MagicMock()

        connection = MysqlConnection(
            hostPort="my-project:us-central1:my-instance",
            username="dbuser",
            databaseSchema="mydb",
            authType=GcpCloudSqlConfigurationSource(password="pw"),
        )

        from metadata.ingestion.source.database.mysql.connection import MySQLConnection

        mysql_conn = MySQLConnection.__new__(MySQLConnection)
        mysql_conn.service_connection = connection
        mysql_conn._get_cloudsql_engine(connection)

        creator_fn = mock_create_conn.call_args.kwargs["creator"]
        creator_fn()

        connect_kwargs = mock_connector.connect.call_args.kwargs
        assert connect_kwargs["db"] == "mydb"
