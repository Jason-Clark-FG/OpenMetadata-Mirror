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
Client to interact with the Airflow REST API
"""
import base64
import traceback
from typing import List, Optional
from urllib.parse import quote

from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import HTTPError

from metadata.generated.schema.entity.services.connections.pipeline.airflowApiConnection import (
    AirflowApiConnection,
)
from metadata.ingestion.connections.source_api_client import TrackedREST
from metadata.ingestion.ometa.client import ClientConfig
from metadata.ingestion.source.pipeline.airflowapi.models import (
    AirflowApiDagDetails,
    AirflowApiDagRun,
    AirflowApiTask,
    AirflowApiTaskInstance,
)
from metadata.utils.helpers import clean_uri
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class AirflowApiClient:
    """
    Client to interact with the Airflow REST API (v1 for Airflow 2.x, v2 for Airflow 3.x)
    """

    def __init__(self, config: AirflowApiConnection):
        self.config = config
        self._detected_version: Optional[str] = None

        auth_token_mode = "Bearer"
        auth_token_value: Optional[str] = None

        if config.token:
            auth_token_value = config.token.get_secret_value()
        elif config.username and config.password:
            auth_token_mode = "Basic"
            credentials = f"{config.username}:{config.password.get_secret_value()}"
            auth_token_value = base64.b64encode(credentials.encode("utf-8")).decode(
                "utf-8"
            )

        client_config = ClientConfig(
            base_url=clean_uri(str(config.hostPort)),
            api_version="api",
            auth_header="Authorization" if auth_token_value else None,
            auth_token=(lambda: (auth_token_value, 0)) if auth_token_value else None,
            auth_token_mode=auth_token_mode,
            verify=config.verifySSL,
        )
        self.client = TrackedREST(client_config, source_name="airflow_api")

    @property
    def api_version(self) -> str:
        if self._detected_version:
            return self._detected_version

        configured = (
            str(self.config.apiVersion.value) if self.config.apiVersion else "auto"
        )
        if configured != "auto":
            self._detected_version = configured
            return self._detected_version

        self._detected_version = self._detect_api_version()
        return self._detected_version

    def _detect_api_version(self) -> str:
        for version in ("v2", "v1"):
            try:
                self.client.get(f"/{version}/version")
                return version
            except HTTPError as exc:
                if exc.response is not None and exc.response.status_code in (401, 403):
                    raise
                logger.debug(traceback.format_exc())
            except (RequestsConnectionError, TimeoutError, OSError):
                raise
            except Exception:
                logger.debug(traceback.format_exc())
        logger.warning("Could not detect Airflow API version, defaulting to v1")
        return "v1"

    @property
    def _prefix(self) -> str:
        return f"/{self.api_version}"

    @property
    def _date_field(self) -> str:
        return "logical_date" if self.api_version == "v2" else "execution_date"

    def get_version(self) -> dict:
        return self.client.get(f"{self._prefix}/version")

    def list_dags(self, limit: int = 100, offset: int = 0) -> dict:
        return self.client.get(f"{self._prefix}/dags?limit={limit}&offset={offset}")

    def get_dag_tasks(self, dag_id: str) -> dict:
        return self.client.get(f"{self._prefix}/dags/{quote(dag_id, safe='')}/tasks")

    def list_dag_runs(self, dag_id: str, limit: int = 10) -> dict:
        return self.client.get(
            f"{self._prefix}/dags/{quote(dag_id, safe='')}/dagRuns"
            f"?limit={limit}&order_by=-{self._date_field}"
        )

    def get_task_instances(self, dag_id: str, dag_run_id: str) -> dict:
        return self.client.get(
            f"{self._prefix}/dags/{quote(dag_id, safe='')}"
            f"/dagRuns/{quote(dag_run_id, safe='')}/taskInstances"
        )

    def _paginate(self, path: str, key: str, limit: int = 100) -> List[dict]:
        result: List[dict] = []
        offset = 0
        total = limit  # ensure first iteration runs
        while offset < total:
            separator = "&" if "?" in path else "?"
            response = self.client.get(
                f"{path}{separator}limit={limit}&offset={offset}"
            )
            page = response.get(key, [])
            if not page:
                break
            result.extend(page)
            total = response.get("total_entries", len(result))
            offset += limit
        return result

    def get_all_dags(self) -> List[dict]:
        return self._paginate(f"{self._prefix}/dags", key="dags")

    def build_dag_details(self, dag_data: dict) -> AirflowApiDagDetails:
        dag_id = dag_data["dag_id"]

        tags_raw = dag_data.get("tags") or []
        tags = []
        for tag in tags_raw:
            if isinstance(tag, dict):
                name = tag.get("name")
            elif isinstance(tag, str):
                name = tag
            else:
                continue
            if name:
                tags.append(str(name))

        owners = dag_data.get("owners") or []

        schedule = dag_data.get("schedule_interval")
        if isinstance(schedule, dict):
            schedule = schedule.get("value")

        try:
            task_response = self.get_dag_tasks(dag_id)
            tasks_data = task_response.get("tasks", [])
        except Exception as exc:
            logger.warning(f"Could not fetch tasks for DAG {dag_id}: {exc}")
            tasks_data = []

        tasks = [
            AirflowApiTask(
                task_id=t["task_id"],
                downstream_task_ids=t.get("downstream_task_ids"),
                owner=t.get("owner"),
                doc_md=t.get("doc_md"),
                start_date=t.get("start_date"),
                end_date=t.get("end_date"),
                class_ref=t.get("class_ref"),
            )
            for t in tasks_data
        ]

        return AirflowApiDagDetails(
            dag_id=dag_id,
            description=dag_data.get("description"),
            fileloc=dag_data.get("fileloc") or dag_data.get("file_loc"),
            is_paused=dag_data.get("is_paused"),
            owners=owners,
            tags=tags,
            schedule_interval=schedule,
            max_active_runs=dag_data.get("max_active_runs"),
            start_date=dag_data.get("start_date"),
            tasks=tasks,
        )

    def get_dag_runs(self, dag_id: str, limit: int = 10) -> List[AirflowApiDagRun]:
        try:
            response = self.list_dag_runs(dag_id, limit=limit)
            runs_data = response.get("dag_runs", [])
        except Exception as exc:
            logger.warning(f"Could not fetch dag runs for {dag_id}: {exc}")
            return []

        result = []
        for run in runs_data:
            execution_date = run.get("logical_date") or run.get("execution_date")
            result.append(
                AirflowApiDagRun(
                    dag_run_id=run.get("dag_run_id", ""),
                    state=run.get("state"),
                    execution_date=execution_date,
                    start_date=run.get("start_date"),
                    end_date=run.get("end_date"),
                )
            )
        return result

    def get_task_instances_for_run(
        self, dag_id: str, dag_run_id: str
    ) -> List[AirflowApiTaskInstance]:
        try:
            path = (
                f"{self._prefix}/dags/{quote(dag_id, safe='')}"
                f"/dagRuns/{quote(dag_run_id, safe='')}/taskInstances"
            )
            instances_data = self._paginate(path, key="task_instances")
        except Exception as exc:
            logger.warning(
                f"Could not fetch task instances for {dag_id}/{dag_run_id}: {exc}"
            )
            return []

        return [
            AirflowApiTaskInstance(
                task_id=ti.get("task_id", ""),
                state=ti.get("state"),
                start_date=ti.get("start_date"),
                end_date=ti.get("end_date"),
            )
            for ti in instances_data
        ]
