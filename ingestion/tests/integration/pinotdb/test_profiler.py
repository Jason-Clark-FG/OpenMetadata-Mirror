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
import sys

import pytest

from _openmetadata_testutils.pydantic.test_utils import assert_equal_pydantic_objects
from metadata.generated.schema.entity.data.table import ColumnProfile
from metadata.ingestion.lineage.sql_lineage import search_cache
from metadata.workflow.metadata import MetadataWorkflow
from metadata.workflow.profiler import ProfilerWorkflow

if not sys.version_info >= (3, 9):
    pytest.skip("requires python 3.9+", allow_module_level=True)


@pytest.fixture(scope="module")
def run_profiler(
    patch_passwords_for_db_services,
    run_workflow,
    ingestion_config,
    profiler_config,
):
    search_cache.clear()
    run_workflow(MetadataWorkflow, ingestion_config)
    run_workflow(ProfilerWorkflow, profiler_config)


@pytest.mark.parametrize(
    "table_fqn,expected_column_profiles",
    [
        [
            "{service}.default.default.financial_transactions",
            {
                "id": ColumnProfile.model_validate(
                    {
                        "name": "id",
                        "timestamp": 1724343985740,
                        "valuesCount": 5.0,
                        "nullCount": 0.0,
                        "nullProportion": 0.0,
                        "uniqueCount": 5.0,
                        "uniqueProportion": 1.0,
                        "distinctCount": 5.0,
                        "distinctProportion": 1.0,
                        "min": 1.0,
                        "max": 5.0,
                        "mean": 3.0,
                        "sum": 15.0,
                        "stddev": 1.4142135623730951,
                        "median": 3.0,
                        "firstQuartile": 2.0,
                        "thirdQuartile": 4.0,
                        "interQuartileRange": 2.0,
                        "nonParametricSkew": 0.0,
                        "histogram": {
                            "boundaries": ["1.000 to 3.339", "3.339 and up"],
                            "frequencies": [3, 2],
                        },
                    }
                ),
                "amount": ColumnProfile.model_validate(
                    {
                        "name": "amount",
                        "timestamp": 1724343985740,
                        "valuesCount": 5.0,
                        "nullCount": 0.0,
                        "nullProportion": 0.0,
                        "uniqueCount": 5.0,
                        "uniqueProportion": 1.0,
                        "distinctCount": 5.0,
                        "distinctProportion": 1.0,
                        "min": 100.0,
                        "max": 500.0,
                        "mean": 300.0,
                        "sum": 1500.0,
                        "stddev": 141.4213562373095,
                        "median": 300.0,
                        "firstQuartile": 200.0,
                        "thirdQuartile": 400.0,
                        "interQuartileRange": 200.0,
                        "nonParametricSkew": 0.0,
                        "histogram": {
                            "boundaries": ["100.000 to 333.921", "333.921 and up"],
                            "frequencies": [3, 2],
                        },
                    }
                ),
            },
        ]
    ],
    ids=lambda x: x.split(".")[-1] if isinstance(x, str) else "",
)
def test_profiler(
    table_fqn,
    expected_column_profiles,
    db_service,
    run_profiler,
    metadata,
):
    table = metadata.get_latest_table_profile(
        table_fqn.format(service=db_service.fullyQualifiedName.root)
    )
    for name, expected_profile in expected_column_profiles.items():
        actual_column_profile = next(
            column for column in table.columns if column.name.root == name
        ).profile
        actual_column_profile.timestamp = expected_profile.timestamp
        assert_equal_pydantic_objects(
            expected_profile,
            actual_column_profile,
        )
