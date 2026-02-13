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
Unit tests for PinotDB profiler classes:
  - PinotDBHistogram.fn()
  - SQAProfilerInterface.get_hybrid_metrics() dispatch
  - PinotDBProfilerInterface class-level declarations
"""
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Integer
from sqlalchemy import column as sa_column

from metadata.generated.schema.configuration.profilerConfiguration import MetricType
from metadata.profiler.interface.sqlalchemy.pinotdb.profiler_interface import (
    PinotDBProfilerInterface,
)
from metadata.profiler.interface.sqlalchemy.profiler_interface import (
    SQAProfilerInterface,
)
from metadata.profiler.metrics.composed.iqr import InterQuartileRange
from metadata.profiler.metrics.hybrid.histogram import Histogram
from metadata.profiler.metrics.hybrid.pinot.histogram import PinotDBHistogram
from metadata.profiler.metrics.static.count import Count
from metadata.profiler.metrics.static.max import Max
from metadata.profiler.metrics.static.min import Min


def _make_histogram_instance(col_type=None) -> PinotDBHistogram:
    """Build a PinotDBHistogram with a minimal mock column."""
    col = MagicMock()
    col.type = col_type if col_type is not None else MagicMock(spec=Integer)
    col.name = "value"
    return PinotDBHistogram(col)


def _res_with(
    count: float = 100.0,
    min_val: float = 0.0,
    max_val: float = 100.0,
    iqr: float = 25.0,
) -> dict:
    return {
        Count.name(): count,
        Min.name(): min_val,
        Max.name(): max_val,
        InterQuartileRange.name(): iqr,
    }


class TestPinotDBHistogramFn:
    def test_fn_passes_correct_initial_bounds(self) -> None:
        histogram = _make_histogram_instance()
        session = MagicMock()
        sample = MagicMock()
        res = _res_with(count=100.0, min_val=0.0, max_val=100.0, iqr=25.0)

        _, bin_width = histogram._get_bins(
            float(res[InterQuartileRange.name()]),
            float(res[Count.name()]),
            float(res[Min.name()]),
            float(res[Max.name()]),
        )
        expected_starting = float(res[Min.name()])
        expected_ending = expected_starting + bin_width

        with patch.object(
            histogram,
            "get_sqlalchemy_histogram",
            return_value={"boundaries": [], "frequencies": []},
        ) as mock_get_hist:
            with patch(
                "metadata.profiler.metrics.hybrid.pinot.histogram.is_quantifiable",
                return_value=True,
            ):
                with patch(
                    "metadata.profiler.metrics.hybrid.pinot.histogram.is_value_non_numeric",
                    return_value=False,
                ):
                    with patch(
                        "metadata.profiler.metrics.hybrid.pinot.histogram.is_concatenable",
                        return_value=False,
                    ):
                        histogram.fn(sample, res, session)

        mock_get_hist.assert_called_once()
        _args, _kwargs = mock_get_hist.call_args
        _, _num_bins, actual_starting, actual_ending, *_ = _args

        assert actual_starting == expected_starting
        assert actual_ending == pytest.approx(expected_ending)

    def test_fn_returns_none_for_non_quantifiable(self) -> None:
        histogram = _make_histogram_instance()
        session = MagicMock()
        sample = MagicMock()
        res = _res_with()

        with patch(
            "metadata.profiler.metrics.hybrid.pinot.histogram.is_quantifiable",
            return_value=False,
        ):
            result = histogram.fn(sample, res, session)

        assert result is None

    def test_fn_returns_none_when_res_missing(self) -> None:
        histogram = _make_histogram_instance()
        session = MagicMock()
        sample = MagicMock()

        incomplete_res = {
            Min.name(): 0.0,
            Max.name(): 100.0,
        }

        with patch(
            "metadata.profiler.metrics.hybrid.pinot.histogram.is_quantifiable",
            return_value=True,
        ):
            with patch(
                "metadata.profiler.metrics.hybrid.pinot.histogram.is_value_non_numeric",
                return_value=False,
            ):
                result = histogram.fn(sample, incomplete_res, session)

        assert result is None


class TestHybridMetricOverrideDispatch:
    def _make_interface(self, overrides: dict) -> SQAProfilerInterface:
        interface = MagicMock(spec=SQAProfilerInterface)
        interface.HYBRID_METRIC_OVERRIDES = overrides
        interface.get_hybrid_metrics = SQAProfilerInterface.get_hybrid_metrics.__get__(
            interface, type(interface)
        )
        return interface

    def test_override_dispatches_to_pinot_histogram(self) -> None:
        overrides = {MetricType.histogram.value: PinotDBHistogram}
        interface = self._make_interface(overrides)
        interface.sampler = MagicMock()
        interface.sampler.get_dataset.return_value = MagicMock()
        interface.session = MagicMock()

        col = MagicMock()
        col.type = MagicMock(spec=Integer)
        col.name = "value"
        column_results = _res_with()

        with patch.object(
            PinotDBHistogram, "fn", return_value={"boundaries": [], "frequencies": []}
        ) as mock_pinot_fn:
            with patch.object(Histogram, "fn", return_value=None) as mock_base_fn:
                interface.get_hybrid_metrics(col, Histogram, column_results)

        mock_pinot_fn.assert_called_once()
        mock_base_fn.assert_not_called()

    def test_no_override_uses_original_metric(self) -> None:
        interface = self._make_interface({})
        interface.sampler = MagicMock()
        interface.sampler.get_dataset.return_value = MagicMock()
        interface.session = MagicMock()

        col = MagicMock()
        col.type = MagicMock(spec=Integer)
        col.name = "value"
        column_results = _res_with()

        with patch.object(
            Histogram, "fn", return_value={"boundaries": [], "frequencies": []}
        ) as mock_base_fn:
            with patch.object(
                PinotDBHistogram, "fn", return_value=None
            ) as mock_pinot_fn:
                interface.get_hybrid_metrics(col, Histogram, column_results)

        mock_base_fn.assert_called_once()
        mock_pinot_fn.assert_not_called()


class TestPinotDBProfilerInterfaceDeclaration:
    def test_histogram_override_is_registered(self) -> None:
        assert (
            PinotDBProfilerInterface.HYBRID_METRIC_OVERRIDES[MetricType.histogram.value]
            is PinotDBHistogram
        )

    def test_override_dict_does_not_mutate_base_class(self) -> None:
        assert SQAProfilerInterface.HYBRID_METRIC_OVERRIDES == {}


class TestPinotDBGetSqlalchemyHistogram:
    def _make_histogram(self) -> PinotDBHistogram:
        return _make_histogram_instance()

    def _make_session(self, first_return_value=None):
        query_chain = MagicMock()
        query_chain.select_from.return_value = query_chain
        query_chain.first.return_value = first_return_value

        session = MagicMock()
        session.query.return_value = query_chain
        return session, query_chain

    def test_scale_factor_is_applied_to_bounds(self) -> None:
        histogram = self._make_histogram()
        sample = MagicMock()
        col = sa_column("age", Integer)

        row_mock = MagicMock()
        row_mock.keys.return_value = ["12.000 to 19.000", "19.000 and up"]
        row_mock.__iter__ = MagicMock(return_value=iter([45, 12]))

        session, _ = self._make_session(first_return_value=row_mock)

        histogram.get_sqlalchemy_histogram(
            col=col,
            num_bins=2,
            starting_bin_bound=12.0,
            ending_bin_bound=19.0,
            bin_width=7.0,
            session=session,
            sample=sample,
        )

        case_stmts = session.query.call_args[0]
        compiled_sql = " ".join(
            str(arg.compile(compile_kwargs={"literal_binds": True}))
            for arg in case_stmts
        )

        assert "12000" in compiled_sql
        assert "19000" in compiled_sql

    def test_single_query_not_subquery(self) -> None:
        histogram = self._make_histogram()
        sample = MagicMock()
        col = sa_column("age", Integer)

        session, _ = self._make_session(first_return_value=None)

        histogram.get_sqlalchemy_histogram(
            col=col,
            num_bins=3,
            starting_bin_bound=0.0,
            ending_bin_bound=10.0,
            bin_width=10.0,
            session=session,
            sample=sample,
        )

        assert session.query.call_count == 1

    def test_returns_histogram_result(self) -> None:
        histogram = self._make_histogram()
        sample = MagicMock()
        col = sa_column("age", Integer)

        row_mock = MagicMock()
        row_mock.keys.return_value = ["12.000 to 19.000", "19.000 and up"]
        row_mock.__iter__ = MagicMock(return_value=iter([45, 12]))

        session, _ = self._make_session(first_return_value=row_mock)

        result = histogram.get_sqlalchemy_histogram(
            col=col,
            num_bins=2,
            starting_bin_bound=12.0,
            ending_bin_bound=19.0,
            bin_width=7.0,
            session=session,
            sample=sample,
        )

        assert result is not None
        assert result["boundaries"] == ["12.000 to 19.000", "19.000 and up"]
        assert result["frequencies"] == [45, 12]

    def test_returns_none_on_empty_rows(self) -> None:
        histogram = self._make_histogram()
        sample = MagicMock()
        col = sa_column("age", Integer)

        session, _ = self._make_session(first_return_value=None)

        result = histogram.get_sqlalchemy_histogram(
            col=col,
            num_bins=2,
            starting_bin_bound=12.0,
            ending_bin_bound=19.0,
            bin_width=7.0,
            session=session,
            sample=sample,
        )

        assert result is None
