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
Unit tests for the pre-serialization loop in OMetaTableMixin.ingest_table_sample_data.

Covers the conversion of types that are not JSON-serializable by Pydantic
(e.g. ipaddress.IPv4Address from clickhouse-driver) into plain strings
before model_dump_json() is called.
"""
import ipaddress
import json
from unittest.mock import MagicMock

from metadata.generated.schema.entity.data.table import TableData
from metadata.ingestion.ometa.mixins.table_mixin import OMetaTableMixin


def _make_mixin() -> OMetaTableMixin:
    mixin = OMetaTableMixin.__new__(OMetaTableMixin)
    mixin.client = MagicMock()
    mixin.get_suffix = MagicMock(return_value="/api/v1/tables")
    return mixin


def _make_table():
    table = MagicMock()
    table.id.root = "test-table-id"
    table.fullyQualifiedName.root = "service.db.schema.table"
    return table


class TestIngestTableSampleDataPreprocessing:
    def test_ipv4_address_converted_to_string(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["ip_col"],
            rows=[[ipaddress.IPv4Address("192.168.1.1")]],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)
        assert sample_data.rows[0][0] == "192.168.1.1"

    def test_ipv6_address_converted_to_string(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["ip_col"],
            rows=[[ipaddress.IPv6Address("2001:db8::1")]],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)
        assert sample_data.rows[0][0] == "2001:db8::1"

    def test_bytes_still_base64_encoded(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["bin_col"],
            rows=[[b"hello"]],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)
        assert sample_data.rows[0][0].startswith("[base64]")

    def test_plain_types_unchanged(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["str_col", "int_col", "none_col"],
            rows=[["hello", 42, None]],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)
        assert sample_data.rows[0][0] == "hello"
        assert sample_data.rows[0][1] == 42
        assert sample_data.rows[0][2] is None

    def test_model_dump_json_succeeds_with_ipv4(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["ip_col", "name_col"],
            rows=[[ipaddress.IPv4Address("10.0.0.1"), "alice"]],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)

        call_args = mixin.client.put.call_args
        raw_data = call_args[1].get("data") or call_args[0][1]
        parsed = json.loads(raw_data)
        assert parsed["rows"][0][0] == "10.0.0.1"
        assert parsed["rows"][0][1] == "alice"

    def test_mixed_row_with_ipv4_and_ipv6(self):
        mixin = _make_mixin()
        table = _make_table()
        sample_data = TableData(
            columns=["v4", "v6", "name"],
            rows=[
                [
                    ipaddress.IPv4Address("172.16.0.1"),
                    ipaddress.IPv6Address("fe80::1"),
                    "host",
                ]
            ],
        )
        mixin.client.put.return_value = None
        mixin.ingest_table_sample_data(table, sample_data)
        assert sample_data.rows[0][0] == "172.16.0.1"
        assert sample_data.rows[0][1] == "fe80::1"
        assert sample_data.rows[0][2] == "host"
