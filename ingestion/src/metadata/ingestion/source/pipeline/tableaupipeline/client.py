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
Tableau Pipeline Client - wraps tableauserverclient for pipeline operations
"""

import traceback
from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Union

from tableauserverclient import (
    Pager,
    PersonalAccessTokenAuth,
    RequestOptions,
    Server,
    TableauAuth,
)

from metadata.ingestion.source.pipeline.tableaupipeline.models import (
    TableauFlowItem,
    TableauFlowRunItem,
    TableauJobItem,
    TableauPipelineDetails,
    TableauTaskType,
)
from metadata.utils.logger import ingestion_logger
from metadata.utils.ssl_manager import SSLManager

logger = ingestion_logger()

MAX_FLOW_RUNS = 10000


class TableauPipelineClient:
    """Client for Tableau Pipeline operations (Prep Flows)"""

    def __init__(
        self,
        tableau_server_auth: Union[PersonalAccessTokenAuth, TableauAuth],
        config,
        verify_ssl: Union[bool, str, None],
        ssl_manager: Optional[SSLManager] = None,
    ):
        self.tableau_server = Server(str(config.hostPort), use_server_version=True)
        if config.apiVersion:
            self.tableau_server.version = config.apiVersion
        self.tableau_server.add_http_options({"verify": verify_ssl})
        self.tableau_server.auth.sign_in(tableau_server_auth)
        self.config = config
        self.ssl_manager = ssl_manager

    def get_flows(self) -> Iterable[TableauFlowItem]:
        """Fetch all Tableau Prep flows"""
        try:
            for flow in Pager(self.tableau_server.flows):
                yield TableauFlowItem(
                    id=str(flow.id),
                    name=flow.name,
                    description=flow.description,
                    project_id=str(flow.project_id) if flow.project_id else None,
                    project_name=flow.project_name,
                    owner_id=str(flow.owner_id) if flow.owner_id else None,
                    webpage_url=flow.webpage_url,
                    created_at=flow.created_at,
                    updated_at=flow.updated_at,
                )
        except Exception:
            logger.debug(traceback.format_exc())
            logger.warning("Unable to fetch Tableau Prep flows")

    def _get_all_flow_runs(self) -> Dict[str, List[TableauFlowRunItem]]:
        """Fetch flow runs and group by flow_id, bounded to MAX_FLOW_RUNS"""
        runs_by_flow: Dict[str, List[TableauFlowRunItem]] = defaultdict(list)
        count = 0
        try:
            for run in Pager(self.tableau_server.flow_runs):
                if run.flow_id:
                    runs_by_flow[run.flow_id].append(
                        TableauFlowRunItem(
                            id=str(run.id),
                            flow_id=run.flow_id,
                            status=run.status,
                            started_at=run.started_at,
                            completed_at=run.completed_at,
                            progress=run.progress,
                        )
                    )
                count += 1
                if count >= MAX_FLOW_RUNS:
                    logger.warning(
                        f"Reached flow run limit ({MAX_FLOW_RUNS}). "
                        "Some older runs may be excluded."
                    )
                    break
        except Exception:
            logger.debug(traceback.format_exc())
            logger.warning("Unable to fetch Tableau flow runs")
        return runs_by_flow

    def get_pipelines(self) -> Iterable[TableauPipelineDetails]:
        """Get all pipelines (Prep Flows) with their run history"""
        flow_runs_by_id = self._get_all_flow_runs()

        for flow in self.get_flows():
            flow_runs = flow_runs_by_id.get(flow.id, [])
            runs = [
                TableauJobItem(
                    id=run.id,
                    job_type="FlowRun",
                    status=run.status,
                    started_at=run.started_at,
                    completed_at=run.completed_at,
                    progress=run.progress,
                )
                for run in flow_runs
            ]
            yield TableauPipelineDetails(
                id=flow.id,
                name=flow.id,
                display_name=flow.name,
                description=flow.description,
                pipeline_type=TableauTaskType.FLOW_RUN,
                project_name=flow.project_name,
                webpage_url=flow.webpage_url,
                runs=runs,
            )

    def test_get_flows(self) -> None:
        """Validate that we can list flows. Raises on failure."""
        req_options = RequestOptions(pagesize=1)
        self.tableau_server.flows.get(req_options)

    def sign_out(self) -> None:
        self.tableau_server.auth.sign_out()
        self.cleanup()

    def cleanup(self) -> None:
        if self.ssl_manager:
            self.ssl_manager.cleanup_temp_files()
