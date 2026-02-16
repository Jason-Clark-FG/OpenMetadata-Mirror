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

from sqlalchemy import Integer

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


class TestPinotDBProfilerInterfaceDeclaration:
    def test_histogram_override_is_registered(self) -> None:
        assert (
            PinotDBProfilerInterface.HYBRID_METRIC_OVERRIDES[MetricType.histogram.value]
            is PinotDBHistogram
        )

    def test_get_hybrid_metrics_uses_pinot_histogram(self) -> None:
        with patch.object(SQAProfilerInterface, "__init__", return_value=None):
            interface = PinotDBProfilerInterface.__new__(PinotDBProfilerInterface)

        column = MagicMock()
        column_results: dict = {}

        with patch.object(
            SQAProfilerInterface, "get_hybrid_metrics"
        ) as mock_parent_get_hybrid_metrics:
            interface.get_hybrid_metrics(
                column=column, metric=Histogram, column_results=column_results
            )

        mock_parent_get_hybrid_metrics.assert_called_once_with(
            column, PinotDBHistogram, column_results
        )
