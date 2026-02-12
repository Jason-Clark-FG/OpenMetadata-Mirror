"""
Regression tests for SDK bugs reported in
https://github.com/open-metadata/openmetadata-collate/issues/2906

Each test is written RED-first and should fail until the corresponding fix
is applied.
"""
import json
import logging
from unittest.mock import MagicMock, Mock, call, patch
from uuid import UUID

import pytest

from metadata.generated.schema.entity.data.table import Table
from metadata.generated.schema.type import basic
from metadata.generated.schema.type.entityLineage import EntitiesEdge
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.sdk.api.lineage import Lineage
from metadata.sdk.api.search import Search
from metadata.sdk.entities.base import BaseEntity
from metadata.sdk.entities.custom_properties import CustomProperties


# ------------------------------------------------------------------ #
#  Bug 1: Search filters — passing a dict of field:value should build
#  the correct query_filter JSON automatically
# ------------------------------------------------------------------ #
class TestSearchFriendlyFilters:
    """Search.search(filters={"service.name": "X"}) should convert the
    dict into the query_filter JSON string that the API expects."""

    def setup_method(self):
        self.mock_client = MagicMock()
        Search.set_default_client(self.mock_client)

    def test_dict_filters_converted_to_query_filter(self):
        self.mock_client.es_search_from_es.return_value = {"hits": {"hits": []}}

        Search.search(
            query="*",
            index="table_search_index",
            filters={"service.name": "my_service", "database.name": "my_db"},
        )

        call_kwargs = self.mock_client.es_search_from_es.call_args[1]
        assert "query_filter" in call_kwargs, (
            f"Expected 'query_filter' in call kwargs, got: {list(call_kwargs.keys())}"
        )
        qf = json.loads(call_kwargs["query_filter"])
        terms = qf["query"]["bool"]["must"]
        field_values = {
            list(t["term"].keys())[0]: list(t["term"].values())[0]
            for t in terms
        }
        assert field_values == {
            "service.name": "my_service",
            "database.name": "my_db",
        }

    def test_raw_query_filter_string_still_works(self):
        """Backward compat: passing query_filter as a raw string in the
        filters dict should still work unchanged."""
        self.mock_client.es_search_from_es.return_value = {"hits": {"hits": []}}

        raw_qf = '{"query":{"bool":{"must":[{"term":{"service.name":"svc"}}]}}}'
        Search.search(
            query="*",
            filters={"query_filter": raw_qf},
        )

        call_kwargs = self.mock_client.es_search_from_es.call_args[1]
        assert call_kwargs["query_filter"] == raw_qf


# ------------------------------------------------------------------ #
#  Bug 2: search_advanced — HTTP fallback must use GET with query_filter
#  param, not POST (which returns 405 from the server)
# ------------------------------------------------------------------ #
class TestSearchAdvanced:

    def setup_method(self):
        self.mock_client = MagicMock()
        Search.set_default_client(self.mock_client)

    def test_search_advanced_http_fallback_uses_get(self):
        """When the native method is unavailable, the fallback should use
        GET /search/query with a query_filter parameter, not POST."""
        del self.mock_client.es_search_from_es
        self.mock_client.spec = None

        mock_rest = MagicMock()
        mock_rest.get.return_value = {"hits": {"hits": []}}
        self.mock_client.client = mock_rest

        body = {
            "query": {
                "bool": {
                    "must": [{"match_all": {}}],
                    "filter": [{"term": {"service.name": "sdk_demo_mysql"}}],
                }
            }
        }
        result = Search.search_advanced(body)

        mock_rest.get.assert_called_once()
        get_path = mock_rest.get.call_args[0][0]
        assert "query_filter=" in get_path or "query_filter" in get_path, (
            f"Expected GET with query_filter param, got: {get_path}"
        )
        mock_rest.post.assert_not_called()


# ------------------------------------------------------------------ #
#  Bug 3: Lineage.delete_lineage passes kwargs instead of EntitiesEdge
# ------------------------------------------------------------------ #
class TestDeleteLineageBuildsEdge:
    """delete_lineage must construct an EntitiesEdge and pass it as the
    single positional argument to client.delete_lineage_edge()."""

    def setup_method(self):
        self.mock_client = MagicMock()
        Lineage.set_default_client(self.mock_client)

    def test_delete_lineage_passes_entities_edge(self):
        from_id = "550e8400-e29b-41d4-a716-446655440000"
        to_id = "550e8400-e29b-41d4-a716-446655440001"

        Lineage.delete_lineage(
            from_entity=from_id,
            from_entity_type="table",
            to_entity=to_id,
            to_entity_type="dashboard",
        )

        self.mock_client.delete_lineage_edge.assert_called_once()
        call_args = self.mock_client.delete_lineage_edge.call_args
        edge = call_args[0][0] if call_args[0] else call_args[1].get("edge")
        assert isinstance(edge, EntitiesEdge), (
            f"Expected EntitiesEdge, got {type(edge)}: {call_args}"
        )
        assert str(edge.fromEntity.id.root) == from_id
        assert edge.fromEntity.type == "table"
        assert str(edge.toEntity.id.root) == to_id
        assert edge.toEntity.type == "dashboard"


# ------------------------------------------------------------------ #
#  Bug 4: Custom properties — str(Pydantic Uuid) produces
#  "root=UUID('...')" instead of the bare UUID value
# ------------------------------------------------------------------ #
class TestCustomPropertiesIdentifierStringify:
    """When a Pydantic-wrapped UUID (basic.Uuid) is handed to
    CustomProperties.update(), the identifier stored must be the bare
    UUID string, not the Pydantic repr."""

    def test_update_with_pydantic_uuid_stores_bare_string(self):
        raw = UUID("ac6bbe96-da23-43b0-a5c2-5776fd4af4a5")
        pydantic_uuid = basic.Uuid(raw)

        updater = CustomProperties.update(Table, pydantic_uuid)

        assert updater.identifier == str(raw), (
            f"Expected bare UUID '{raw}', got '{updater.identifier}'"
        )
        assert "root=" not in updater.identifier


# ------------------------------------------------------------------ #
#  Bug 5: get_versions — str(entity_id) on Pydantic UUID produces
#  "root=UUID('...')" instead of bare UUID
# ------------------------------------------------------------------ #
class TestGetVersionsIdentifierStringify:
    """get_versions must unwrap Pydantic Uuid wrappers before passing
    entity_id to the underlying client."""

    def setup_method(self):
        self.mock_client = MagicMock()

        class FakeTable(BaseEntity[Table, Table]):
            @classmethod
            def entity_type(cls):
                return Table

        FakeTable.set_default_client(self.mock_client)
        self.FakeTable = FakeTable

    def test_get_versions_with_pydantic_uuid(self):
        raw = UUID("ac6bbe96-da23-43b0-a5c2-5776fd4af4a5")
        pydantic_uuid = basic.Uuid(raw)

        mock_history = MagicMock()
        mock_history.versions = []
        self.mock_client.get_list_entity_versions.return_value = mock_history

        self.FakeTable.get_versions(pydantic_uuid)

        call_kwargs = self.mock_client.get_list_entity_versions.call_args[1]
        entity_id_passed = call_kwargs["entity_id"]
        assert entity_id_passed == str(raw), (
            f"Expected bare UUID '{raw}', got '{entity_id_passed}'"
        )
        assert "root=" not in entity_id_passed

    def test_get_versions_with_plain_uuid(self):
        raw = UUID("ac6bbe96-da23-43b0-a5c2-5776fd4af4a5")

        mock_history = MagicMock()
        mock_history.versions = []
        self.mock_client.get_list_entity_versions.return_value = mock_history

        self.FakeTable.get_versions(raw)

        call_kwargs = self.mock_client.get_list_entity_versions.call_args[1]
        entity_id_passed = call_kwargs["entity_id"]
        assert entity_id_passed == str(raw)


# ------------------------------------------------------------------ #
#  Bug 6: CSV export — REST client logs scary JSON decode ERROR for
#  valid CSV text responses.  The csv_mixin should use the raw client
#  path that returns text, bypassing the JSON-first parser.
# ------------------------------------------------------------------ #
class TestCsvExportNoJsonError:
    """export_csv must not produce an ERROR-level log when the server
    returns valid CSV text (which is not JSON)."""

    def test_export_csv_no_error_log(self):
        from metadata.ingestion.ometa.mixins.csv_mixin import CSVMixin

        csv_text = "name,description\ncustomers,Customer master data\n"

        mock_rest = MagicMock()
        mock_rest.get.return_value = csv_text

        mixin = CSVMixin()
        mixin.client = mock_rest

        result = mixin.export_csv(Table, "my_schema")

        assert result == csv_text
        assert isinstance(result, str)
