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
Source connection handler
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.engine import Engine

from metadata.core.connections.test_connection import ErrorPack, Matchers, check, when
from metadata.core.connections.test_connection.checks.database import (
    DEFAULT_SAMPLE_ROWS,
    DatabaseStep,
    enumerated,
    list_schemas,
    list_tables,
    list_views,
    ping,
    run_sql,
)
from metadata.core.connections.test_connection.classifier import exception_chain
from metadata.core.connections.test_connection.network import NETWORK_ERRORS
from metadata.generated.schema.entity.services.connections.database.mssqlConnection import (
    MssqlConnection as MssqlConnectionConfig,
)
from metadata.ingestion.connections.builders import (
    create_generic_db_connection,
    get_connection_args_common,
    get_connection_url_common,
)
from metadata.ingestion.connections.connection import BaseConnection
from metadata.ingestion.source.database.azuresql.connection import (
    get_connection_url as get_pyodbc_connection_url,
)
from metadata.ingestion.source.database.mssql.queries import (
    MSSQL_GET_CURRENT_DATABASE,
    MSSQL_GET_DATABASE,
    MSSQL_TEST_GET_QUERIES,
    MSSQL_TEST_GET_QUERIES_FROM_QUERY_STORE,
)
from metadata.ingestion.source.database.mssql.utils import is_query_store_enabled

if TYPE_CHECKING:
    from metadata.core.connections.lifetime import Borrowed
    from metadata.core.connections.test_connection import ChecksProvider
    from metadata.core.connections.test_connection.classifier import Matcher
    from metadata.core.connections.test_connection.records import Evidence


# --- SQL Server error pack ---------------------------------------------------
# Grouped and self-contained so the Fabric (Database) connector, which speaks the
# same SQL Server protocol, can lift it verbatim later.
#
# Error numbers are from the SQL Server system error message reference
# (https://learn.microsoft.com/en-us/sql/relational-databases/errors-events/database-engine-events-and-errors).


def _mssql_number(error: BaseException) -> int | None:
    """The SQL Server error number, however the raising driver carries it.

    ``Matchers.errno`` cannot find it: it requires an ``int`` at ``args[0]``, and
    no supported driver puts one there. Verified against each driver's source:

    * pytds (default, ``mssql+pytds``) - ``tds_base._create_exception_by_message``
      builds ``OperationalError(error_msg)`` and then assigns ``.number`` and
      ``.msg_no``, so ``args[0]`` is the *message*. pytds reads ``.msg_no`` back the
      same way in its own retry handler (``pytds/__init__.py``, ``ex_handler``).
    * pymssql (``mssql+pymssql``) - ``_mssql.pyx`` raises
      ``MSSQLDatabaseException((msg_no, error_msg))``, and ``_pymssql.pyx`` converts
      it with ``raise OperationalError(e.args[0])``, so the DBAPI error's ``args[0]``
      is the ``(number, message)`` *tuple* and ``.number`` does not survive.
    * pyodbc (``mssql+pyodbc``) - ``args`` is ``(sqlstate_str, message)``; the number
      appears only inside the message text, so it is unreachable here and the
      message rules cover that driver.

    Reading the number rather than the message keeps these rules locale-independent:
    SQL Server localizes message text, but never the number.
    """
    for current in exception_chain(error):
        for candidate in (current, getattr(current, "orig", None)):
            if candidate is None:
                continue
            for attribute in ("number", "msg_no"):
                value = getattr(candidate, attribute, None)
                if isinstance(value, int):
                    return value
            args = getattr(candidate, "args", ())
            if args and isinstance(args[0], tuple) and args[0] and isinstance(args[0][0], int):
                return args[0][0]
    return None


def _sqlserver_errno(*codes: int) -> Matcher:
    """Match a SQL Server error by number, across the cause chain."""
    wanted = frozenset(codes)
    return lambda error: _mssql_number(error) in wanted


SQLSERVER_ERRORS = ErrorPack(
    # Database missing / not accessible MUST be matched before the login rules: SQL
    # Server's 4060 message is "Cannot open database "X" requested by the login. The
    # login failed." - it contains "login failed", so a login-first ordering would
    # misclassify a missing database as an auth failure (confirmed live on pytds).
    # 4060 (cannot open database requested by the login), 911 (database does not exist).
    when(
        Matchers.any_of(
            _sqlserver_errno(4060, 911),
            Matchers.contains("Cannot open database"),
        )
    ).diagnose(
        "Database not found or not accessible",
        fix="Verify the configured database exists and the login is allowed to open it.",
    ),
    # Login failed (auth). SQL Server error 18456; message "Login failed for user".
    when(
        Matchers.any_of(
            _sqlserver_errno(18456),
            Matchers.contains("Login failed"),
        )
    ).diagnose(
        "Authentication failed",
        fix="Check the username and password, and that the login is allowed to connect.",
    ),
    # Permission denied:
    #   229 "The SELECT permission was denied on the object '<t>', database '<d>',
    #       schema '<s>'." - a table/view the GetTables/GetViews steps read.
    #   300 "VIEW SERVER STATE permission was denied on object 'server', database
    #       'master'." and 297 "The user does not have permission to perform this
    #       action." - SQL Server emits this pair together when a login without
    #       VIEW SERVER STATE reads sys.dm_exec_query_stats, which GetQueries does.
    # Only 229 and 300 carry "permission was denied"; 297's text does not, so the
    # number is the only signal that catches the 297 half of that pair.
    # 262 ("<statement> permission denied in database '<d>'") is deliberately absent:
    # it is a statement permission (CREATE DATABASE / CREATE TABLE / SHOWPLAN) and
    # test-connection only ever issues SELECTs, so it cannot fire here.
    when(
        Matchers.any_of(
            _sqlserver_errno(229, 297, 300),
            Matchers.contains("permission was denied"),
        )
    ).diagnose(
        "Insufficient privileges",
        fix="Grant the login SELECT on the objects the failing step reads (and VIEW SERVER STATE for query history).",
    ),
)

MSSQL_ERRORS = SQLSERVER_ERRORS.including(NETWORK_ERRORS)


def get_connection_url(connection: MssqlConnectionConfig) -> str:
    if connection.scheme.value == connection.scheme.mssql_pyodbc.value:
        return get_pyodbc_connection_url(connection)
    return get_connection_url_common(connection)


class MssqlChecks:
    """Test-connection checks for SQL Server (MSSQL)."""

    errors = MSSQL_ERRORS

    # SQL Server system / fixed-role schemas - skipped when auto-selecting a schema
    # to probe, so table/view checks land on a real user schema.
    SYSTEM_SCHEMAS = frozenset(
        {
            "sys",
            "information_schema",
            "guest",
            "db_owner",
            "db_accessadmin",
            "db_securityadmin",
            "db_ddladmin",
            "db_backupoperator",
            "db_datareader",
            "db_datawriter",
            "db_denydatareader",
            "db_denydatawriter",
        }
    )

    def __init__(self, db: Borrowed[Engine], get_databases_statement: str) -> None:
        self._db = db
        self.get_databases_statement = get_databases_statement

    @check(DatabaseStep.CheckAccess)
    def check_access(self) -> Evidence:
        return ping(self._db.client)

    @check(DatabaseStep.GetDatabases)
    def get_databases(self) -> Evidence:
        return run_sql(
            self._db.client,
            self.get_databases_statement,
            lambda rows: enumerated(len(rows), "database", DEFAULT_SAMPLE_ROWS),
        )

    @check(DatabaseStep.GetSchemas)
    def get_schemas(self) -> Evidence:
        return list_schemas(self._db.client)

    @check(DatabaseStep.GetTables)
    def get_tables(self) -> Evidence:
        return list_tables(self._db.client, None, self.SYSTEM_SCHEMAS)

    @check(DatabaseStep.GetViews)
    def get_views(self) -> Evidence:
        return list_views(self._db.client, None, self.SYSTEM_SCHEMAS)

    @check(DatabaseStep.GetQueries)
    def get_queries(self) -> Evidence:
        if is_query_store_enabled(self._db.client):
            query = MSSQL_TEST_GET_QUERIES_FROM_QUERY_STORE
            summary = "query history accessible via Query Store"
        else:
            query = MSSQL_TEST_GET_QUERIES
            summary = "query history accessible via plan-cache DMVs"
        return run_sql(self._db.client, query, lambda _: summary)


class MssqlConnection(BaseConnection[MssqlConnectionConfig, Engine]):
    def _get_client(self) -> Engine:
        engine = create_generic_db_connection(
            connection=self.service_connection,
            get_connection_url_fn=get_connection_url,
            get_connection_args_fn=get_connection_args_common,
        )
        self._on_close(engine.dispose)
        return engine

    def _get_databases_statement(self) -> str:
        if self.service_connection.ingestAllDatabases:
            return MSSQL_GET_DATABASE
        return MSSQL_GET_CURRENT_DATABASE

    def checks(self) -> ChecksProvider:
        return MssqlChecks(
            db=self.borrow(),
            get_databases_statement=self._get_databases_statement(),
        )
