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
BurstIQ Sampler.

Fetches records from a BurstIQ chain via TQL, converts them to a
pandas DataFrame, and exposes the standard SamplerInterface contract
so that PandasProfilerInterface can be used without any BurstIQ-specific
profiler code.
"""
from typing import Callable, Iterator, List, Optional, TYPE_CHECKING

import pandas as pd

from metadata.generated.schema.entity.data.table import (
    DataType,
    ProfileSampleType,
    TableData,
)
from metadata.sampler.sampler_interface import SamplerInterface
from metadata.utils.constants import SAMPLE_DATA_DEFAULT_COUNT
from metadata.utils.sqa_like_column import SQALikeColumn

if TYPE_CHECKING:
    from metadata.ingestion.source.database.burstiq.client import BurstIQClient

_DEFAULT_PROFILER_LIMIT = 10_000

_NUMERIC_TYPES = {
    DataType.INT,
    DataType.BIGINT,
    DataType.SMALLINT,
    DataType.TINYINT,
    DataType.LONG,
    DataType.FLOAT,
    DataType.DOUBLE,
    DataType.DECIMAL,
    DataType.NUMERIC,
    DataType.NUMBER,
}

_DATETIME_TYPES = {
    DataType.TIMESTAMP,
    DataType.DATETIME,
    DataType.DATE,
    DataType.TIME,
}


class BurstIQSampler(SamplerInterface):
    """
    Sampler for BurstIQ LifeGraph.

    Replaces both NoSQLSampler and BurstIQAdaptor for the profiler path.
    Records are fetched once via TQL and cached as a DataFrame so that
    PandasProfilerInterface can compute all metrics in-memory.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client: "BurstIQClient" = self.get_client()
        self._cached_df: Optional[pd.DataFrame] = None

    # ------------------------------------------------------------------
    # SamplerInterface abstract methods
    # ------------------------------------------------------------------

    def get_client(self) -> "BurstIQClient":
        """Return the BurstIQClient created by get_ssl_connection in the base __init__."""
        return self.connection

    @property
    def raw_dataset(self) -> Callable[[], Iterator[pd.DataFrame]]:
        """Lazy-fetch and cache records as a single DataFrame, return a callable iterator."""
        if self._cached_df is None:
            limit = self._get_limit()
            chain = self.entity.name.root
            records = self.client.get_records_by_tql(chain, limit=int(limit))
            df = pd.DataFrame(records) if records else pd.DataFrame()
            self._cached_df = self._cast_dataframe(df)
            df_cols = set(self._cached_df.columns)
            om_cols = {c.name.root for c in self.entity.columns}
            print(f"[DEBUG] df columns ({len(df_cols)}): {sorted(df_cols)}")
            print(f"[DEBUG] OM columns ({len(om_cols)}): {sorted(om_cols)}")
            print(f"[DEBUG] In OM but missing from df: {sorted(om_cols - df_cols)}")
            print(f"[DEBUG] In df but not in OM: {sorted(df_cols - om_cols)}")
        df = self._cached_df
        return lambda: iter([df])

    def get_dataset(self, **__) -> Callable[[], Iterator[pd.DataFrame]]:
        """Return the dataset callable (sampling applied via TQL limit)."""
        return self.raw_dataset

    def _rdn_sample_from_user_query(self) -> Callable[[], Iterator[pd.DataFrame]]:
        """BurstIQ does not support custom profiler queries; fall back to full scan."""
        return self.raw_dataset

    def _fetch_sample_data_from_user_query(self) -> TableData:
        """BurstIQ does not support custom profiler queries; fall back to full scan."""
        return self.fetch_sample_data(self.columns)

    def fetch_sample_data(self, columns: Optional[List[SQALikeColumn]]) -> TableData:
        """Return a TableData snapshot for the Data Preview tab in the UI."""
        df = next(self.raw_dataset())
        target_cols = [c.name for c in (columns or self.get_columns())]

        if df.empty:
            return TableData(columns=target_cols, rows=[])

        available = [c for c in target_cols if c in df.columns]
        row_limit = min(self.sample_limit or SAMPLE_DATA_DEFAULT_COUNT, len(df))
        subset = df[available].head(row_limit)

        rows = [
            [self._truncate_cell(str(v)) for v in row]
            for row in subset.itertuples(index=False, name=None)
        ]
        return TableData(columns=available, rows=rows)

    def get_columns(self) -> List[SQALikeColumn]:
        """Return SQALikeColumn list derived from the OM Table entity."""
        df = next(self.raw_dataset())
        df_cols = set(df.columns)
        om_cols = {c.name.root for c in self.entity.columns}
        missing = om_cols - df_cols
        extra = df_cols - om_cols
        print(f"[DEBUG] df columns ({len(df_cols)}): {sorted(df_cols)}")
        print(f"[DEBUG] OM columns in entity ({len(om_cols)}): {sorted(om_cols)}")
        print(f"[DEBUG] In OM but missing from df ({len(missing)}): {sorted(missing)}")
        print(f"[DEBUG] In df but not in OM ({len(extra)}): {sorted(extra)}")
        return [
            SQALikeColumn(name=c.name.root, type=c.dataType)
            for c in self.entity.columns
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _cast_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Cast DataFrame columns to their declared types from OM entity metadata.

        BurstIQ TQL returns all values as raw JSON types — large integers may arrive
        as scientific-notation strings (e.g. "9.87E+08") and mismatched columns may
        contain strings where metadata declares INT. Using errors='coerce' converts
        unparseable values to NaN instead of raising, so the profiler degrades
        gracefully rather than hard-failing.
        """
        if df.empty or not self.entity.columns:
            return df
        for col in self.entity.columns:
            col_name = col.name.root
            if col_name not in df.columns:
                continue
            if col.dataType in _NUMERIC_TYPES:
                df[col_name] = pd.to_numeric(df[col_name], errors="coerce")
            elif col.dataType in _DATETIME_TYPES:
                df[col_name] = pd.to_datetime(
                    df[col_name], errors="coerce", utc=True
                )
        return df

    def _get_limit(self) -> int:
        """Compute the TQL record fetch limit from the profiler sample config."""
        sample = self.sample_config.profileSample
        sample_type = self.sample_config.profileSampleType

        if sample and sample_type == ProfileSampleType.ROWS:
            return int(sample)

        if sample and sample_type == ProfileSampleType.PERCENTAGE:
            chain_metrics = self.client.get_chain_metrics()
            total = chain_metrics.get(self.entity.name.root, 0)
            return max(1, int(total * sample / 100))

        return _DEFAULT_PROFILER_LIMIT
