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
Tests for DSVDataFrameReader (CSV/TSV)
"""
import tempfile
import unittest

import pandas as pd

from metadata.generated.schema.entity.services.connections.database.datalakeConnection import (
    LocalConfig,
)
from metadata.readers.dataframe.dsv import CSVDataFrameReader


class TestDSVReader(unittest.TestCase):
    def test_csv_standard_with_special_characters(self):
        """Test standard CSV with commas in quoted fields, empty values, and special characters."""
        csv_content = 'id,name,address,notes\n1,"John Doe","123 Main St, City, State","Active customer"\n2,"Jane Smith",,"VIP status, priority"\n3,,,""\n'

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(csv_content)
            tmp_path = tmp.name

        try:
            config = LocalConfig()
            reader = CSVDataFrameReader(config, None)

            result = reader._read(key=tmp_path, bucket_name="")

            chunks = list(result.dataframes)
            self.assertEqual(len(chunks), 1)
            self.assertEqual(chunks[0].shape, (3, 4))

            # Row 1: standard values with commas in quoted field
            self.assertEqual(chunks[0].iloc[0]["id"], 1)
            self.assertEqual(chunks[0].iloc[0]["name"], "John Doe")
            self.assertEqual(chunks[0].iloc[0]["address"], "123 Main St, City, State")
            self.assertEqual(chunks[0].iloc[0]["notes"], "Active customer")

            # Row 2: empty address, comma in notes
            self.assertEqual(chunks[0].iloc[1]["id"], 2)
            self.assertEqual(chunks[0].iloc[1]["name"], "Jane Smith")
            self.assertTrue(pd.isna(chunks[0].iloc[1]["address"]))
            self.assertEqual(chunks[0].iloc[1]["notes"], "VIP status, priority")

            # Row 3: mostly empty
            self.assertEqual(chunks[0].iloc[2]["id"], 3)
            self.assertTrue(pd.isna(chunks[0].iloc[2]["name"]))
            self.assertTrue(pd.isna(chunks[0].iloc[2]["address"]))
            self.assertTrue(pd.isna(chunks[0].iloc[2]["notes"]))
        finally:
            import os

            os.unlink(tmp_path)

    def test_csv_complex_escaping_backslash_and_double_quote(self):
        """Test complex CSV with both backslash escaping (\") and double-quote escaping ("") in same file."""
        csv_content = (
            "product,quantity,description,metadata\n"
            '"Part A",5,"Interlocked Flexible Metal Conduit, Galvanized, 50mm dia. (2\\"), Normal","Stock: ""In warehouse"""\n'
            '"Component B",10,"Value with \\"quote\\" and, comma","Status: ""Active"" and \\"Ready\\""\n'
            '"Item C",3,"Windows path: C:\\\\Users\\\\data.txt","Mix of ""both"" styles"\n'
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(csv_content)
            tmp_path = tmp.name

        try:
            config = LocalConfig()
            reader = CSVDataFrameReader(config, None)

            result = reader._read(key=tmp_path, bucket_name="")

            chunks = list(result.dataframes)
            self.assertEqual(len(chunks), 1)
            self.assertEqual(chunks[0].shape, (3, 4))

            # Row 1: backslash-escaped quote in description, double-quote in metadata
            self.assertEqual(chunks[0].iloc[0]["product"], "Part A")
            self.assertEqual(chunks[0].iloc[0]["quantity"], 5)
            self.assertEqual(
                chunks[0].iloc[0]["description"],
                'Interlocked Flexible Metal Conduit, Galvanized, 50mm dia. (2"), Normal',
            )
            self.assertEqual(chunks[0].iloc[0]["metadata"], 'Stock: "In warehouse"')

            # Row 2: both backslash and double-quote escaping in same fields
            self.assertEqual(chunks[0].iloc[1]["product"], "Component B")
            self.assertEqual(chunks[0].iloc[1]["quantity"], 10)
            self.assertEqual(
                chunks[0].iloc[1]["description"], 'Value with "quote" and, comma'
            )
            self.assertEqual(
                chunks[0].iloc[1]["metadata"], 'Status: "Active" and "Ready"'
            )

            # Row 3: Windows path with backslashes, double-quote in metadata
            self.assertEqual(chunks[0].iloc[2]["product"], "Item C")
            self.assertEqual(chunks[0].iloc[2]["quantity"], 3)
            self.assertEqual(
                chunks[0].iloc[2]["description"], "Windows path: C:\\Users\\data.txt"
            )
            self.assertEqual(chunks[0].iloc[2]["metadata"], 'Mix of "both" styles')
        finally:
            import os

            os.unlink(tmp_path)

    def test_csv_edge_cases_with_newlines_and_mixed_quotes(self):
        """Test edge cases with newlines in quoted fields and complex mixed escaping."""
        csv_content = (
            "id,text,value\n"
            '1,"Multi-line text:\nLine 1\nLine 2 with \\"quote\\"","Simple"\n'
            '2,"Text with ""double"" and \\"backslash\\" quotes","Complex, with comma"\n'
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(csv_content)
            tmp_path = tmp.name

        try:
            config = LocalConfig()
            reader = CSVDataFrameReader(config, None)

            result = reader._read(key=tmp_path, bucket_name="")

            chunks = list(result.dataframes)
            self.assertEqual(len(chunks), 1)
            self.assertEqual(chunks[0].shape, (2, 3))

            # Row 1: multi-line text with backslash-escaped quotes
            self.assertEqual(chunks[0].iloc[0]["id"], 1)
            self.assertEqual(
                chunks[0].iloc[0]["text"],
                'Multi-line text:\nLine 1\nLine 2 with "quote"',
            )
            self.assertEqual(chunks[0].iloc[0]["value"], "Simple")

            # Row 2: both types of escaping in same field
            self.assertEqual(chunks[0].iloc[1]["id"], 2)
            self.assertEqual(
                chunks[0].iloc[1]["text"], 'Text with "double" and "backslash" quotes'
            )
            self.assertEqual(chunks[0].iloc[1]["value"], "Complex, with comma")
        finally:
            import os

            os.unlink(tmp_path)


if __name__ == "__main__":
    unittest.main()
