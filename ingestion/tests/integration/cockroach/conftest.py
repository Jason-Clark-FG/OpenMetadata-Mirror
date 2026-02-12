import os
import textwrap
import uuid

import pytest
from sqlalchemy import create_engine

from _openmetadata_testutils.helpers.docker import try_bind
from metadata.generated.schema.api.services.createDatabaseService import (
    CreateDatabaseServiceRequest,
)
from metadata.generated.schema.entity.services.connections.database.cockroachConnection import (
    CockroachConnection,
)
from metadata.generated.schema.entity.services.databaseService import (
    DatabaseConnection,
    DatabaseServiceType,
)


@pytest.fixture(scope="module")
def cockroach_container():
    """
    Start a Cockroach container.
    """
    from testcontainers.cockroachdb import CockroachDBContainer
    from testcontainers.core.config import testcontainers_config

    old_max_tries = testcontainers_config.max_tries
    testcontainers_config.max_tries = 240

    container = CockroachDBContainer(image="cockroachdb/cockroach:v23.1.0")

    with (
        try_bind(container, 26257, None) if not os.getenv("CI") else container
    ) as container:
        testcontainers_config.max_tries = old_max_tries
        engine = create_engine(container.get_connection_url())
        engine.execute(
            textwrap.dedent(
                """
                CREATE TABLE user_profiles (
                    user_id UUID PRIMARY KEY,
                    first_name TEXT,
                    last_name TEXT,
                    email TEXT,
                    signup_date TIMESTAMP,
                    is_active BOOLEAN
                );
                """
            )
        )

        yield container


@pytest.fixture(scope="module")
def create_service_request(cockroach_container):
    return CreateDatabaseServiceRequest(
        name=f"docker_test_cockroach_{uuid.uuid4().hex[:8]}",
        serviceType=DatabaseServiceType.Cockroach,
        connection=DatabaseConnection(
            config=CockroachConnection(
                username=cockroach_container.username,
                authType={"password": cockroach_container.password},
                hostPort=f"localhost:{cockroach_container.get_exposed_port(26257)}",
                database=cockroach_container.dbname,
            )
        ),
    )
