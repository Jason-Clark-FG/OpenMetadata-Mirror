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
import os
import tarfile
import time

import pytest
import requests
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs

from metadata.generated.schema.api.services.createDatabaseService import (
    CreateDatabaseServiceRequest,
)
from metadata.generated.schema.entity.services.connections.database.pinotDBConnection import (
    PinotDBConnection,
    PinotDBScheme,
)
from metadata.generated.schema.entity.services.databaseService import (
    DatabaseConnection,
    DatabaseService,
    DatabaseServiceType,
)

PINOT_IMAGE = "apachepinot/pinot:1.2.0"
CONTROLLER_PORT = 9000
BROKER_PORT = 8099


def _archive_dir(src_dir: str) -> bytes:
    """Return an in-memory tar archive of all files in src_dir."""
    import io

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name in os.listdir(src_dir):
            tar.add(os.path.join(src_dir, name), arcname=name)
    buf.seek(0)
    return buf.read()


def _wait_for_controller(host: str, port: int, timeout: int = 300) -> None:
    """Poll the Pinot controller health endpoint until it responds OK."""
    deadline = time.time() + timeout
    url = f"http://{host}:{port}/health"
    while time.time() < deadline:
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200 and "OK" in resp.text:
                return
        except Exception:
            pass
        time.sleep(5)
    raise TimeoutError(f"Pinot controller at {url} did not become healthy in time")


def _wait_for_broker(host: str, port: int, timeout: int = 120) -> None:
    """Poll the Pinot broker until it accepts connections."""
    deadline = time.time() + timeout
    url = f"http://{host}:{port}/health"
    while time.time() < deadline:
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(5)
    raise TimeoutError(f"Pinot broker at {url} did not become ready in time")


def _wait_for_table_data(
    host: str, port: int, table: str, expected_count: int, timeout: int = 120
) -> None:
    """Poll until the given table has at least expected_count rows."""
    deadline = time.time() + timeout
    url = f"http://{host}:{port}/query/sql"
    while time.time() < deadline:
        try:
            resp = requests.post(
                url,
                json={"sql": f"SELECT COUNT(*) FROM {table}"},
                timeout=10,
            )
            data = resp.json()
            rows = data.get("resultTable", {}).get("rows", [])
            if rows and rows[0][0] >= expected_count:
                return
        except Exception:
            pass
        time.sleep(5)
    raise TimeoutError(
        f"Table {table} did not reach {expected_count} rows on broker {url}"
    )


@pytest.fixture(scope="session")
def pinot_container():
    base_dir = os.path.dirname(__file__)
    scripts_dir = os.path.join(base_dir, "scripts")
    schemas_dir = os.path.join(base_dir, "schemas")
    data_dir = os.path.join(base_dir, "data")

    container = (
        DockerContainer(PINOT_IMAGE, entrypoint=["/scripts/entrypoint.sh"])
        .with_volume_mapping(scripts_dir, "/scripts")
        .with_volume_mapping(schemas_dir, "/schemas")
        .with_volume_mapping(data_dir, "/data")
        .with_exposed_ports(BROKER_PORT, CONTROLLER_PORT)
        .with_env(
            "JAVA_OPTS",
            "-Dplugins.dir=/opt/pinot/plugins -Xms512M -Xmx1G -XX:+UseG1GC -XX:MaxGCPauseMillis=200",
        )
    )
    with container as server:
        wait_for_logs(server, r"\[HttpServer\] Started", timeout=120)
        yield server


@pytest.fixture(scope="session")
def pinot_cluster(
    pinot_container,
):
    """Yield a dict with host/port info for the running Pinot cluster."""
    host = pinot_container.get_container_host_ip()
    ctrl_port = int(pinot_container.get_exposed_port(CONTROLLER_PORT))
    broker_port = int(pinot_container.get_exposed_port(BROKER_PORT))
    yield {
        "controller_host": host,
        "controller_port": ctrl_port,
        "broker_host": host,
        "broker_port": broker_port,
    }


@pytest.fixture(scope="session")
def load_pinot_data(pinot_cluster, pinot_container):
    """
    Create schemas, tables, and upload segments into the Pinot cluster.

    We copy the schema files, table configs, CSV data, and init scripts into
    the controller container and run the init script there (the controller
    container has the pinot-admin.sh tooling).
    """
    _wait_for_controller(
        pinot_cluster["controller_host"], pinot_cluster["controller_port"]
    )
    _wait_for_broker(pinot_cluster["broker_host"], pinot_cluster["broker_port"])

    docker_container = pinot_container.get_wrapped_container()

    # Run initialization - this creates schemas, tables, and loads data
    res = docker_container.exec_run(["/scripts/init-tables.sh"])
    output = res[1].decode("utf-8", errors="replace")
    assert res[0] == 0, f"init-tables.sh failed:\n{output}"

    # Wait for data to be available on the broker
    broker_host = pinot_cluster["broker_host"]
    broker_port = pinot_cluster["broker_port"]
    for table, expected_count in [
        ("financial_transactions", 5),
        ("profiler_test_table", 50),
        ("numeric_profiler_test", 60),
        ("partitioned_test", 80),
    ]:
        _wait_for_table_data(broker_host, broker_port, table, expected_count)

    yield pinot_cluster


@pytest.fixture(scope="module")
def create_service_request(load_pinot_data, tmp_path_factory):
    broker_host = load_pinot_data["broker_host"]
    broker_port = load_pinot_data["broker_port"]
    controller_host = load_pinot_data["controller_host"]
    controller_port = load_pinot_data["controller_port"]

    return CreateDatabaseServiceRequest(
        name="docker_test_" + tmp_path_factory.mktemp("pinotdb").name,
        serviceType=DatabaseServiceType.PinotDB,
        connection=DatabaseConnection(
            config=PinotDBConnection(
                scheme=PinotDBScheme.pinot_http,
                hostPort=f"{broker_host}:{broker_port}",
                pinotControllerHost=f"http://{controller_host}:{controller_port}",
            )
        ),
    )


@pytest.fixture(scope="module")
def unmask_password():
    def patch_password(service: DatabaseService):
        return service

    return patch_password
