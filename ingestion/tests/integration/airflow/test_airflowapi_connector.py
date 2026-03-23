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
E2E integration test for the AirflowApi REST connector.

Prerequisites:
    Start the local dev environment which runs Airflow 3.x + OpenMetadata:
        docker-compose -f docker/development/docker-compose.yml up

    This gives us:
        - Airflow 3.x REST API at http://localhost:8080
        - OpenMetadata API at http://localhost:8585/api
        - Sample DAGs pre-loaded in the Airflow instance
"""
import time
import uuid
from unittest.mock import patch

import pytest
import requests

from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.data.pipeline import Pipeline
from metadata.generated.schema.entity.services.connections.metadata.openMetadataConnection import (
    OpenMetadataConnection,
)
from metadata.generated.schema.entity.services.pipelineService import (
    PipelineService,
    PipelineServiceType,
)
from metadata.generated.schema.security.client.openMetadataJWTClientConfig import (
    OpenMetadataJWTClientConfig,
)
from metadata.generated.schema.type.entityLineage import EntitiesEdge, LineageDetails
from metadata.generated.schema.type.entityLineage import Source as LineageSource
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.workflow.metadata import MetadataWorkflow

OM_HOST_PORT = "http://localhost:8585/api"
OM_JWT = (
    "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJ0eXAiOiJKV1QiLCJhbGci"
    "OiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlzQm90IjpmYWxzZSwiaXNzIjoib3Blbi1tZXRhZGF0YS5vcm"
    "ciLCJpYXQiOjE2NjM5Mzg0NjIsImVtYWlsIjoiYWRtaW5Ab3Blbm1ldGFkYXRhLm9yZyJ9.tS8um_5DKu7"
    "HgzGBzS1VTA5uUjKWOCU0B_j08WXBiEC0mr0zNREkqVfwFDD-d24HlNEbrqioLsBuFRiwIWKc1m_ZlVQbG7"
    "P36RUxhuv2vbSp80FKyNM-Tj93FDzq91jsyNmsQhyNv_fNr3TXfzzSPjHt8Go0FMMP66weoKMgW2PbXlhVK"
    "wEuXUHyakLLzewm9UMeQaEiRzhiTMU3UkLXcKbYEJJvfNFcLwSl9W8JCO_l0Yj3ud-qt_nQYEZwqW6u5nfd"
    "QllN133iikV4fM5QZsMCnm8Rq1mvLR0y9bmJiD7fwM1tmJ791TUWqmKaTnP49U493VanKpUAfzIiOiIbhg"
)
AIRFLOW_HOST = "http://localhost:8080"
AIRFLOW_USERNAME = "admin"
AIRFLOW_PASSWORD = "admin"


def _airflow_reachable() -> bool:
    try:
        resp = requests.get(f"{AIRFLOW_HOST}/api/v2/version", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def _om_reachable() -> bool:
    try:
        resp = requests.get(f"{OM_HOST_PORT}/v1/system/version", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(
        not _airflow_reachable(),
        reason="Airflow not running at localhost:8080",
    ),
    pytest.mark.skipif(
        not _om_reachable(),
        reason="OpenMetadata not running at localhost:8585",
    ),
]


@pytest.fixture(scope="module")
def metadata():
    server_config = OpenMetadataConnection(
        hostPort=OM_HOST_PORT,
        authProvider="openmetadata",
        securityConfig=OpenMetadataJWTClientConfig(jwtToken=OM_JWT),
    )
    meta = OpenMetadata(server_config)
    assert meta.health_check()
    return meta


@pytest.fixture(scope="module")
def service_name():
    return f"airflowapi_e2e_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def airflow_token():
    """Get a JWT token from Airflow 3.x for Bearer auth."""
    token_url = f"{AIRFLOW_HOST}/auth/token"
    resp = requests.post(
        token_url,
        json={"username": AIRFLOW_USERNAME, "password": AIRFLOW_PASSWORD},
        timeout=10,
    )
    if resp.status_code in (200, 201):
        return resp.json().get("access_token")
    pytest.skip(f"Cannot get Airflow JWT token: {resp.status_code} - {resp.text}")


@pytest.fixture(scope="module")
def trigger_sample_dag(airflow_token):
    """Trigger a sample DAG so we have at least one DAG run for status testing."""
    headers = {
        "Authorization": f"Bearer {airflow_token}",
        "Content-Type": "application/json",
    }
    dags_resp = requests.get(
        f"{AIRFLOW_HOST}/api/v2/dags?limit=5", headers=headers, timeout=10
    )
    if dags_resp.status_code != 200:
        return None

    dags = dags_resp.json().get("dags", [])
    if not dags:
        return None

    dag_id = dags[0]["dag_id"]

    # Unpause
    requests.patch(
        f"{AIRFLOW_HOST}/api/v2/dags/{dag_id}",
        json={"is_paused": False},
        headers=headers,
        timeout=10,
    )

    # Trigger
    from datetime import datetime, timezone

    resp = requests.post(
        f"{AIRFLOW_HOST}/api/v2/dags/{dag_id}/dagRuns",
        json={"logical_date": datetime.now(timezone.utc).isoformat()},
        headers=headers,
        timeout=10,
    )
    if resp.status_code not in (200, 201):
        return None

    dag_run_id = resp.json().get("dag_run_id")

    # Wait for completion
    for _ in range(12):
        time.sleep(5)
        run_resp = requests.get(
            f"{AIRFLOW_HOST}/api/v2/dags/{dag_id}/dagRuns/{dag_run_id}",
            headers=headers,
            timeout=10,
        )
        state = run_resp.json().get("state")
        if state in ("success", "failed"):
            break

    return dag_id


@pytest.fixture(scope="module")
def ingested_service(metadata, service_name, airflow_token, trigger_sample_dag):
    """Run the Airflow REST API ingestion workflow and return the created service."""
    workflow_config = {
        "source": {
            "type": "Airflow",
            "serviceName": service_name,
            "serviceConnection": {
                "config": {
                    "type": "Airflow",
                    "hostPort": AIRFLOW_HOST,
                    "numberOfStatus": 5,
                    "connection": {
                        "token": airflow_token,
                        "apiVersion": "v2",
                        "verifySSL": True,
                    },
                }
            },
            "sourceConfig": {"config": {"type": "PipelineMetadata"}},
        },
        "sink": {"type": "metadata-rest", "config": {}},
        "workflowConfig": {
            "loggerLevel": "DEBUG",
            "openMetadataServerConfig": {
                "hostPort": OM_HOST_PORT,
                "authProvider": "openmetadata",
                "securityConfig": {"jwtToken": OM_JWT},
            },
        },
    }

    # Patch test_connection because it requires Airflow.testConnectionDefinition
    # to be loaded in the OM server. In a full Docker build this works automatically,
    # but for dev/hot-deployed jars the definition may not be present.
    with patch(
        "metadata.ingestion.source.pipeline.pipeline_service.PipelineServiceSource.test_connection"
    ):
        workflow = MetadataWorkflow.create(workflow_config)
    workflow.execute()
    workflow.print_status()
    workflow.stop()

    service = metadata.get_by_name(entity=PipelineService, fqn=service_name)
    yield service

    # Cleanup
    if service:
        metadata.delete(
            entity=PipelineService,
            entity_id=str(service.id.root),
            recursive=True,
            hard_delete=True,
        )


class TestAirflowApiE2E:
    def test_service_created(self, ingested_service):
        assert ingested_service is not None
        assert ingested_service.serviceType == PipelineServiceType.Airflow

    def test_pipelines_ingested(self, metadata, ingested_service):
        pipelines = metadata.list_entities(
            entity=Pipeline,
            params={"service": ingested_service.fullyQualifiedName.root},
        )
        assert pipelines.entities, "Expected at least one pipeline to be ingested"

    def test_pipeline_has_tasks(self, metadata, ingested_service):
        pipelines = metadata.list_entities(
            entity=Pipeline,
            params={"service": ingested_service.fullyQualifiedName.root},
            fields=["tasks"],
        )
        pipelines_with_tasks = [
            p for p in pipelines.entities if p.tasks and len(p.tasks) > 0
        ]
        assert pipelines_with_tasks, "Expected at least one pipeline with tasks"

    def test_pipeline_has_source_url(self, metadata, ingested_service):
        pipelines = metadata.list_entities(
            entity=Pipeline,
            params={"service": ingested_service.fullyQualifiedName.root},
        )
        pipelines_with_url = [p for p in pipelines.entities if p.sourceUrl]
        assert pipelines_with_url, "Expected at least one pipeline with sourceUrl"

        for pipeline in pipelines_with_url:
            assert AIRFLOW_HOST in str(
                pipeline.sourceUrl.root
            ), f"sourceUrl should contain Airflow host: {pipeline.sourceUrl}"

    def test_pipeline_status_ingested(
        self, metadata, ingested_service, trigger_sample_dag
    ):
        if not trigger_sample_dag:
            pytest.skip("No DAG was triggered, cannot test status")

        pipeline = metadata.get_by_name(
            entity=Pipeline,
            fqn=f"{ingested_service.fullyQualifiedName.root}.{trigger_sample_dag}",
            fields=["pipelineStatus"],
        )
        if pipeline is None:
            pytest.skip(f"Pipeline {trigger_sample_dag} not found after ingestion")

        assert (
            pipeline.pipelineStatus is not None
        ), "Expected pipeline status to be ingested for triggered DAG"

    def test_task_source_urls_point_to_airflow(self, metadata, ingested_service):
        pipelines = metadata.list_entities(
            entity=Pipeline,
            params={"service": ingested_service.fullyQualifiedName.root},
            fields=["tasks"],
        )
        for pipeline in pipelines.entities:
            if not pipeline.tasks:
                continue
            for task in pipeline.tasks:
                if task.sourceUrl:
                    assert "/dags/" in str(
                        task.sourceUrl.root
                    ), f"Task sourceUrl should reference a DAG: {task.sourceUrl}"

    def test_openlineage_transport_accepts_events(self, airflow_token):
        """Verify OL events from Airflow are accepted by OM's /v1/openlineage/lineage."""
        resp = requests.post(
            f"http://localhost:8585/api/v1/openlineage/lineage",
            headers={
                "Authorization": f"Bearer {OM_JWT}",
                "Content-Type": "application/json",
            },
            json={
                "eventType": "COMPLETE",
                "eventTime": "2026-03-19T00:00:00Z",
                "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent",
                "producer": "https://airflow.apache.org",
                "run": {"runId": "44444444-4444-4444-4444-444444444444"},
                "job": {"namespace": "airflow_e2e", "name": "sample_etl"},
                "inputs": [],
                "outputs": [],
            },
            timeout=10,
        )
        assert (
            resp.status_code == 200
        ), f"OL endpoint returned {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "success"

    def test_lineage_can_be_added_to_pipeline(
        self, metadata, ingested_service, trigger_sample_dag
    ):
        """Verify lineage edges can be added to AirflowApi-ingested pipelines
        (the path OpenLineage events take once entity resolution succeeds)."""
        if not trigger_sample_dag:
            pytest.skip("No DAG was triggered")

        pipeline = metadata.get_by_name(
            entity=Pipeline,
            fqn=f"{ingested_service.fullyQualifiedName.root}.{trigger_sample_dag}",
        )
        if pipeline is None:
            pytest.skip(f"Pipeline {trigger_sample_dag} not found")

        from metadata.generated.schema.api.data.createDatabase import (
            CreateDatabaseRequest,
        )
        from metadata.generated.schema.api.data.createDatabaseSchema import (
            CreateDatabaseSchemaRequest,
        )
        from metadata.generated.schema.api.data.createTable import CreateTableRequest
        from metadata.generated.schema.api.services.createDatabaseService import (
            CreateDatabaseServiceRequest,
        )
        from metadata.generated.schema.entity.data.table import Column, DataType, Table
        from metadata.generated.schema.entity.services.connections.database.common.basicAuth import (
            BasicAuth,
        )
        from metadata.generated.schema.entity.services.connections.database.postgresConnection import (
            PostgresConnection,
        )
        from metadata.generated.schema.entity.services.databaseService import (
            DatabaseConnection,
            DatabaseService,
            DatabaseServiceType,
        )

        svc_name = f"ol_lineage_test_{uuid.uuid4().hex[:8]}"
        svc = metadata.create_or_update(
            CreateDatabaseServiceRequest(
                name=svc_name,
                serviceType=DatabaseServiceType.Postgres,
                connection=DatabaseConnection(
                    config=PostgresConnection(
                        username="test",
                        authType=BasicAuth(password="test"),
                        hostPort="localhost:5432",
                        database="testdb",
                    )
                ),
            )
        )
        db = metadata.create_or_update(
            CreateDatabaseRequest(name="testdb", service=svc.fullyQualifiedName)
        )
        schema = metadata.create_or_update(
            CreateDatabaseSchemaRequest(name="public", database=db.fullyQualifiedName)
        )
        src = metadata.create_or_update(
            CreateTableRequest(
                name="ol_source",
                databaseSchema=schema.fullyQualifiedName,
                columns=[Column(name="id", dataType=DataType.INT)],
            )
        )
        tgt = metadata.create_or_update(
            CreateTableRequest(
                name="ol_target",
                databaseSchema=schema.fullyQualifiedName,
                columns=[Column(name="id", dataType=DataType.INT)],
            )
        )

        try:
            metadata.add_lineage(
                AddLineageRequest(
                    edge=EntitiesEdge(
                        fromEntity=EntityReference(id=src.id.root, type="table"),
                        toEntity=EntityReference(id=tgt.id.root, type="table"),
                        lineageDetails=LineageDetails(
                            pipeline=EntityReference(
                                id=pipeline.id.root, type="pipeline"
                            ),
                            source=LineageSource.OpenLineage,
                        ),
                    )
                )
            )

            # Verify lineage from source table (downstream)
            lineage = metadata.get_lineage_by_name(
                entity=Table,
                fqn=src.fullyQualifiedName.root,
                up_depth=0,
                down_depth=2,
            )
            downstream = lineage.get("downstreamEdges", [])
            assert (
                len(downstream) == 1
            ), f"Expected 1 downstream edge, got {len(downstream)}"

            edge = downstream[0]
            assert edge["fromEntity"] == str(src.id.root)
            assert edge["toEntity"] == str(tgt.id.root)

            details = edge.get("lineageDetails", {})
            assert (
                details["source"] == "OpenLineage"
            ), f"Lineage source should be OpenLineage, got {details.get('source')}"

            edge_pipeline = details.get("pipeline", {})
            assert edge_pipeline["id"] == str(
                pipeline.id.root
            ), "Lineage edge should reference the AirflowApi pipeline"
            assert edge_pipeline["type"] == "pipeline"
            assert trigger_sample_dag in edge_pipeline.get(
                "fullyQualifiedName", ""
            ), f"Pipeline FQN should contain DAG id, got {edge_pipeline}"

            nodes = lineage.get("nodes", [])
            node_fqns = [n.get("fullyQualifiedName", "") for n in nodes]
            assert any(
                "ol_target" in fqn for fqn in node_fqns
            ), f"Target table should be in lineage nodes, got: {node_fqns}"

            # Verify lineage from pipeline perspective (up + down)
            pipeline_lineage = metadata.get_lineage_by_name(
                entity=Pipeline,
                fqn=pipeline.fullyQualifiedName.root,
                up_depth=2,
                down_depth=2,
            )
            assert (
                len(pipeline_lineage.get("upstreamEdges", [])) >= 1
            ), "Pipeline should have upstream edge (source table)"
            assert (
                len(pipeline_lineage.get("downstreamEdges", [])) >= 1
            ), "Pipeline should have downstream edge (target table)"
            pipeline_node_fqns = [
                n.get("fullyQualifiedName", "")
                for n in pipeline_lineage.get("nodes", [])
            ]
            assert any(
                "ol_source" in fqn for fqn in pipeline_node_fqns
            ), f"Source table missing from pipeline lineage: {pipeline_node_fqns}"
            assert any(
                "ol_target" in fqn for fqn in pipeline_node_fqns
            ), f"Target table missing from pipeline lineage: {pipeline_node_fqns}"
        finally:
            metadata.delete(
                entity=DatabaseService,
                entity_id=str(svc.id.root),
                recursive=True,
                hard_delete=True,
            )
