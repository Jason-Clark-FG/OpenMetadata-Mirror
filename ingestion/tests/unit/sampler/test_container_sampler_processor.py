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
Test Container sampler processor functionality
"""
import uuid
from unittest.mock import MagicMock, Mock, patch

import pytest

from metadata.generated.schema.entity.data.container import Container
from metadata.generated.schema.entity.data.table import Column, DataType, Table
from metadata.generated.schema.entity.services.connections.metadata.openMetadataConnection import (
    OpenMetadataConnection,
)
from metadata.generated.schema.metadataIngestion.storageServiceAutoClassificationPipeline import (
    StorageServiceAutoClassificationPipeline,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    OpenMetadataWorkflowConfig,
    Processor,
    Sink,
    Source,
    SourceConfig,
    WorkflowConfig,
)
from metadata.generated.schema.type.basic import FullyQualifiedEntityName
from metadata.generated.schema.type.containerDataModel import ContainerDataModel
from metadata.profiler.source.model import ProfilerSourceAndEntity
from metadata.sampler.processor import SamplerProcessor


@pytest.fixture
def container_entity():
    """Create a test Container entity"""
    return Container(
        id=uuid.uuid4(),
        name="test_container",
        fullyQualifiedName=FullyQualifiedEntityName("s3_service.test_container"),
        dataModel=ContainerDataModel(
            columns=[
                Column(name="id", dataType=DataType.INT),
                Column(name="name", dataType=DataType.STRING),
                Column(name="email", dataType=DataType.STRING),
            ]
        ),
    )


@pytest.fixture
def table_entity():
    """Create a test Table entity for comparison"""
    return Table(
        id=uuid.uuid4(),
        name="test_table",
        fullyQualifiedName=FullyQualifiedEntityName("mysql.db.test_table"),
        columns=[
            Column(name="id", dataType=DataType.INT),
            Column(name="name", dataType=DataType.STRING),
        ],
    )


@pytest.fixture
def workflow_config():
    """Create test workflow configuration"""
    return OpenMetadataWorkflowConfig(
        source=Source(
            type="s3",
            serviceName="s3_service",
            sourceConfig=SourceConfig(
                config=StorageServiceAutoClassificationPipeline(
                    storeSampleData=True, sampleDataCount=50
                ),
            ),
        ),
        processor=Processor(type="orm-profiler", config={}),
        sink=Sink(type="metadata-rest", config={}),
        workflowConfig=WorkflowConfig(
            openMetadataServerConfig=OpenMetadataConnection(
                hostPort="localhost:8585/api",
            )
        ),
    )


@patch("metadata.sampler.processor.SamplerProcessor._copy_service_config")
@patch("metadata.sampler.processor.import_sampler_class")
def test_sampler_processor_handles_container(
    mock_import_sampler, mock_copy_config, container_entity, workflow_config
):
    """Test that SamplerProcessor can handle Container entities"""

    # Setup mocks
    mock_sampler_class = MagicMock()
    mock_sampler_instance = MagicMock()
    mock_sampler_instance.generate_sample_data.return_value = [
        ["1", "Alice", "alice@example.com"],
        ["2", "Bob", "bob@example.com"],
    ]
    mock_sampler_class.create.return_value = mock_sampler_instance
    mock_import_sampler.return_value = mock_sampler_class
    mock_copy_config.return_value = {}

    # Create processor
    metadata_mock = MagicMock()
    processor = SamplerProcessor(
        config=workflow_config,
        metadata=metadata_mock,
    )

    # Create profiler source and entity
    profiler_source = MagicMock()
    record = ProfilerSourceAndEntity(
        profiler_source=profiler_source, entity=container_entity
    )

    # Process the container
    result = processor._run(record)

    # Assertions
    assert result.right is not None
    assert result.left is None
    assert result.right.entity == container_entity
    assert result.right.sample_data is not None
    assert result.right.sample_data.store is True


@patch("metadata.sampler.processor.SamplerProcessor._copy_service_config")
@patch("metadata.sampler.processor.import_sampler_class")
def test_sampler_processor_handles_table(
    mock_import_sampler, mock_copy_config, table_entity, workflow_config
):
    """Test that SamplerProcessor still handles Table entities correctly"""

    # Setup mocks
    mock_sampler_class = MagicMock()
    mock_sampler_instance = MagicMock()
    mock_sampler_instance.generate_sample_data.return_value = [
        ["1", "Alice"],
        ["2", "Bob"],
    ]
    mock_sampler_class.create.return_value = mock_sampler_instance
    mock_import_sampler.return_value = mock_sampler_class
    mock_copy_config.return_value = {}

    # Create processor
    metadata_mock = MagicMock()

    # Mock get_context_entities to return database entity
    with patch("metadata.sampler.processor.get_context_entities") as mock_get_context:
        mock_get_context.return_value = (Mock(), Mock(), None)

        processor = SamplerProcessor(
            config=workflow_config,
            metadata=metadata_mock,
        )

        # Create profiler source and entity
        profiler_source = MagicMock()
        record = ProfilerSourceAndEntity(
            profiler_source=profiler_source, entity=table_entity
        )

        # Process the table
        result = processor._run(record)

        # Assertions
        assert result.right is not None
        assert result.left is None
        assert result.right.entity == table_entity


def test_sampler_processor_run_for_container_no_context_entities(
    container_entity, workflow_config
):
    """Test that _run_for_container doesn't require database/schema context"""

    with patch("metadata.sampler.processor.import_sampler_class") as mock_import:
        mock_sampler_class = MagicMock()
        mock_sampler_instance = MagicMock()
        mock_sampler_instance.generate_sample_data.return_value = []
        mock_sampler_class.create.return_value = mock_sampler_instance
        mock_import.return_value = mock_sampler_class

        metadata_mock = MagicMock()
        processor = SamplerProcessor(
            config=workflow_config,
            metadata=metadata_mock,
        )

        profiler_source = MagicMock()
        record = ProfilerSourceAndEntity(
            profiler_source=profiler_source, entity=container_entity
        )

        with patch.object(processor, "_copy_service_config", return_value={}):
            result = processor._run_for_container(container_entity, record)

            # Verify sampler was created with None for schema/database entities
            call_args = mock_sampler_class.create.call_args
            assert call_args.kwargs["schema_entity"] is None
            assert call_args.kwargs["database_entity"] is None
            assert call_args.kwargs["entity"] == container_entity


def test_sampler_processor_unsupported_entity_type(workflow_config):
    """Test that processor rejects unsupported entity types"""

    # Create an unsupported entity type (just a mock object)
    unsupported_entity = MagicMock()
    unsupported_entity.fullyQualifiedName.root = "unsupported.entity"

    with patch("metadata.sampler.processor.import_sampler_class"):
        metadata_mock = MagicMock()
        processor = SamplerProcessor(
            config=workflow_config,
            metadata=metadata_mock,
        )

        profiler_source = MagicMock()
        record = ProfilerSourceAndEntity(
            profiler_source=profiler_source, entity=unsupported_entity
        )

        result = processor._run(record)

        # Should return error for unsupported type
        assert result.left is not None
        assert result.right is None
        assert "Unsupported entity type" in result.left.error


def test_sample_data_store_flag_respected(container_entity, workflow_config):
    """Test that storeSampleData flag is properly passed to SampleData"""

    # Test with storeSampleData=False
    workflow_config.source.sourceConfig.config.storeSampleData = False

    with patch("metadata.sampler.processor.import_sampler_class") as mock_import:
        mock_sampler_class = MagicMock()
        mock_sampler_instance = MagicMock()
        mock_sampler_instance.generate_sample_data.return_value = []
        mock_sampler_class.create.return_value = mock_sampler_instance
        mock_import.return_value = mock_sampler_class

        metadata_mock = MagicMock()
        processor = SamplerProcessor(
            config=workflow_config,
            metadata=metadata_mock,
        )

        profiler_source = MagicMock()
        record = ProfilerSourceAndEntity(
            profiler_source=profiler_source, entity=container_entity
        )

        with patch.object(processor, "_copy_service_config", return_value={}):
            result = processor._run_for_container(container_entity, record)

            assert result.right.sample_data.store is False
