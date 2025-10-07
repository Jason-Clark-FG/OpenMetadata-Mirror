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
Test Collibra using the topology
"""
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from metadata.generated.schema.api.data.createGlossary import CreateGlossaryRequest
from metadata.generated.schema.api.data.createGlossaryTerm import (
    CreateGlossaryTermRequest,
)
from metadata.generated.schema.api.domains.createDomain import CreateDomainRequest
from metadata.generated.schema.entity.data.glossary import Glossary
from metadata.generated.schema.entity.data.glossaryTerm import GlossaryTerm
from metadata.generated.schema.entity.domains.domain import Domain
from metadata.generated.schema.entity.teams.user import User
from metadata.generated.schema.metadataIngestion.workflow import (
    OpenMetadataWorkflowConfig,
)
from metadata.generated.schema.type.basic import EntityName, FullyQualifiedEntityName
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.metadata.collibra.client import CollibraClient

mock_collibra_config = {
    "source": {
        "type": "Collibra",
        "serviceName": "local_collibra",
        "serviceConnection": {
            "config": {
                "type": "Collibra",
                "hostPort": "http://localhost:8080",
                "username": "admin",
                "password": "admin",
                "enableEnrichment": False,
            }
        },
        "sourceConfig": {"config": {"type": "DatabaseMetadata"}},
    },
    "sink": {"type": "metadata-rest", "config": {}},
    "workflowConfig": {
        "openMetadataServerConfig": {
            "hostPort": "http://localhost:8585/api",
            "authProvider": "openmetadata",
            "securityConfig": {
                "jwtToken": "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJ0eXAiOiJKV1QiLCJhbGc"
                "iOiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlzQm90IjpmYWxzZSwiaXNzIjoib3Blbi1tZXRhZGF0YS5vcmciLCJpYXQiOjE"
                "2NjM5Mzg0NjIsImVtYWlsIjoiYWRtaW5Ab3Blbm1ldGFkYXRhLm9yZyJ9.tS8um_5DKu7HgzGBzS1VTA5uUjKWOCU0B_j08WXB"
                "iEC0mr0zNREkqVfwFDD-d24HlNEbrqioLsBuFRiwIWKc1m_ZlVQbG7P36RUxhuv2vbSp80FKyNM-Tj93FDzq91jsyNmsQhyNv_fN"
                "r3TXfzzSPjHt8Go0FMMP66weoKMgW2PbXlhVKwEuXUHyakLLzewm9UMeQaEiRzhiTMU3UkLXcKbYEJJvfNFcLwSl9W8JCO_l0Yj3u"
                "d-qt_nQYEZwqW6u5nfdQllN133iikV4fM5QZsMCnm8Rq1mvLR0y9bmJiD7fwM1tmJ791TUWqmKaTnP49U493VanKpUAfzIiOiIbhg"
            },
        }
    },
}


mock_file_path = (
    Path(__file__).parent.parent.parent.parent
    / "resources/datasets/collibra_dataset.json"
)
with open(mock_file_path, encoding="UTF-8") as file:
    mock_data: dict = json.load(file)


def mock_list_glossaries(self, offset=0, limit=1000):
    return mock_data["glossaries"]


def mock_list_glossary_terms(self, glossary_id=None, offset=0, limit=1000):
    return mock_data["glossary_terms"]


def mock_get_asset_attributes(self, asset_id, offset=0, limit=1000):
    return mock_data["attributes"]


def mock_get_asset_tags(self, asset_id, offset=0, limit=1000):
    return mock_data["tags"]


def mock_list_communities(self, offset=0, limit=1000):
    return mock_data["communities"]


def mock_list_domains(self, community_id=None, offset=0, limit=1000):
    return mock_data["domains"]


def mock_list_users(self, offset=0, limit=1000):
    return mock_data["users"]


def mock_list_responsibilities(self, asset_id=None, offset=0, limit=1000):
    return mock_data["responsibilities"]


def mock_get_relations(self, asset_id, offset=0, limit=1000):
    return mock_data["relations"]


EXPECTED_GLOSSARY = CreateGlossaryRequest(
    name=EntityName("Business Glossary"),
    displayName="Business Glossary",
    description="Main business glossary for the organization",
)

EXPECTED_GLOSSARY_TERM = CreateGlossaryTermRequest(
    name=EntityName("Customer"),
    displayName="Customer",
    description="An individual or organization that purchases goods or services",
    glossary=FullyQualifiedEntityName("Business Glossary"),
)

EXPECTED_DOMAIN = CreateDomainRequest(
    name=EntityName("Finance"),
    displayName="Finance",
    description="Finance domain",
    domainType="Source-aligned",
)


class CollibraUnitTest(TestCase):
    """Collibra unit tests"""

    def __init__(self, methodName) -> None:
        super().__init__(methodName)
        self.config = OpenMetadataWorkflowConfig.model_validate(mock_collibra_config)

    def test_client_list_glossaries(self):
        """Test client list_glossaries method"""
        with patch.object(
            CollibraClient, "list_glossaries", side_effect=mock_list_glossaries
        ):
            client = CollibraClient(self.config.source.serviceConnection.root.config)
            glossaries = client.list_glossaries()
            self.assertIsNotNone(glossaries)
            self.assertEqual(len(glossaries["results"]), 1)
            self.assertEqual(glossaries["results"][0]["name"], "Business Glossary")

    def test_client_list_glossary_terms(self):
        """Test client list_glossary_terms method"""
        with patch.object(
            CollibraClient, "list_glossary_terms", side_effect=mock_list_glossary_terms
        ):
            client = CollibraClient(self.config.source.serviceConnection.root.config)
            terms = client.list_glossary_terms()
            self.assertIsNotNone(terms)
            self.assertEqual(len(terms["results"]), 2)
            self.assertEqual(terms["results"][0]["name"], "Customer")

    def test_client_get_asset_attributes(self):
        """Test client get_asset_attributes method"""
        with patch.object(
            CollibraClient,
            "get_asset_attributes",
            side_effect=mock_get_asset_attributes,
        ):
            client = CollibraClient(self.config.source.serviceConnection.root.config)
            attributes = client.get_asset_attributes("term-1")
            self.assertIsNotNone(attributes)
            self.assertEqual(len(attributes["results"]), 3)
            self.assertEqual(attributes["results"][0]["type"]["name"], "Synonym")

    def test_client_list_users(self):
        """Test client list_users method"""
        with patch.object(CollibraClient, "list_users", side_effect=mock_list_users):
            client = CollibraClient(self.config.source.serviceConnection.root.config)
            users = client.list_users()
            self.assertIsNotNone(users)
            self.assertEqual(len(users["results"]), 2)
            self.assertEqual(users["results"][0]["userName"], "john.doe")

    def test_client_list_responsibilities(self):
        """Test client list_responsibilities method"""
        with patch.object(
            CollibraClient,
            "list_responsibilities",
            side_effect=mock_list_responsibilities,
        ):
            client = CollibraClient(self.config.source.serviceConnection.root.config)
            responsibilities = client.list_responsibilities()
            self.assertIsNotNone(responsibilities)
            self.assertEqual(len(responsibilities["results"]), 2)
            self.assertEqual(responsibilities["results"][0]["resource"]["id"], "term-1")

    @patch(
        "metadata.ingestion.source.metadata.collibra.metadata.test_connection_common"
    )
    @patch.object(CollibraClient, "list_glossaries", side_effect=mock_list_glossaries)
    @patch.object(
        CollibraClient, "list_glossary_terms", side_effect=mock_list_glossary_terms
    )
    @patch.object(
        CollibraClient, "get_asset_attributes", side_effect=mock_get_asset_attributes
    )
    @patch.object(CollibraClient, "get_asset_tags", side_effect=mock_get_asset_tags)
    @patch.object(CollibraClient, "list_communities", side_effect=mock_list_communities)
    @patch.object(CollibraClient, "list_domains", side_effect=mock_list_domains)
    @patch.object(CollibraClient, "list_users", side_effect=mock_list_users)
    @patch.object(
        CollibraClient,
        "list_responsibilities",
        side_effect=mock_list_responsibilities,
    )
    @patch.object(CollibraClient, "get_relations", side_effect=mock_get_relations)
    @patch.object(OpenMetadata, "get_by_name")
    @patch.object(OpenMetadata, "get_entity_reference")
    def test_glossary_ingestion(
        self,
        get_entity_reference_mock,
        get_by_name_mock,
        get_relations_mock,
        list_responsibilities_mock,
        list_users_mock,
        list_domains_mock,
        list_communities_mock,
        get_asset_tags_mock,
        get_asset_attributes_mock,
        list_glossary_terms_mock,
        list_glossaries_mock,
        test_connection_mock,
    ):
        """Test glossary ingestion workflow"""
        get_by_name_mock.side_effect = [
            User(
                id="user-1",
                name=EntityName("john.doe"),
                email="john.doe@example.com",
                fullyQualifiedName=FullyQualifiedEntityName("john.doe"),
            ),
            User(
                id="user-2",
                name=EntityName("jane.smith"),
                email="jane.smith@example.com",
                fullyQualifiedName=FullyQualifiedEntityName("jane.smith"),
            ),
            Glossary(
                id="glossary-1",
                name=EntityName("Business Glossary"),
                fullyQualifiedName=FullyQualifiedEntityName("Business Glossary"),
            ),
            GlossaryTerm(
                id="term-1",
                name=EntityName("Customer"),
                fullyQualifiedName=FullyQualifiedEntityName(
                    "Business Glossary.Customer"
                ),
                glossary="glossary-1",
            ),
            GlossaryTerm(
                id="term-2",
                name=EntityName("Revenue"),
                fullyQualifiedName=FullyQualifiedEntityName(
                    "Business Glossary.Revenue"
                ),
                glossary="glossary-1",
            ),
            Domain(
                id="domain-1",
                name=EntityName("Finance"),
                fullyQualifiedName=FullyQualifiedEntityName("Finance"),
                domainType="Source-aligned",
            ),
        ]

        entities = []
        for entity in self.collibra_source._iter():
            if entity.right:
                entities.append(entity.right)

        glossary_requests = [
            e for e in entities if isinstance(e, CreateGlossaryRequest)
        ]
        term_requests = [
            e for e in entities if isinstance(e, CreateGlossaryTermRequest)
        ]
        domain_requests = [e for e in entities if isinstance(e, CreateDomainRequest)]

        self.assertEqual(len(glossary_requests), 1)
        self.assertEqual(glossary_requests[0].name, EXPECTED_GLOSSARY.name)

        self.assertGreater(len(term_requests), 0)
        term_names = [t.name for t in term_requests]
        self.assertIn(EntityName("Customer"), term_names)

        self.assertGreater(len(domain_requests), 0)

    @patch.object(CollibraClient, "list_glossaries", side_effect=mock_list_glossaries)
    @patch.object(
        CollibraClient, "list_glossary_terms", side_effect=mock_list_glossary_terms
    )
    @patch.object(
        CollibraClient, "get_asset_attributes", side_effect=mock_get_asset_attributes
    )
    @patch.object(CollibraClient, "get_asset_tags", side_effect=mock_get_asset_tags)
    def test_custom_attributes_extraction(
        self,
        get_asset_tags_mock,
        get_asset_attributes_mock,
        list_glossary_terms_mock,
        list_glossaries_mock,
    ):
        """Test custom attributes are extracted and stored"""
        with patch.object(OpenMetadata, "get_by_name") as get_by_name_mock:
            get_by_name_mock.return_value = Glossary(
                id="glossary-1",
                name=EntityName("Business Glossary"),
                fullyQualifiedName=FullyQualifiedEntityName("Business Glossary"),
            )

            glossary_data = mock_data["glossaries"]["results"][0]
            term_data = mock_data["glossary_terms"]["results"][0]

            glossary_entity = Glossary(
                id=glossary_data["id"],
                name=EntityName(glossary_data["name"]),
                fullyQualifiedName=FullyQualifiedEntityName(glossary_data["name"]),
            )

            terms = list(
                self.collibra_source._create_glossary_term_entity(
                    term_data, glossary_entity
                )
            )

            term_request = None
            for either in terms:
                if either.right and isinstance(either.right, CreateGlossaryTermRequest):
                    term_request = either.right
                    break

            self.assertIsNotNone(term_request)
            if term_request.extension:
                self.assertIn("collibra_DataType", term_request.extension)
                self.assertEqual(term_request.extension["collibra_DataType"], "String")
