"""
Unit tests for ES mixin circuit breaking and retry behavior.
"""
from unittest.mock import MagicMock, Mock, patch

import pytest

from metadata.ingestion.ometa.mixins.es_mixin import (
    CIRCUIT_BREAKING_EXCEPTION,
    ES_RETRY_BACKOFF_SECONDS,
    ESMixin,
    ESResponse,
)


class FakeESMixin(ESMixin):
    """Minimal concrete subclass for testing."""

    def __init__(self, client):
        self.client = client
        self.get_by_name = Mock(return_value=None)


class TestCircuitBreakingException:
    """Tests that circuit_breaking_exception is detected and handled correctly."""

    def _make_circuit_breaking_error(self) -> Exception:
        return Exception(
            "An exception with message [Elasticsearch exception "
            "[type=circuit_breaking_exception, reason=[parent] Data too large]]"
        )

    def test_search_es_entity_circuit_breaking_returns_none(self):
        """_search_es_entity returns None and caches it when circuit breaker fires."""
        mock_client = Mock()
        mock_client.get.side_effect = self._make_circuit_breaking_error()
        mixin = FakeESMixin(mock_client)

        result = mixin._search_es_entity(
            entity_type=Mock(__name__="Table"),
            query_string="/search/fieldQuery?fieldName=fullyQualifiedName&fieldValue=a.b.c&from=0&size=10&index=table_search_index&deleted=false",
        )

        assert result is None

    def test_search_es_entity_circuit_breaking_caches_failure(self):
        """lru_cache stores the None result so ES is not re-queried on repeated calls."""
        mock_client = Mock()
        mock_client.get.side_effect = self._make_circuit_breaking_error()
        mixin = FakeESMixin(mock_client)

        query_string = "/search/fieldQuery?fieldName=fullyQualifiedName&fieldValue=x.y&from=0&size=10&index=table_search_index&deleted=false"
        entity_type = Mock(__name__="Table")

        mixin._search_es_entity(entity_type=entity_type, query_string=query_string)
        mixin._search_es_entity(entity_type=entity_type, query_string=query_string)
        mixin._search_es_entity(entity_type=entity_type, query_string=query_string)

        # Despite three calls, ES is only hit once because the failure is cached.
        assert mock_client.get.call_count == 1

    def test_search_es_entity_circuit_breaking_logs_warning(self, caplog):
        """circuit_breaking_exception is logged with the specific keyword."""
        import logging

        mock_client = Mock()
        mock_client.get.side_effect = self._make_circuit_breaking_error()
        mixin = FakeESMixin(mock_client)

        with caplog.at_level(logging.WARNING):
            mixin._search_es_entity(
                entity_type=Mock(__name__="Container"),
                query_string="/search/fieldQuery?q=test",
            )

        assert any(CIRCUIT_BREAKING_EXCEPTION in record.message for record in caplog.records)

    def test_get_es_response_circuit_breaking_logs_error(self, caplog):
        """_get_es_response logs an error with circuit-breaker guidance."""
        import logging

        mock_client = Mock()
        mock_client.get.side_effect = self._make_circuit_breaking_error()
        mixin = FakeESMixin(mock_client)

        with caplog.at_level(logging.ERROR):
            result = mixin._get_es_response("/search/query?q=test")

        assert result is None
        assert any(CIRCUIT_BREAKING_EXCEPTION in record.message for record in caplog.records)

    def test_get_es_response_non_circuit_breaking_logs_generic_error(self, caplog):
        """_get_es_response logs the generic connectivity message for other errors."""
        import logging

        mock_client = Mock()
        mock_client.get.side_effect = Exception("Connection refused")
        mixin = FakeESMixin(mock_client)

        with caplog.at_level(logging.ERROR):
            result = mixin._get_es_response("/search/query?q=test")

        assert result is None
        assert any("connectivity problems" in record.message for record in caplog.records)


class TestPaginateESInternalBackoff:
    """Tests that _paginate_es_internal backs off between retries."""

    def _build_valid_response(self) -> dict:
        return {
            "hits": {
                "total": {"value": 0, "relation": "eq"},
                "hits": [],
            }
        }

    @patch("metadata.ingestion.ometa.mixins.es_mixin.time.sleep")
    def test_backoff_applied_on_empty_response(self, mock_sleep):
        """Exponential backoff is applied when pages fail."""
        mock_client = Mock()
        mock_client.get.return_value = None
        mixin = FakeESMixin(mock_client)

        # Exhaust all retries (3 failures → break)
        list(
            mixin._paginate_es_internal(
                entity=Mock(__name__="Table"),
            )
        )

        # First retry sleeps 1 * ES_RETRY_BACKOFF_SECONDS, second sleeps 2 * ES_RETRY_BACKOFF_SECONDS
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1 * ES_RETRY_BACKOFF_SECONDS)
        mock_sleep.assert_any_call(2 * ES_RETRY_BACKOFF_SECONDS)

    @patch("metadata.ingestion.ometa.mixins.es_mixin.time.sleep")
    def test_no_sleep_on_successful_response(self, mock_sleep):
        """No sleep is applied when pages succeed."""
        valid_response = self._build_valid_response()
        mock_client = Mock()
        mock_client.get.return_value = valid_response
        mixin = FakeESMixin(mock_client)

        list(
            mixin._paginate_es_internal(
                entity=Mock(__name__="Table"),
            )
        )

        mock_sleep.assert_not_called()
