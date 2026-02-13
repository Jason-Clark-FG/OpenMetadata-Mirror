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
Profiler interface for PinotDB, overriding hybrid metrics with PinotDB-specific implementations.
"""

from typing import ClassVar, Dict, Type

from metadata.generated.schema.configuration.profilerConfiguration import MetricType
from metadata.profiler.interface.sqlalchemy.profiler_interface import (
    SQAProfilerInterface,
)
from metadata.profiler.metrics.core import HybridMetric
from metadata.profiler.metrics.hybrid.pinot.histogram import PinotDBHistogram


class PinotDBProfilerInterface(SQAProfilerInterface):
    """PinotDB-specific profiler interface."""

    HYBRID_METRIC_OVERRIDES: ClassVar[Dict[str, Type[HybridMetric]]] = {
        MetricType.histogram.value: PinotDBHistogram,
    }
