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
Test Dremio connection
"""
import unittest

from metadata.generated.schema.entity.services.connections.database.dremioConnection import (
    DremioConnection,
)
from metadata.ingestion.models.custom_pydantic import CustomSecretStr
from metadata.ingestion.source.database.dremio.connection import get_connection_url


class TestDremioConnection(unittest.TestCase):
    """
    Test Dremio connection utilities
    """

    def setUp(self):
        """
        Set up test data
        """
        self.connection = DremioConnection(
            username="test_user",
            password=CustomSecretStr("test_password"),
            hostPort="localhost:31010",
        )

    def test_get_connection_url_basic(self):
        """
        Test basic connection URL generation
        """
        url = get_connection_url(self.connection)
        expected = "dremio+pyodbc://test_user:test_password@localhost:31010/?driver=Dremio ODBC Driver"
        self.assertEqual(url, expected)

    def test_get_connection_url_with_project(self):
        """
        Test connection URL with project ID
        """
        self.connection.projectId = "test_project"
        url = get_connection_url(self.connection)
        expected = "dremio+pyodbc://test_user:test_password@localhost:31010/?driver=Dremio ODBC Driver&routing_tag=test_project"
        self.assertEqual(url, expected)

    def test_get_connection_url_with_ssl(self):
        """
        Test connection URL with SSL enabled
        """
        self.connection.sslMode = True
        url = get_connection_url(self.connection)
        expected = "dremio+pyodbc://test_user:test_password@localhost:31010/?driver=Dremio ODBC Driver&ssl=true"
        self.assertEqual(url, expected)

    def test_get_connection_url_with_special_chars(self):
        """
        Test connection URL with special characters in credentials
        """
        self.connection.username = "user@domain"
        self.connection.password = CustomSecretStr("p@ssw#rd!")

        url = get_connection_url(self.connection)
        # Special characters should be URL encoded
        self.assertIn("user%40domain", url)
        self.assertIn("p%40ssw%23rd%21", url)


if __name__ == "__main__":
    unittest.main()
