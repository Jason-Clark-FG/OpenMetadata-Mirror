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
"""Unit tests for the MSSQL BaseConnection wiring.

URL building (including the pyodbc delegation to azuresql) is covered in
tests/unit/test_source_url.py and tests/unit/test_source_connection.py.
"""

import socket
from unittest.mock import MagicMock, patch

import pyodbc
import pytest
from pytds.tds_base import Message, _create_exception_by_message
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError as SqlAlchemyOperationalError
from sqlalchemy.pool import StaticPool

from metadata.core.connections.lifetime import Borrowed
from metadata.core.connections.test_connection import Matchers, collect_checks
from metadata.core.connections.test_connection.checks.database import DEFAULT_SAMPLE_ROWS, DatabaseStep
from metadata.core.connections.test_connection.runner import TestConnectionRunner
from metadata.generated.schema.entity.services.connections.database.mssqlConnection import (
    MssqlConnection as MssqlConnectionConfig,
)
from metadata.generated.schema.entity.services.connections.database.mssqlConnection import (
    MssqlScheme,
)
from metadata.generated.schema.entity.services.connections.testConnectionDefinition import (
    Category,
    TestConnectionDefinition,
    TestConnectionStep,
)
from metadata.generated.schema.entity.services.connections.testConnectionResult import (
    TestConnectionResult,
)
from metadata.ingestion.connections.connection import BaseConnection
from metadata.ingestion.source.database.mssql.connection import (
    MSSQL_ERRORS,
    MssqlChecks,
    MssqlConnection,
    _mssql_number,
    get_connection_url,
)
from metadata.ingestion.source.database.mssql.queries import (
    MSSQL_GET_CURRENT_DATABASE,
    MSSQL_GET_DATABASE,
)

CONNECTION_MODULE = "metadata.ingestion.source.database.mssql.connection"


def _config(scheme: MssqlScheme = MssqlScheme.mssql_pytds) -> MssqlConnectionConfig:
    return MssqlConnectionConfig(
        scheme=scheme,
        username="user",
        password="pass",
        hostPort="myhost:1433",
        database="mydb",
    )


def test_mssql_connection_is_base_connection():
    assert issubclass(MssqlConnection, BaseConnection)


def test_get_client_uses_the_module_url_builder():
    with patch(f"{CONNECTION_MODULE}.create_generic_db_connection") as mock_connection:
        _ = MssqlConnection(_config()).client
    assert mock_connection.call_args.kwargs["get_connection_url_fn"].__name__ == "get_connection_url"


def test_pyodbc_scheme_delegates_to_azuresql_url_builder():
    with patch(f"{CONNECTION_MODULE}.get_pyodbc_connection_url", return_value="delegated") as mock_pyodbc:
        result = get_connection_url(_config(scheme=MssqlScheme.mssql_pyodbc))
    mock_pyodbc.assert_called_once()
    assert result == "delegated"


def test_non_pyodbc_scheme_uses_common_url_builder():
    url = get_connection_url(_config(scheme=MssqlScheme.mssql_pytds))
    assert url.startswith("mssql+pytds://")


def _checks() -> MssqlChecks:
    return MssqlChecks(db=Borrowed.of(MagicMock()), get_databases_statement="SELECT 1")


def test_every_definition_step_resolves_to_a_check():
    collected = collect_checks(_checks())
    assert set(collected) == {
        DatabaseStep.CheckAccess,
        DatabaseStep.GetDatabases,
        DatabaseStep.GetSchemas,
        DatabaseStep.GetTables,
        DatabaseStep.GetViews,
        DatabaseStep.GetQueries,
    }


def test_close_disposes_the_engine():
    with patch(f"{CONNECTION_MODULE}.create_generic_db_connection"):
        connection = MssqlConnection(_config())
        engine = connection.client
        connection.close()
    engine.dispose.assert_called_once()


def test_building_checks_does_not_touch_the_network():
    with patch(f"{CONNECTION_MODULE}.create_generic_db_connection") as mock_engine:
        provider = MssqlConnection(_config()).checks()
    engine = mock_engine.return_value
    engine.connect.assert_not_called()
    engine.exec_driver_sql.assert_not_called()
    assert isinstance(provider, MssqlChecks)


def test_get_databases_statement_uses_current_db_when_not_ingest_all():
    config = _config()
    config.ingestAllDatabases = False
    handler = MssqlConnection(config)
    handler._client = MagicMock()
    assert handler._get_databases_statement() == MSSQL_GET_CURRENT_DATABASE


def test_get_databases_statement_uses_all_dbs_when_ingest_all():
    config = _config()
    config.ingestAllDatabases = True
    handler = MssqlConnection(config)
    handler._client = MagicMock()
    assert handler._get_databases_statement() == MSSQL_GET_DATABASE


# ── Driver error fixtures ────────────────────────────────────────────────────
#
# Each shape below is the one its driver really produces; the previous fixtures
# fabricated `Exception(number, message)`, a shape no supported driver raises, and
# embedded the message token in the wrapper text, so every test passed on the
# message rule alone and the error numbers were never exercised.


def _pytds_error(number: int, message: str) -> Exception:
    """A real pytds driver error, built by the driver's own exception factory.

    pytds is the default scheme (mssql+pytds). Going through
    ``_create_exception_by_message`` rather than hand-rolling means the shape is
    the driver's by construction: ``args[0]`` is the message and the number lands
    on ``.number``/``.msg_no`` (pytds/tds_base.py, ``_create_exception_by_message``).
    """
    message_record: Message = {
        "marker": 0xAA,
        "msgno": number,
        "state": 1,
        "severity": 16,
        "sql_state": None,
        "priv_msg_type": 0,
        "message": message,
        "server": "sql1",
        "proc_name": "",
        "line_number": 1,
    }
    return _create_exception_by_message(message_record)


def _pymssql_error(number: int, message: str) -> Exception:
    """A pymssql-style DBAPI error: ``args[0]`` is the ``(number, message)`` tuple.

    Hand-rolled because pymssql ships in its own extra and is not installed here.
    Shape verified against pymssql v2.3.9 source: ``_mssql.pyx`` raises
    ``MSSQLDatabaseException((get_last_msg_no(conn), error_msg))``, and
    ``_pymssql.pyx``'s ``connect()`` converts it with
    ``raise OperationalError(e.args[0])`` - so the tuple, not the number, becomes
    the DBAPI error's ``args[0]``, and ``.number`` does not survive the conversion.
    """
    return Exception((number, message))


def _pyodbc_error(sqlstate: str, message: str) -> Exception:
    """A real pyodbc error class: ``args`` is ``(sqlstate, message)``.

    pyodbc builds this tuple in ``GetError`` (src/errors.cpp): SQLSTATE at index 0,
    message at index 1. The SQL Server number appears only inside the message text,
    e.g. "... The login failed. (4060) (SQLDriverConnect)".
    """
    return pyodbc.ProgrammingError(sqlstate, f"[{sqlstate}] [Microsoft][ODBC Driver 18 for SQL Server]{message}")


def _wrapped(orig: Exception) -> Exception:
    """The driver error as SQLAlchemy re-raises it: original preserved on ``.orig``."""
    return SqlAlchemyOperationalError("SELECT 1", {}, orig)


def test_matchers_errno_cannot_read_any_supported_driver():
    """Why this connector needs its own accessor. Matchers.errno requires an int at
    args[0]; pytds puts the message there, pymssql a tuple, pyodbc a SQLSTATE
    string. Guards against a well-meaning revert to the generic matcher."""
    assert not Matchers.errno(18456)(_pytds_error(18456, "Login failed for user 'x'."))
    assert not Matchers.errno(18456)(_pymssql_error(18456, "Login failed for user 'x'."))
    assert not Matchers.errno(4060)(_pyodbc_error("42000", "Cannot open database."))


def test_mssql_number_reads_each_driver_shape():
    assert _mssql_number(_pytds_error(18456, "Login failed for user 'x'.")) == 18456
    assert _mssql_number(_pymssql_error(4060, "Cannot open database.")) == 4060
    assert _mssql_number(_wrapped(_pytds_error(229, "The SELECT permission was denied."))) == 229
    # pyodbc carries no number anywhere the accessor can reach.
    assert _mssql_number(_pyodbc_error("42000", "Cannot open database. (4060)")) is None
    assert _mssql_number(Exception("no number here")) is None


# SQL Server localizes message text but never the error number. These messages are
# the German equivalents, so nothing in them can satisfy the English `contains`
# rules - the diagnosis can only come from the number. This is what proves the
# codes are actually bound: with the number accessor removed, every one of these
# falls through to None.
@pytest.mark.parametrize(
    ("number", "localized_message", "title"),
    [
        (4060, 'Die Datenbank "x" kann nicht geöffnet werden.', "Database not found or not accessible"),
        (911, 'Die Datenbank "x" ist nicht vorhanden.', "Database not found or not accessible"),
        (18456, "Fehler bei der Anmeldung für den Benutzer 'y'.", "Authentication failed"),
        (229, "Die SELECT-Berechtigung wurde für das Objekt 'x' verweigert.", "Insufficient privileges"),
        (297, "Der Benutzer hat keine Berechtigung zum Ausführen dieser Aktion.", "Insufficient privileges"),
        (300, "Die VIEW SERVER STATE-Berechtigung wurde verweigert.", "Insufficient privileges"),
    ],
)
def test_error_numbers_classify_independently_of_message_text(number, localized_message, title):
    diagnosis = MSSQL_ERRORS.classify(_wrapped(_pytds_error(number, localized_message)))
    assert diagnosis is not None, f"error {number} is unbound: no rule matched"
    assert diagnosis.title == title


def test_pymssql_tuple_shape_classifies_by_number():
    diagnosis = MSSQL_ERRORS.classify(_wrapped(_pymssql_error(18456, "Fehler bei der Anmeldung.")))
    assert diagnosis is not None
    assert diagnosis.title == "Authentication failed"


def test_pytds_login_failure_classifies_as_auth():
    diagnosis = MSSQL_ERRORS.classify(_wrapped(_pytds_error(18456, "Login failed for user 'x'.")))
    assert diagnosis is not None
    assert diagnosis.title == "Authentication failed"


def test_pyodbc_login_failure_classifies_as_auth_on_message_text():
    # pyodbc exposes no number, so this rides the `Login failed` message rule.
    diagnosis = MSSQL_ERRORS.classify(_pyodbc_error("28000", "Login failed for user 'x'."))
    assert diagnosis is not None
    assert diagnosis.title == "Authentication failed"


def test_pytds_database_not_found_classifies():
    diagnosis = MSSQL_ERRORS.classify(_wrapped(_pytds_error(4060, 'Cannot open database "x" requested by the login.')))
    assert diagnosis is not None
    assert diagnosis.title == "Database not found or not accessible"


def test_pyodbc_cannot_open_database_classifies():
    diagnosis = MSSQL_ERRORS.classify(_pyodbc_error("42000", 'Cannot open database "x" requested by the login.'))
    assert diagnosis is not None
    assert diagnosis.title == "Database not found or not accessible"


def test_cannot_open_database_wins_over_login_failed():
    """The SQL Server 4060 message embeds 'The login failed.', so the database
    rule must be ordered before the login rule (regression for live-found bug).

    pytds makes this sharper than the message alone: on a 4060 it joins every
    server message into the text, so the real error reads "Cannot open database
    ... The login failed." followed by "Login failed for user ..."
    (pytds/tds_session.py, ``raise_db_exception``).
    """
    joined = "Cannot open database \"x\" requested by the login. The login failed. Login failed for user 'y'."
    assert MSSQL_ERRORS.classify(_wrapped(_pytds_error(4060, joined))).title == "Database not found or not accessible"


def test_pytds_permission_denied_classifies():
    error = _wrapped(_pytds_error(229, "The SELECT permission was denied on the object 'x'."))
    diagnosis = MSSQL_ERRORS.classify(error)
    assert diagnosis is not None
    assert diagnosis.title == "Insufficient privileges"


def test_pyodbc_permission_denied_classifies():
    diagnosis = MSSQL_ERRORS.classify(_pyodbc_error("42000", "The SELECT permission was denied on the object 'x'."))
    assert diagnosis is not None
    assert diagnosis.title == "Insufficient privileges"


def test_statement_permission_denied_is_not_diagnosed():
    """262 is a statement permission (CREATE DATABASE / CREATE TABLE / SHOWPLAN).
    test-connection only issues SELECTs, so it must not be claimed here - and its
    real text says "permission denied", not "permission was denied", so it does not
    fall into the message rule either."""
    error = _wrapped(_pytds_error(262, "CREATE DATABASE permission denied in database 'master'."))
    assert MSSQL_ERRORS.classify(error) is None


def test_network_pack_is_folded_in():
    diagnosis = MSSQL_ERRORS.classify(socket.gaierror("Name or service not known"))
    assert diagnosis is not None
    assert diagnosis.title == "Host could not be resolved"


def test_unknown_error_is_not_classified():
    assert MSSQL_ERRORS.classify(Exception("something unexpected")) is None


# ── API level: TestConnectionRunner.run() -> TestConnectionResult ────────────
#
# The product surface. Everything above asserts on the pack in isolation; these
# drive the runner end to end against an engine that raises a real pytds error and
# assert on the TestConnectionResult the backend and UI actually consume.


def _step(name: str, mandatory: bool, category: Category | None = None) -> TestConnectionStep:
    # description is required by the schema but the runner never reads it.
    return TestConnectionStep(
        name=name,
        description=name,
        mandatory=mandatory,
        shortCircuit=category is Category.ConnectionGate,
        category=category,
    )


def _mssql_definition() -> TestConnectionDefinition:
    """The MSSQL definition as shipped.

    Step names, order, gate category and mandatory flags are taken from
    openmetadata-service/src/main/resources/json/data/testConnections/database/
    mssql.json - the file the server seeds and the runner fetches at run time - so
    this exercises the real production shape.
    """
    return TestConnectionDefinition(
        name="Mssql",
        steps=[
            _step("CheckAccess", mandatory=True, category=Category.ConnectionGate),
            _step("GetDatabases", mandatory=True),
            _step("GetSchemas", mandatory=True),
            _step("GetTables", mandatory=True),
            _step("GetViews", mandatory=False),
            _step("GetQueries", mandatory=False),
        ],
    )


def _run_against(engine) -> TestConnectionResult:
    """Drive the runner exactly as BaseConnection.test_connection does.

    tcp_probe is stubbed so the CheckAccess preflight passes and the test reaches
    the driver error under test - reachability itself is covered by the network
    module's own tests, and a real socket here would be slow and non-deterministic.
    """
    metadata = MagicMock()
    metadata.get_by_name.return_value = _mssql_definition()
    checks = MssqlChecks(db=Borrowed.of(engine), get_databases_statement="SELECT 1")
    with patch("metadata.core.connections.test_connection.network.tcp_probe"):
        return TestConnectionRunner(checks, "Mssql", timeout_seconds=None).run(metadata)


def _engine_failing_with(error: Exception) -> Engine:
    """A real mssql+pytds Engine whose DBAPI connect raises `error`.

    Real rather than mocked on purpose: SQLAlchemy then does the wrapping itself,
    so the classifier sees exactly the production shape - a
    sqlalchemy.exc.OperationalError carrying the driver error on `.orig` - instead
    of a shape the test author imagined. It also gives the CheckAccess preflight a
    genuine url.host/url.port to read.
    """

    def connect_raises():
        raise error

    return create_engine("mssql+pytds://user:pass@sql1.example.com:1433/mydb", creator=connect_raises)


def test_bad_login_fails_the_whole_test_with_an_auth_diagnosis():
    result = _run_against(_engine_failing_with(_pytds_error(18456, "Login failed for user 'x'.")))

    assert result.status.value == "Failed"
    gate = result.steps[0]
    assert gate.name == "CheckAccess"
    assert gate.passed is False
    assert gate.status.value == "Failed"
    assert gate.diagnosis.title == "Authentication failed"
    assert gate.diagnosis.remediation


def test_a_failed_gate_short_circuits_every_later_step():
    result = _run_against(_engine_failing_with(_pytds_error(18456, "Login failed for user 'x'.")))

    later = result.steps[1:]
    assert [step.status.value for step in later] == ["Skipped"] * 5
    assert {step.skipReason.value for step in later} == {"ConnectionNotEstablished"}


def test_missing_database_is_reported_as_a_database_problem_not_an_auth_one():
    """4060's real text embeds "The login failed.", so this is the case a naive
    message-ordering gets wrong; it must reach the user as a database diagnosis."""
    joined = "Cannot open database \"x\" requested by the login. The login failed. Login failed for user 'y'."
    result = _run_against(_engine_failing_with(_pytds_error(4060, joined)))

    assert result.status.value == "Failed"
    assert result.steps[0].diagnosis.title == "Database not found or not accessible"


def test_localized_server_still_produces_a_diagnosis_at_the_api_level():
    """End-to-end proof the number, not the English text, drives the diagnosis."""
    result = _run_against(_engine_failing_with(_pytds_error(18456, "Fehler bei der Anmeldung.")))

    assert result.steps[0].diagnosis.title == "Authentication failed"


def test_an_unclassified_failure_still_reports_its_raw_error_log():
    result = _run_against(_engine_failing_with(RuntimeError("something we have never seen")))

    gate = result.steps[0]
    assert gate.passed is False
    assert gate.diagnosis is None
    assert "something we have never seen" in gate.errorLog


def _engine_returning(rows: int) -> Engine:
    """A real engine whose probe statement returns ``rows`` rows."""
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    with engine.connect() as connection:
        connection.exec_driver_sql("CREATE TABLE probe (name TEXT)")
        for index in range(rows):
            connection.exec_driver_sql(f"INSERT INTO probe VALUES ('db{index}')")
        connection.commit()
    return engine


def _databases_summary(rows: int) -> str:
    checks = MssqlChecks(db=Borrowed.of(_engine_returning(rows)), get_databases_statement="SELECT name FROM probe")
    return collect_checks(checks)[DatabaseStep.GetDatabases]().summary


def test_get_databases_counts_the_databases_it_found():
    assert _databases_summary(3) == "3 databases enumerated"


def test_get_databases_reports_a_floor_when_the_sample_is_capped():
    assert _databases_summary(DEFAULT_SAMPLE_ROWS) == f"{DEFAULT_SAMPLE_ROWS}+ databases enumerated"
