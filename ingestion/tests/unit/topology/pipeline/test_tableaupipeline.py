"""
Test Tableau Pipeline using the topology
"""

from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import patch

from metadata.generated.schema.api.data.createPipeline import CreatePipelineRequest
from metadata.generated.schema.entity.data.pipeline import (
    Pipeline,
    PipelineStatus,
    Task,
    TaskStatus,
)
from metadata.generated.schema.entity.services.pipelineService import (
    PipelineConnection,
    PipelineService,
    PipelineServiceType,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    OpenMetadataWorkflowConfig,
)
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.models.pipeline_status import OMetaPipelineStatus
from metadata.ingestion.source.pipeline.tableaupipeline.metadata import (
    TableaupipelineSource,
)
from metadata.ingestion.source.pipeline.tableaupipeline.models import (
    TableauJobItem,
    TableauPipelineDetails,
    TableauTaskType,
)
from metadata.utils.time_utils import convert_timestamp_to_milliseconds

mock_tableaupipeline_config = {
    "source": {
        "type": "tableaupipeline",
        "serviceName": "test_tableau_pipeline",
        "serviceConnection": {
            "config": {
                "type": "TableauPipeline",
                "hostPort": "https://tableau.example.com",
                "authType": {
                    "username": "test_user",
                    "password": "test_pass",
                },
            }
        },
        "sourceConfig": {"config": {"pipelineFilterPattern": {}}},
    },
    "sink": {"type": "metadata-rest", "config": {}},
    "workflowConfig": {
        "openMetadataServerConfig": {
            "hostPort": "http://localhost:8585/api",
            "authProvider": "openmetadata",
            "securityConfig": {
                "jwtToken": "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJ0eXAiOiJKV1QiLCJhbGc"
                "iOiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlzQm90IjpmYWxzZSwiaXNzIjoib3Blbi1tZXRhZGF0YS5vcmciLCJpYXQiOjE"
                "2NjM5Mzg0NjIsImVtYWlsIjoiYWRtaW5Ab3Blbm1ldGFkYXRhLm9yZyJ9.tS8um_5DKu7HgzGBzS1VTA5uUjKWOCU0B_j08WXB"
                "iEC0mr0zNREkqVfwFDD-d24HlNEbrqioLsBuFRiwIWKc1m_ZlVQbG7P36RUxhuv2vbSp80FKyNM-Tj93FDzq91jsyNmsQhyNv_fN"
                "r3TXfzzSPjHt8Go0FMMP66weoKMgW2PbXlhVKwEuXUHyakLLzewm9UMeQaEiRzhiTMU3UkLXcKbYEJJvfNFcLwSl9W8JCO_l0Yj3u"
                "d-qt_nQYEZwqW6u5nfdQllN133iikV4fM5QZsMCnm8Rq1mvLR0y9bmJiD7fwM1tmJ791TUWqmKaTnP49U493VanKpUAfzIiOiIbhg"
            },
        }
    },
}

MOCK_PIPELINE_SERVICE = PipelineService(
    id="c3eb265f-5445-4ad3-ba5e-797d3a3071bb",
    name="test_tableau_pipeline",
    connection=PipelineConnection(),
    serviceType=PipelineServiceType.TableauPipeline,
)

MOCK_PIPELINE = Pipeline(
    id="d7f1e456-16b2-4a8c-b2f1-1e4c5a6b7c8d",
    name="flow-abc-123",
    fullyQualifiedName="test_tableau_pipeline.flow-abc-123",
    displayName="Sales Data Prep Flow",
    tasks=[
        Task(
            name="flow-abc-123",
            displayName="Sales Data Prep Flow",
        )
    ],
    service=EntityReference(
        id="c3eb265f-5445-4ad3-ba5e-797d3a3071bb", type="pipelineService"
    ),
)

MOCK_FLOW_RUN_STARTED = datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
MOCK_FLOW_RUN_COMPLETED = datetime(2025, 1, 15, 10, 5, 30, tzinfo=timezone.utc)
MOCK_FLOW_RUN_2_STARTED = datetime(2025, 1, 14, 8, 0, 0, tzinfo=timezone.utc)
MOCK_FLOW_RUN_2_COMPLETED = datetime(2025, 1, 14, 8, 3, 15, tzinfo=timezone.utc)

MOCK_PIPELINE_DETAILS = TableauPipelineDetails(
    id="flow-abc-123",
    name="flow-abc-123",
    display_name="Sales Data Prep Flow",
    description="Prepares sales data for analysis",
    pipeline_type=TableauTaskType.FLOW_RUN,
    project_name="Sales Project",
    webpage_url="https://tableau.example.com/#/flows/flow-abc-123",
    runs=[
        TableauJobItem(
            id="run-001",
            job_type="FlowRun",
            status="Success",
            started_at=MOCK_FLOW_RUN_STARTED,
            completed_at=MOCK_FLOW_RUN_COMPLETED,
        ),
        TableauJobItem(
            id="run-002",
            job_type="FlowRun",
            status="Failed",
            started_at=MOCK_FLOW_RUN_2_STARTED,
            completed_at=MOCK_FLOW_RUN_2_COMPLETED,
        ),
    ],
)

MOCK_PIPELINE_DETAILS_NO_RUNS = TableauPipelineDetails(
    id="flow-def-456",
    name="flow-def-456",
    display_name="Inventory Flow",
    description=None,
    pipeline_type=TableauTaskType.FLOW_RUN,
    project_name="Inventory Project",
    webpage_url=None,
    runs=[],
)

EXPECTED_PIPELINE = CreatePipelineRequest(
    name="flow-abc-123",
    displayName="Sales Data Prep Flow",
    description="Prepares sales data for analysis",
    tasks=[
        Task(
            name="flow-abc-123",
            displayName="Sales Data Prep Flow",
            description="Prepares sales data for analysis",
            sourceUrl="https://tableau.example.com/#/flows/flow-abc-123",
        )
    ],
    service="test_tableau_pipeline",
    sourceUrl="https://tableau.example.com/#/flows/flow-abc-123",
)

EXPECTED_PIPELINE_NO_DESC = CreatePipelineRequest(
    name="flow-def-456",
    displayName="Inventory Flow",
    description=None,
    tasks=[
        Task(
            name="flow-def-456",
            displayName="Inventory Flow",
            sourceUrl="https://tableau.example.com/#/flows",
        )
    ],
    service="test_tableau_pipeline",
    sourceUrl="https://tableau.example.com/#/flows",
)

_started_ms = convert_timestamp_to_milliseconds(int(MOCK_FLOW_RUN_STARTED.timestamp()))
_completed_ms = convert_timestamp_to_milliseconds(
    int(MOCK_FLOW_RUN_COMPLETED.timestamp())
)
_started_2_ms = convert_timestamp_to_milliseconds(
    int(MOCK_FLOW_RUN_2_STARTED.timestamp())
)
_completed_2_ms = convert_timestamp_to_milliseconds(
    int(MOCK_FLOW_RUN_2_COMPLETED.timestamp())
)

EXPECTED_PIPELINE_STATUS = [
    OMetaPipelineStatus(
        pipeline_fqn="test_tableau_pipeline.flow-abc-123",
        pipeline_status=PipelineStatus(
            timestamp=_completed_ms,
            executionStatus="Successful",
            taskStatus=[
                TaskStatus(
                    name="flow-abc-123",
                    executionStatus="Successful",
                    startTime=_started_ms,
                    endTime=_completed_ms,
                )
            ],
        ),
    ),
    OMetaPipelineStatus(
        pipeline_fqn="test_tableau_pipeline.flow-abc-123",
        pipeline_status=PipelineStatus(
            timestamp=_completed_2_ms,
            executionStatus="Failed",
            taskStatus=[
                TaskStatus(
                    name="flow-abc-123",
                    executionStatus="Failed",
                    startTime=_started_2_ms,
                    endTime=_completed_2_ms,
                )
            ],
        ),
    ),
]


class TableauPipelineUnitTest(TestCase):
    """
    Implements the necessary methods to extract
    Tableau Pipeline Unit Test
    """

    @patch(
        "metadata.ingestion.source.pipeline.pipeline_service.PipelineServiceSource.test_connection"
    )
    @patch(
        "metadata.ingestion.source.pipeline.tableaupipeline.connection.get_connection"
    )
    def __init__(self, methodName, get_connection_mock, test_connection) -> None:
        super().__init__(methodName)
        test_connection.return_value = False
        get_connection_mock.return_value = False
        self.config = OpenMetadataWorkflowConfig.model_validate(
            mock_tableaupipeline_config
        )
        self.tableaupipeline = TableaupipelineSource.create(
            mock_tableaupipeline_config["source"],
            self.config.workflowConfig.openMetadataServerConfig,
        )
        self.tableaupipeline.context.get().__dict__[
            "pipeline"
        ] = MOCK_PIPELINE.name.root
        self.tableaupipeline.context.get().__dict__[
            "pipeline_service"
        ] = MOCK_PIPELINE_SERVICE.name.root

    def test_pipeline_name(self):
        assert (
            self.tableaupipeline.get_pipeline_name(MOCK_PIPELINE_DETAILS)
            == "Sales Data Prep Flow"
        )

    def test_pipeline_name_falls_back_to_id(self):
        details = TableauPipelineDetails(
            id="flow-xyz",
            name="flow-xyz",
            display_name=None,
            pipeline_type=TableauTaskType.FLOW_RUN,
        )
        assert self.tableaupipeline.get_pipeline_name(details) == "flow-xyz"

    def test_yield_pipeline(self):
        results = list(self.tableaupipeline.yield_pipeline(MOCK_PIPELINE_DETAILS))
        assert len(results) == 1
        pipeline_request = results[0].right
        assert pipeline_request.name.root == EXPECTED_PIPELINE.name.root
        assert pipeline_request.displayName == EXPECTED_PIPELINE.displayName
        assert pipeline_request.description.root == EXPECTED_PIPELINE.description.root
        assert pipeline_request.service.root == EXPECTED_PIPELINE.service.root
        assert len(pipeline_request.tasks) == 1
        assert pipeline_request.tasks[0].name == "flow-abc-123"
        assert pipeline_request.tasks[0].displayName == "Sales Data Prep Flow"

    def test_yield_pipeline_no_description(self):
        results = list(
            self.tableaupipeline.yield_pipeline(MOCK_PIPELINE_DETAILS_NO_RUNS)
        )
        assert len(results) == 1
        pipeline_request = results[0].right
        assert pipeline_request.name.root == "flow-def-456"
        assert pipeline_request.displayName == "Inventory Flow"
        assert pipeline_request.description is None

    def test_yield_pipeline_status(self):
        results = list(
            self.tableaupipeline.yield_pipeline_status(MOCK_PIPELINE_DETAILS)
        )
        status_list = [r.right for r in results if r.right is not None]
        assert len(status_list) == 2

        assert status_list[0].pipeline_fqn == "test_tableau_pipeline.flow-abc-123"
        assert status_list[0].pipeline_status.executionStatus == "Successful"
        assert status_list[0].pipeline_status.taskStatus[0].startTime == _started_ms
        assert status_list[0].pipeline_status.taskStatus[0].endTime == _completed_ms

        assert status_list[1].pipeline_status.executionStatus == "Failed"
        assert status_list[1].pipeline_status.taskStatus[0].startTime == _started_2_ms
        assert status_list[1].pipeline_status.taskStatus[0].endTime == _completed_2_ms

    def test_yield_pipeline_status_empty_runs(self):
        results = list(
            self.tableaupipeline.yield_pipeline_status(MOCK_PIPELINE_DETAILS_NO_RUNS)
        )
        assert len(results) == 0

    def test_source_url_from_webpage(self):
        url = self.tableaupipeline.get_source_url(MOCK_PIPELINE_DETAILS)
        assert url.root == "https://tableau.example.com/#/flows/flow-abc-123"

    def test_source_url_fallback(self):
        url = self.tableaupipeline.get_source_url(MOCK_PIPELINE_DETAILS_NO_RUNS)
        assert url.root == "https://tableau.example.com/#/flows"

    def test_get_status_mapping(self):
        assert (
            TableaupipelineSource._get_status(
                TableauJobItem(id="1", status="Success")
            ).value
            == "Successful"
        )
        assert (
            TableaupipelineSource._get_status(
                TableauJobItem(id="2", status="Failed")
            ).value
            == "Failed"
        )
        assert (
            TableaupipelineSource._get_status(
                TableauJobItem(id="3", status="Cancelled")
            ).value
            == "Failed"
        )
        assert (
            TableaupipelineSource._get_status(
                TableauJobItem(id="4", status="InProgress")
            ).value
            == "Pending"
        )
        assert (
            TableaupipelineSource._get_status(TableauJobItem(id="5", status=None)).value
            == "Pending"
        )
        assert (
            TableaupipelineSource._get_status(
                TableauJobItem(id="6", status="UnknownStatus")
            ).value
            == "Pending"
        )

    def test_to_timestamp_none(self):
        assert TableaupipelineSource._to_timestamp(None) is None

    def test_to_timestamp_valid(self):
        dt = datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        result = TableaupipelineSource._to_timestamp(dt)
        expected = convert_timestamp_to_milliseconds(int(dt.timestamp()))
        assert result.root == expected
