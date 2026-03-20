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
Tests for AirflowApi pipeline connector
"""
from unittest.mock import MagicMock, patch

from metadata.generated.schema.entity.data.pipeline import StatusType
from metadata.ingestion.source.pipeline.airflowapi.client import AirflowApiClient
from metadata.ingestion.source.pipeline.airflowapi.metadata import STATUS_MAP
from metadata.ingestion.source.pipeline.airflowapi.models import (
    AirflowApiDagDetails,
    AirflowApiDagRun,
    AirflowApiTask,
    AirflowApiTaskInstance,
)


class TestStatusMapping:
    def test_success_maps_to_successful(self):
        assert STATUS_MAP["success"] == StatusType.Successful.value

    def test_failed_maps_to_failed(self):
        assert STATUS_MAP["failed"] == StatusType.Failed.value

    def test_queued_maps_to_pending(self):
        assert STATUS_MAP["queued"] == StatusType.Pending.value

    def test_skipped_maps_to_skipped(self):
        assert STATUS_MAP["skipped"] == StatusType.Skipped.value

    def test_running_maps_to_pending(self):
        assert STATUS_MAP["running"] == StatusType.Pending.value

    def test_upstream_failed_maps_to_failed(self):
        assert STATUS_MAP["upstream_failed"] == StatusType.Failed.value

    def test_unknown_state_defaults(self):
        assert (
            STATUS_MAP.get("nonexistent", StatusType.Pending.value)
            == StatusType.Pending.value
        )


class TestModels:
    def test_dag_details_minimal(self):
        dag = AirflowApiDagDetails(dag_id="test_dag")
        assert dag.dag_id == "test_dag"
        assert dag.tasks == []
        assert dag.tags is None

    def test_dag_details_with_tasks(self):
        dag = AirflowApiDagDetails(
            dag_id="test_dag",
            description="A test dag",
            is_paused=False,
            tasks=[
                AirflowApiTask(
                    task_id="task_1",
                    downstream_task_ids=["task_2"],
                    class_ref={"class_name": "BashOperator"},
                ),
                AirflowApiTask(task_id="task_2"),
            ],
        )
        assert len(dag.tasks) == 2
        assert dag.tasks[0].downstream_task_ids == ["task_2"]
        assert dag.tasks[0].class_ref["class_name"] == "BashOperator"

    def test_dag_run(self):
        run = AirflowApiDagRun(
            dag_run_id="manual__2024-01-01",
            state="success",
        )
        assert run.dag_run_id == "manual__2024-01-01"
        assert run.state == "success"

    def test_task_instance(self):
        ti = AirflowApiTaskInstance(
            task_id="task_1",
            state="success",
        )
        assert ti.task_id == "task_1"
        assert ti.state == "success"


class TestClientApiVersionDetection:
    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_auto_detect_v2(self, mock_rest_cls):
        mock_rest = MagicMock()
        mock_rest.get.return_value = {"version": "3.0.0"}
        mock_rest_cls.return_value = mock_rest

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "auto"
        config.verifySSL = True

        client = AirflowApiClient(config)
        version = client.api_version
        assert version == "v2"

    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_auto_detect_v1_fallback(self, mock_rest_cls):
        mock_rest = MagicMock()

        def side_effect(path):
            if "/v2/" in path:
                raise Exception("Not found")
            return {"version": "2.9.0"}

        mock_rest.get.side_effect = side_effect
        mock_rest_cls.return_value = mock_rest

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "auto"
        config.verifySSL = True

        client = AirflowApiClient(config)
        version = client.api_version
        assert version == "v1"

    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_explicit_version(self, mock_rest_cls):
        mock_rest_cls.return_value = MagicMock()

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "v1"
        config.verifySSL = True

        client = AirflowApiClient(config)
        version = client.api_version
        assert version == "v1"


class TestClientBuildDagDetails:
    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_build_dag_details_normalizes_tags(self, mock_rest_cls):
        mock_rest = MagicMock()
        mock_rest.get.return_value = {"tasks": []}
        mock_rest_cls.return_value = mock_rest

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "v1"
        config.verifySSL = True

        client = AirflowApiClient(config)

        dag_data = {
            "dag_id": "test_dag",
            "tags": [{"name": "team:data"}, {"name": "env:prod"}],
            "owners": ["admin"],
        }
        result = client.build_dag_details(dag_data)
        assert result.tags == ["team:data", "env:prod"]
        assert result.owners == ["admin"]

    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_build_dag_details_with_tasks(self, mock_rest_cls):
        mock_rest = MagicMock()
        mock_rest.get.return_value = {
            "tasks": [
                {
                    "task_id": "extract",
                    "downstream_task_ids": ["transform"],
                    "class_ref": {
                        "class_name": "PythonOperator",
                        "module_path": "airflow.operators.python",
                    },
                },
                {
                    "task_id": "transform",
                    "downstream_task_ids": [],
                    "class_ref": {
                        "class_name": "BashOperator",
                        "module_path": "airflow.operators.bash",
                    },
                },
            ]
        }
        mock_rest_cls.return_value = mock_rest

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "v1"
        config.verifySSL = True

        client = AirflowApiClient(config)

        dag_data = {"dag_id": "etl_pipeline", "tags": [], "owners": []}
        result = client.build_dag_details(dag_data)
        assert len(result.tasks) == 2
        assert result.tasks[0].task_id == "extract"
        assert result.tasks[0].downstream_task_ids == ["transform"]
        assert result.tasks[0].class_ref["class_name"] == "PythonOperator"


class TestClientDateField:
    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_v1_uses_execution_date(self, mock_rest_cls):
        mock_rest_cls.return_value = MagicMock()

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "v1"
        config.verifySSL = True

        client = AirflowApiClient(config)
        assert client._date_field == "execution_date"

    @patch("metadata.ingestion.source.pipeline.airflowapi.client.TrackedREST")
    def test_v2_uses_logical_date(self, mock_rest_cls):
        mock_rest = MagicMock()
        mock_rest.get.return_value = {"version": "3.0.0"}
        mock_rest_cls.return_value = mock_rest

        config = MagicMock()
        config.hostPort = "http://localhost:8080"
        config.token = None
        config.username = None
        config.password = None
        config.apiVersion = MagicMock()
        config.apiVersion.value = "v2"
        config.verifySSL = True

        client = AirflowApiClient(config)
        assert client._date_field == "logical_date"


class TestSourceUrlGeneration:
    def _make_source(self, api_version: str):
        source = MagicMock()
        source.service_connection = MagicMock()
        source.service_connection.hostPort = "http://airflow.example.com:8080"
        source.connection = MagicMock()
        source.connection.api_version = api_version
        return source

    def test_v2_dag_url(self):
        from metadata.ingestion.source.pipeline.airflowapi.metadata import (
            AirflowApiSource,
        )

        source = self._make_source("v2")
        url = AirflowApiSource._get_dag_source_url(source, "my_dag")
        assert url == "http://airflow.example.com:8080/dags/my_dag"

    def test_v1_dag_url(self):
        from metadata.ingestion.source.pipeline.airflowapi.metadata import (
            AirflowApiSource,
        )

        source = self._make_source("v1")
        url = AirflowApiSource._get_dag_source_url(source, "my_dag")
        assert url == "http://airflow.example.com:8080/dags/my_dag/grid"

    def test_v2_task_url(self):
        from metadata.ingestion.source.pipeline.airflowapi.metadata import (
            AirflowApiSource,
        )

        source = self._make_source("v2")
        url = AirflowApiSource._get_task_source_url(source, "my_dag", "my_task")
        assert url == "http://airflow.example.com:8080/dags/my_dag/tasks/my_task"

    def test_v1_task_url(self):
        from metadata.ingestion.source.pipeline.airflowapi.metadata import (
            AirflowApiSource,
        )

        source = self._make_source("v1")
        url = AirflowApiSource._get_task_source_url(source, "my_dag", "my_task")
        assert "taskinstance/list" in url
        assert "_flt_3_dag_id=my_dag" in url
        assert "_flt_3_task_id=my_task" in url
