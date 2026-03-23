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
Full E2E integration test: AirflowApi connector + OpenLineage lineage.

Simulates the complete production flow:
  1. AirflowApi connector ingests DAGs from Airflow 3.x
  2. Airflow sends OpenLineage COMPLETE events (simulated via HTTP POST)
  3. OM resolves OL datasets to existing tables and creates lineage edges
  4. Lineage edges reference tables and are queryable from both table and pipeline

Prerequisites:
    - OM server running at localhost:8585 with sample data ingested
    - Airflow 3.x running at localhost:8080 with DAGs
"""
import json
import time
import uuid
from unittest.mock import patch

import pytest
import requests

from metadata.generated.schema.entity.data.pipeline import Pipeline
from metadata.generated.schema.entity.data.table import Table
from metadata.generated.schema.entity.services.connections.metadata.openMetadataConnection import (
    OpenMetadataConnection,
)
from metadata.generated.schema.entity.services.pipelineService import PipelineService
from metadata.generated.schema.security.client.openMetadataJWTClientConfig import (
    OpenMetadataJWTClientConfig,
)
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.workflow.metadata import MetadataWorkflow

OM_HOST = "http://localhost:8585"
OM_API = f"{OM_HOST}/api"
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
AUTH_HEADERS = {"Authorization": f"Bearer {OM_JWT}", "Content-Type": "application/json"}
OL_ENDPOINT = f"{OM_HOST}/api/v1/openlineage/lineage"


def _airflow_reachable():
    try:
        return (
            requests.get(f"{AIRFLOW_HOST}/api/v2/version", timeout=5).status_code == 200
        )
    except Exception:
        return False


def _om_reachable():
    try:
        return requests.get(f"{OM_API}/v1/system/version", timeout=5).status_code == 200
    except Exception:
        return False


def _sample_data_exists():
    try:
        return (
            requests.get(
                f"{OM_API}/v1/tables/name/sample_data.ecommerce_db.shopify.raw_order",
                headers=AUTH_HEADERS,
                timeout=5,
            ).status_code
            == 200
        )
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(not _airflow_reachable(), reason="Airflow not running"),
    pytest.mark.skipif(not _om_reachable(), reason="OM not running"),
    pytest.mark.skipif(not _sample_data_exists(), reason="Sample data not ingested"),
]


@pytest.fixture(scope="module")
def metadata():
    meta = OpenMetadata(
        OpenMetadataConnection(
            hostPort=OM_API,
            authProvider="openmetadata",
            securityConfig=OpenMetadataJWTClientConfig(jwtToken=OM_JWT),
        )
    )
    assert meta.health_check()
    return meta


@pytest.fixture(scope="module")
def airflow_token():
    resp = requests.post(
        f"{AIRFLOW_HOST}/auth/token",
        json={"username": "admin", "password": "admin"},
        timeout=10,
    )
    if resp.status_code in (200, 201):
        return resp.json().get("access_token")
    pytest.skip(f"Cannot get Airflow token: {resp.status_code}")


@pytest.fixture(scope="module")
def service_name():
    return f"airflowapi_full_e2e_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def ingested_pipelines(metadata, service_name, airflow_token):
    """Step 1: Run AirflowApi connector to ingest DAGs as pipelines."""
    workflow_config = {
        "source": {
            "type": "airflowapi",
            "serviceName": service_name,
            "serviceConnection": {
                "config": {
                    "type": "AirflowApi",
                    "hostPort": AIRFLOW_HOST,
                    "token": airflow_token,
                    "apiVersion": "v2",
                    "numberOfStatus": 5,
                }
            },
            "sourceConfig": {"config": {"type": "PipelineMetadata"}},
        },
        "sink": {"type": "metadata-rest", "config": {}},
        "workflowConfig": {
            "loggerLevel": "INFO",
            "openMetadataServerConfig": {
                "hostPort": OM_API,
                "authProvider": "openmetadata",
                "securityConfig": {"jwtToken": OM_JWT},
            },
        },
    }

    # Patch test_connection: requires AirflowApi.testConnectionDefinition in the server.
    # Works in full Docker builds; needs patch for dev/hot-deployed jars.
    with patch(
        "metadata.ingestion.source.pipeline.pipeline_service.PipelineServiceSource.test_connection"
    ):
        workflow = MetadataWorkflow.create(workflow_config)
    workflow.execute()
    workflow.stop()

    service = metadata.get_by_name(entity=PipelineService, fqn=service_name)
    assert service is not None, "AirflowApi service should be created"

    pipelines = metadata.list_entities(
        entity=Pipeline,
        params={"service": service.fullyQualifiedName.root},
        fields=["tasks"],
    )
    assert pipelines.entities, "Should have ingested at least one pipeline"

    yield {
        "service": service,
        "pipelines": {p.name.root: p for p in pipelines.entities},
    }

    metadata.delete(
        entity=PipelineService,
        entity_id=str(service.id.root),
        recursive=True,
        hard_delete=True,
    )


def _send_ol_event(job_namespace, job_name, inputs, outputs, run_id=None):
    event = {
        "eventType": "COMPLETE",
        "eventTime": "2026-03-23T12:00:00Z",
        "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent",
        "producer": "https://airflow.apache.org",
        "run": {"runId": run_id or str(uuid.uuid4())},
        "job": {"namespace": job_namespace, "name": job_name},
        "inputs": inputs,
        "outputs": outputs,
    }
    resp = requests.post(OL_ENDPOINT, headers=AUTH_HEADERS, json=event, timeout=10)
    return resp.json()


class TestFullE2EAirflowApiWithOpenLineage:
    """
    Full production flow:
      1. AirflowApi connector ingests DAGs → pipelines in OM
      2. Simulate OpenLineage COMPLETE events (as Airflow 3.x OL provider would)
      3. Verify lineage edges created between existing sample_data tables
      4. Verify lineage is queryable from both table and pipeline perspectives
    """

    def test_step1_pipelines_ingested_with_tasks(self, ingested_pipelines):
        """AirflowApi connector extracted DAGs with tasks."""
        pipelines = ingested_pipelines["pipelines"]
        assert len(pipelines) >= 1

        has_tasks = any(p.tasks and len(p.tasks) > 0 for p in pipelines.values())
        assert has_tasks, "At least one pipeline should have tasks"

    def test_step2_openlineage_event_creates_lineage(self, ingested_pipelines):
        """Simulate an OL COMPLETE event from a BigQuery operator.
        The OL mapper should resolve datasets to existing sample_data tables
        and create a lineage edge."""
        result = _send_ol_event(
            job_namespace="airflow_full_e2e",
            job_name="bq_transform",
            inputs=[
                {
                    "namespace": "sample_data",
                    "name": "ecommerce_db.shopify.raw_order",
                }
            ],
            outputs=[
                {
                    "namespace": "sample_data",
                    "name": "ecommerce_db.shopify.fact_order",
                }
            ],
        )
        assert (
            result["lineageEdgesCreated"] >= 1
        ), f"OL event should create lineage edge, got: {json.dumps(result)}"

    def test_step3_lineage_edge_has_openlineage_source(self, metadata):
        """The lineage edge should be marked with source=OpenLineage."""
        lineage = metadata.get_lineage_by_name(
            entity=Table,
            fqn="sample_data.ecommerce_db.shopify.raw_order",
            up_depth=0,
            down_depth=3,
        )
        downstream = lineage.get("downstreamEdges", [])
        ol_edges = [
            e
            for e in downstream
            if e.get("lineageDetails", {}).get("source") == "OpenLineage"
        ]
        assert len(ol_edges) >= 1, (
            f"Expected OpenLineage-sourced edge. "
            f"Sources found: {[e.get('lineageDetails',{}).get('source') for e in downstream]}"
        )

    def test_step4_lineage_connects_correct_tables(self, metadata):
        """The OL edge should connect raw_order → fact_order."""
        src = metadata.get_by_name(
            entity=Table, fqn="sample_data.ecommerce_db.shopify.raw_order"
        )
        tgt = metadata.get_by_name(
            entity=Table, fqn="sample_data.ecommerce_db.shopify.fact_order"
        )

        lineage = metadata.get_lineage_by_name(
            entity=Table,
            fqn="sample_data.ecommerce_db.shopify.raw_order",
            up_depth=0,
            down_depth=3,
        )
        ol_edges = [
            e
            for e in lineage.get("downstreamEdges", [])
            if e.get("lineageDetails", {}).get("source") == "OpenLineage"
        ]
        assert any(
            e["toEntity"] == str(tgt.id.root) for e in ol_edges
        ), f"Expected edge to fact_order ({tgt.id.root})"

    def test_step5_target_table_has_upstream_lineage(self, metadata):
        """fact_order should show raw_order as upstream."""
        lineage = metadata.get_lineage_by_name(
            entity=Table,
            fqn="sample_data.ecommerce_db.shopify.fact_order",
            up_depth=3,
            down_depth=0,
        )
        upstream = lineage.get("upstreamEdges", [])
        ol_upstream = [
            e
            for e in upstream
            if e.get("lineageDetails", {}).get("source") == "OpenLineage"
        ]
        assert len(ol_upstream) >= 1, "fact_order should have OL upstream edge"

    def test_step6_multi_input_output_event(self, metadata):
        """An OL event with multiple inputs/outputs creates all edges."""
        result = _send_ol_event(
            job_namespace="airflow_full_e2e",
            job_name="multi_step_etl",
            inputs=[
                {
                    "namespace": "sample_data",
                    "name": "ecommerce_db.shopify.raw_order",
                },
                {
                    "namespace": "sample_data",
                    "name": "ecommerce_db.shopify.raw_customer",
                },
            ],
            outputs=[
                {
                    "namespace": "sample_data",
                    "name": "ecommerce_db.shopify.dim_address",
                },
            ],
        )
        assert (
            result["lineageEdgesCreated"] >= 2
        ), f"2 inputs → 1 output should create 2 edges, got: {result['lineageEdgesCreated']}"

    def test_step7_start_event_does_not_create_lineage(self):
        """START events should not create lineage (default filter = COMPLETE)."""
        event = {
            "eventType": "START",
            "eventTime": "2026-03-23T12:00:00Z",
            "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent",
            "producer": "https://airflow.apache.org",
            "run": {"runId": str(uuid.uuid4())},
            "job": {"namespace": "airflow_full_e2e", "name": "start_only"},
            "inputs": [
                {"namespace": "sample_data", "name": "ecommerce_db.shopify.raw_order"}
            ],
            "outputs": [
                {"namespace": "sample_data", "name": "ecommerce_db.shopify.fact_order"}
            ],
        }
        resp = requests.post(OL_ENDPOINT, headers=AUTH_HEADERS, json=event, timeout=10)
        result = resp.json()
        assert result["lineageEdgesCreated"] == 0

    def test_step8_unresolvable_datasets_create_no_edges(self):
        """OL events with unknown datasets should not create edges."""
        result = _send_ol_event(
            job_namespace="airflow_full_e2e",
            job_name="unknown_tables",
            inputs=[{"namespace": "no_such_service", "name": "no_schema.no_table"}],
            outputs=[{"namespace": "no_such_service", "name": "no_schema.no_output"}],
        )
        assert result["lineageEdgesCreated"] == 0


class TestRealDagOpenLineageFlow:
    """
    Trigger a real Airflow DAG (ol_lineage_etl) that has OL Dataset inlets/outlets.
    Airflow's OL provider emits COMPLETE events to OM's OpenLineage endpoint.
    Verify lineage edges appear between existing sample_data tables.

    This tests the actual production path:
      Airflow DAG run → OL provider → HTTP transport → OM OL endpoint → lineage
    """

    def test_trigger_ol_dag_and_verify_lineage(self, metadata, airflow_token):
        """Trigger ol_lineage_etl DAG and verify OL-created lineage."""
        headers = {
            "Authorization": f"Bearer {airflow_token}",
            "Content-Type": "application/json",
        }

        # Check the DAG exists
        resp = requests.get(
            f"{AIRFLOW_HOST}/api/v2/dags/ol_lineage_etl",
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            pytest.skip("ol_lineage_etl DAG not deployed in Airflow")

        # Unpause
        requests.patch(
            f"{AIRFLOW_HOST}/api/v2/dags/ol_lineage_etl",
            json={"is_paused": False},
            headers=headers,
            timeout=10,
        )

        # Trigger
        from datetime import datetime as dt
        from datetime import timezone as tz

        trigger_resp = requests.post(
            f"{AIRFLOW_HOST}/api/v2/dags/ol_lineage_etl/dagRuns",
            json={"logical_date": dt.now(tz.utc).isoformat()},
            headers=headers,
            timeout=10,
        )
        assert trigger_resp.status_code in (
            200,
            201,
        ), f"Failed to trigger DAG: {trigger_resp.text}"
        dag_run_id = trigger_resp.json().get("dag_run_id")

        # Wait for completion
        for _ in range(24):
            time.sleep(5)
            run_resp = requests.get(
                f"{AIRFLOW_HOST}/api/v2/dags/ol_lineage_etl/dagRuns/{dag_run_id}",
                headers=headers,
                timeout=10,
            )
            state = run_resp.json().get("state")
            if state in ("success", "failed"):
                break

        assert state == "success", f"DAG run ended with state: {state}"

        # Give OM a moment to process the OL event
        time.sleep(3)

        # Verify lineage was created via the OL transport
        lineage = metadata.get_lineage_by_name(
            entity=Table,
            fqn="sample_data.ecommerce_db.shopify.raw_order",
            up_depth=0,
            down_depth=3,
        )
        downstream = lineage.get("downstreamEdges", [])
        ol_edges = [
            e
            for e in downstream
            if e.get("lineageDetails", {}).get("source") == "OpenLineage"
        ]
        assert len(ol_edges) >= 1, (
            "Expected OpenLineage lineage edge from raw_order after DAG run. "
            "Check that Airflow OL provider is installed and transport is configured. "
            f"Sources found: {[e.get('lineageDetails',{}).get('source') for e in downstream]}"
        )

        # Verify fact_order is in the downstream nodes
        node_fqns = [n.get("fullyQualifiedName", "") for n in lineage.get("nodes", [])]
        assert any(
            "fact_order" in fqn for fqn in node_fqns
        ), f"Expected fact_order in downstream nodes, got: {node_fqns}"
