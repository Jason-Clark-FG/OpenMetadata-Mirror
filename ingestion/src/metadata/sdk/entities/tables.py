"""Tables entity SDK with fluent helpers."""
from __future__ import annotations

from typing import Any, Optional, Type, cast
from uuid import UUID

from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.api.tests.createCustomMetric import (
    CreateCustomMetricRequest,
)
from metadata.generated.schema.entity.data.table import Table, TableData
from metadata.generated.schema.type.basic import (
    EntityName,
    FullyQualifiedEntityName,
    Uuid,
)
from metadata.sdk.entities.base import BaseEntity
from metadata.sdk.types import UuidLike


class Tables(BaseEntity[Table, CreateTableRequest]):
    """SDK facade for `Table` entities."""

    @classmethod
    def entity_type(cls) -> Type[Table]:
        return Table

    @classmethod
    def add_tag(cls, table_id: UuidLike, tag_fqn: str) -> Table:
        """Attach a classification or glossary tag to the table."""
        import copy

        current = cls.retrieve(table_id, fields=["tags"])
        patched = copy.deepcopy(current)
        tags = list(getattr(patched, "tags", None) or [])
        from metadata.generated.schema.type.tagLabel import TagLabel

        tags.append(TagLabel(tagFQN=tag_fqn, labelType="Manual", state="Confirmed"))
        patched.tags = tags
        return cls.update(patched)

    @classmethod
    def update_column_description(
        cls, table_id: UuidLike, column_name: str, description: str
    ) -> Table:
        """Update the description for a specific column."""
        import copy

        current = cls.retrieve(table_id, fields=["columns"])
        patched = copy.deepcopy(current)
        for col in patched.columns or []:
            if str(getattr(col, "name", "")) == column_name:
                col.description = description
                break
        return cls.update(patched)

    # -- Sample Data --
    @classmethod
    def get_sample_data(cls, table_id: UuidLike) -> Any:
        """Get sample data for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.get(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/sampleData"
        )

    @classmethod
    def add_sample_data(cls, table_id: UuidLike, data: Dict[str, Any]) -> Any:
        """Add sample data to a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/sampleData", json=data
        )

    @classmethod
    def delete_sample_data(cls, table_id: UuidLike) -> None:
        """Delete sample data from a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        rest_client.delete(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/sampleData"
        )

    # -- Profiler Config --
    @classmethod
    def get_profiler_config(cls, table_id: UuidLike) -> Any:
        """Get the profiler configuration for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.get(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/profilerConfig"
        )

    @classmethod
    def set_profiler_config(cls, table_id: UuidLike, config: Dict[str, Any]) -> Any:
        """Set the profiler configuration for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/profilerConfig",
            json=config,
        )

    @classmethod
    def delete_profiler_config(cls, table_id: UuidLike) -> None:
        """Delete the profiler configuration for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        rest_client.delete(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/profilerConfig"
        )

    # -- Pipeline Observability --
    @classmethod
    def get_pipeline_observability(cls, table_id: UuidLike) -> Any:
        """Get pipeline observability data for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.get(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/pipelineObservability"
        )

    @classmethod
    def add_pipeline_observability(
        cls, table_id: UuidLike, data: Dict[str, Any]
    ) -> Any:
        """Add pipeline observability data to a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/pipelineObservability",
            json=data,
        )

    # -- Joins --
    @classmethod
    def add_joins(cls, table_id: UuidLike, joins: Dict[str, Any]) -> Any:
        """Add join information to a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/joins", json=joins
        )

    # -- Data Model --
    @classmethod
    def set_data_model(cls, table_id: UuidLike, model: Dict[str, Any]) -> Any:
        """Set the data model for a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/dataModel", json=model
        )

    # -- Custom Metrics --
    @classmethod
    def add_custom_metric(cls, table_id: UuidLike, metric: Dict[str, Any]) -> Any:
        """Add a custom metric to a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        return rest_client.put(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/customMetric",
            json=metric,
        )

    @classmethod
    def delete_custom_metric(cls, table_id: UuidLike, metric_name: str) -> None:
        """Delete a custom metric from a table."""
        client = cls._get_client()
        rest_client = cls._get_rest_client(client)
        endpoint = cls._get_endpoint_path(client)
        rest_client.delete(
            f"{endpoint}/{cls._stringify_identifier(table_id)}/customMetric/{metric_name}"
        )
        return cls._coerce_entity(updated)

    @classmethod
    def add_custom_metric(
        cls, table_id: UuidLike, custom_metric: CreateCustomMetricRequest
    ) -> Table:
        """Add or update a table-level custom metric."""
        client = cls._get_client()
        updated = cast(Any, client).create_or_update_custom_metric(
            custom_metric=custom_metric,
            table_id=cls._stringify_identifier(table_id),
        )
        return cls._coerce_entity(updated)

    @classmethod
    def add_sample_data(
        cls, table_id: UuidLike, sample_data: TableData
    ) -> Optional[TableData]:
        """Attach sample data rows to a table."""
        client = cls._get_client()
        table = cls._build_table_reference(table_id)
        return client.ingest_table_sample_data(table, sample_data)

    @classmethod
    def get_sample_data(cls, table_id: UuidLike) -> Optional[Table]:
        """Fetch a table including its sample data payload."""
        client = cls._get_client()
        table = cls._build_table_reference(table_id)
        result = cast(Any, client).get_sample_data(table)
        if result is None:
            return None
        return cls._coerce_entity(result)

    @classmethod
    def _build_table_reference(cls, table_id: UuidLike) -> Table:
        """Build a lightweight table reference object for table-specific operations."""
        table_id_value = cls._stringify_identifier(table_id)
        table_uuid = UUID(table_id_value)
        table_ref_name = f"sdk_ref_{table_id_value[:8]}"
        table_ref_fqn = f"sdk.ref.{table_id_value}"
        table_reference = cast(Any, Table).model_construct(
            id=Uuid(root=table_uuid),
            name=EntityName(root=table_ref_name),
            fullyQualifiedName=FullyQualifiedEntityName(root=table_ref_fqn),
            columns=[],
        )
        return cast(Table, table_reference)
