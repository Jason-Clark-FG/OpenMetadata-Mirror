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
Tableau Pipeline source to extract Prep Flows as pipeline metadata
"""

import traceback
from datetime import datetime
from typing import Iterable, List, Optional

from metadata.generated.schema.api.data.createPipeline import CreatePipelineRequest
from metadata.generated.schema.api.lineage.addLineage import AddLineageRequest
from metadata.generated.schema.entity.data.pipeline import (
    Pipeline,
    PipelineStatus,
    StatusType,
    Task,
    TaskStatus,
)
from metadata.generated.schema.entity.services.connections.pipeline.tableauPipelineConnection import (
    TableauPipelineConnection,
)
from metadata.generated.schema.entity.services.ingestionPipelines.status import (
    StackTraceError,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.generated.schema.type.basic import (
    EntityName,
    FullyQualifiedEntityName,
    Markdown,
    SourceUrl,
    Timestamp,
)
from metadata.ingestion.api.models import Either
from metadata.ingestion.api.steps import InvalidSourceException
from metadata.ingestion.models.pipeline_status import OMetaPipelineStatus
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.pipeline.pipeline_service import PipelineServiceSource
from metadata.ingestion.source.pipeline.tableaupipeline.models import (
    TableauFlowRunItem,
    TableauPipelineDetails,
)
from metadata.utils import fqn
from metadata.utils.helpers import clean_uri
from metadata.utils.logger import ingestion_logger
from metadata.utils.time_utils import convert_timestamp_to_milliseconds

logger = ingestion_logger()

FLOW_RUN_STATUS_MAP = {
    "success": StatusType.Successful,
    "failed": StatusType.Failed,
    "cancelled": StatusType.Failed,
    "inprogress": StatusType.Pending,
    "pending": StatusType.Pending,
    "created": StatusType.Pending,
}


class TableaupipelineSource(PipelineServiceSource):
    """
    Implements the necessary methods to extract
    Pipeline metadata from Tableau (Prep Flows)
    """

    @classmethod
    def create(
        cls, config_dict, metadata: OpenMetadata, pipeline_name: Optional[str] = None
    ):
        config = WorkflowSource.model_validate(config_dict)
        connection: TableauPipelineConnection = config.serviceConnection.root.config
        if not isinstance(connection, TableauPipelineConnection):
            raise InvalidSourceException(
                f"Expected TableauPipelineConnection, but got {connection}"
            )
        return cls(config, metadata)

    def get_pipeline_name(self, pipeline_details: TableauPipelineDetails) -> str:
        return pipeline_details.display_name or pipeline_details.name

    def get_pipelines_list(self) -> Iterable[TableauPipelineDetails]:
        for pipeline in self.connection.get_pipelines():
            yield pipeline

    def yield_pipeline(
        self, pipeline_details: TableauPipelineDetails
    ) -> Iterable[Either[CreatePipelineRequest]]:
        try:
            source_url = self.get_source_url(pipeline_details)
            tasks = self._get_tasks(pipeline_details)

            pipeline_request = CreatePipelineRequest(
                name=EntityName(pipeline_details.name),
                displayName=pipeline_details.display_name,
                description=Markdown(pipeline_details.description)
                if pipeline_details.description
                else None,
                tasks=tasks,
                service=FullyQualifiedEntityName(self.context.get().pipeline_service),
                sourceUrl=source_url,
            )
            yield Either(right=pipeline_request)
            self.register_record(pipeline_request=pipeline_request)

        except Exception as err:
            yield Either(
                left=StackTraceError(
                    name=pipeline_details.display_name or pipeline_details.name,
                    error=(
                        f"Error extracting data from "
                        f"{pipeline_details.display_name or pipeline_details.name} - {err}"
                    ),
                    stackTrace=traceback.format_exc(),
                )
            )

    def _get_tasks(self, pipeline_details: TableauPipelineDetails) -> List[Task]:
        return [
            Task(
                name=pipeline_details.name,
                displayName=pipeline_details.display_name,
                description=pipeline_details.description,
                sourceUrl=self.get_source_url(pipeline_details),
            )
        ]

    def yield_pipeline_lineage_details(
        self, pipeline_details: TableauPipelineDetails
    ) -> Iterable[Either[AddLineageRequest]]:
        """Lineage not yet implemented for Tableau pipelines"""

    def yield_pipeline_status(
        self, pipeline_details: TableauPipelineDetails
    ) -> Iterable[Either[OMetaPipelineStatus]]:
        try:
            runs = self.connection.get_flow_runs(pipeline_details.id)
            for run in runs:
                execution_status = self._get_status(run)
                start_time = self._to_timestamp(run.started_at)
                end_time = self._to_timestamp(run.completed_at)

                task_status = TaskStatus(
                    name=pipeline_details.name,
                    executionStatus=execution_status.value,
                    startTime=start_time,
                    endTime=end_time,
                )
                pipeline_status = PipelineStatus(
                    taskStatus=[task_status],
                    executionStatus=execution_status.value,
                    timestamp=end_time or start_time,
                )
                pipeline_fqn = fqn.build(
                    metadata=self.metadata,
                    entity_type=Pipeline,
                    service_name=self.context.get().pipeline_service,
                    pipeline_name=self.context.get().pipeline,
                )
                yield Either(
                    right=OMetaPipelineStatus(
                        pipeline_fqn=pipeline_fqn,
                        pipeline_status=pipeline_status,
                    )
                )
        except Exception as err:
            yield Either(
                left=StackTraceError(
                    name=pipeline_details.name,
                    error=(
                        f"Error extracting status for "
                        f"{pipeline_details.name} - {err}"
                    ),
                    stackTrace=traceback.format_exc(),
                )
            )

    @staticmethod
    def _get_status(run: TableauFlowRunItem) -> StatusType:
        if run.status:
            return FLOW_RUN_STATUS_MAP.get(run.status.lower(), StatusType.Pending)
        return StatusType.Pending

    @staticmethod
    def _to_timestamp(dt: Optional[datetime]) -> Optional[Timestamp]:
        if dt is None:
            return None
        try:
            return Timestamp(convert_timestamp_to_milliseconds(int(dt.timestamp())))
        except Exception:
            return None

    def get_source_url(
        self, pipeline_details: TableauPipelineDetails
    ) -> Optional[SourceUrl]:
        try:
            if pipeline_details.webpage_url:
                return SourceUrl(pipeline_details.webpage_url)
            return SourceUrl(
                f"{clean_uri(str(self.service_connection.hostPort))}/" f"#/flows"
            )
        except Exception as exc:
            logger.debug(traceback.format_exc())
            logger.warning(
                f"Unable to get source url for {pipeline_details.name}: {exc}"
            )
        return None

    def close(self):
        super().close()
        self.connection.sign_out()
