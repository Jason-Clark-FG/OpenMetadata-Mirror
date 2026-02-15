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
PinotDB Histogram Metric definition
"""
from typing import Any, Dict, List, Optional, Union, cast

from sqlalchemy import and_, case, column, func, literal
from sqlalchemy.orm import DeclarativeMeta, Session

from metadata.profiler.metrics.hybrid.histogram import Histogram, HistogramResult
from metadata.profiler.metrics.static.max import Max
from metadata.profiler.metrics.static.min import Min
from metadata.profiler.orm.functions.length import LenFn
from metadata.profiler.orm.registry import (
    is_concatenable,
    is_quantifiable,
    is_value_non_numeric,
)


class PinotDBHistogram(Histogram):
    """
    PinotDB-specific Histogram metric.

    This solves a few issues:

    1. Pinot's `COUNT` function does not ignore nulls, so the previous implementation of
    the histogram wasn't really counting the rows that matched the criteria.

    e.g:
        INSERT INTO data_source (id, age) VALUES (1, 19), (2, 25), (3, 30), (4, 54), (5, 42);
        SELECT
            COUNT(CASE WHEN (age >= 1.0 AND age < 30.0) END) AS bad_count,
            SUM(CASE WHEN (age >= 1.0 AND age < 30.0) THEN 1 ELSE 0 END) AS good_count
        FROM
            data_source;

    Would return a `bad_count` of 5, while `good_count` would correctly count 2 values in range [1, 30)

    2. Pinot has what I understand is a bug in its query compiling process where
    integer-float comparisons throw a number parsing error in queries that nest - from
    what I've gathered - `CASE WHEN` expressions inside an aggregate function like `SUM`.

    e.g:
        SELECT
            SUM(
                CASE
                    WHEN (id >= 1.0 AND id < 57.54) THEN 1
                    ELSE 0
                END
            ) as counts_bin_1
        FROM
            data source;

    In this case an error in the compilation process of the query would fail with a number format
    exception. Casting it to float does not work either, because Pinot also fails compiling the query with yet another error
    because of the nested cast. Nested queries or WITH SELECT statements do not work either.

    So we're left with a workaround that removes precision but works: multiply both elements of the inequation
    by a power of 10 and compare at a higher order of magnitude. That way we achieve get an integer comparison
    without sacrificing too much precision.

    e.g:
        SELECT
            SUM(
                CASE
                    WHEN (id * 1000 >= 1000 AND id * 1000 < 57540) THEN 1
                    ELSE 0
                END
            ) as counts_bin_1
        FROM
            data source;
    """

    SCALE_FACTOR: int = 1000

    def fn(
        self,
        sample: Optional[DeclarativeMeta],
        res: Dict[str, Any],
        session: Optional[Session] = None,
    ) -> Optional[HistogramResult]:
        """
        Build a histogram query using scaled integer comparisons.

        Both the column and bin bounds are multiplied by SCALE_FACTOR so that
        all comparisons operate on integers, working around Pinot's restriction
        on CASE WHEN inside aggregate functions.
        """
        if not session:
            raise AttributeError(
                "We are missing the session attribute to compute the Histogram."
            )

        if not is_quantifiable(self.col.type) or (
            is_value_non_numeric(res.get(Min.name()))
            or is_value_non_numeric(res.get(Max.name()))
        ):
            return None

        # get the metric need for the freedman-diaconis rule
        results = self._get_res(res)
        if not results:
            return None
        res_iqr, res_row_count, res_min, res_max = results

        num_bins, bin_width = self._get_bins(res_iqr, res_row_count, res_min, res_max)

        if num_bins == 0:
            return None

        # set starting and ending bin bounds for the first bin
        starting_bin_bound = res_min
        res_min = cast(Union[float, int], res_min)  # satisfy mypy
        ending_bin_bound = res_min + bin_width

        if is_concatenable(self.col.type):
            col = LenFn(column(self.col.name, self.col.type))
        else:
            col = column(self.col.name, self.col.type)  # type: ignore

        scaled_col = col * self.SCALE_FACTOR

        case_stmts: List = []
        current_start = starting_bin_bound
        current_end = ending_bin_bound

        for bin_num in range(num_bins):
            scaled_start = round(current_start * self.SCALE_FACTOR)

            if bin_num < num_bins - 1:
                scaled_end = round(current_end * self.SCALE_FACTOR)
                condition = and_(scaled_col >= scaled_start, scaled_col < scaled_end)
                case_stmts.append(
                    func.sum(case([(condition, literal(1))], else_=literal(0))).label(
                        self._format_bin_labels(current_start, current_end)
                    )
                )
                current_start = current_end
                current_end += bin_width
            else:
                condition = scaled_col >= scaled_start
                case_stmts.append(
                    func.sum(case([(condition, literal(1))], else_=literal(0))).label(
                        self._format_bin_labels(current_start)
                    )
                )

        rows = session.query(*case_stmts).select_from(sample).first()

        if rows:
            return HistogramResult(boundaries=list(rows.keys()), frequencies=list(rows))
        return None
