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
Collibra source to extract metadata
"""
import traceback
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from metadata.generated.schema.api.data.createGlossary import CreateGlossaryRequest
from metadata.generated.schema.api.data.createGlossaryTerm import (
    CreateGlossaryTermRequest,
)
from metadata.generated.schema.api.data.createTable import CreateTableRequest
from metadata.generated.schema.api.domains.createDomain import CreateDomainRequest
from metadata.generated.schema.api.teams.createUser import CreateUserRequest
from metadata.generated.schema.entity.data.glossary import Glossary
from metadata.generated.schema.entity.data.glossaryTerm import GlossaryTerm
from metadata.generated.schema.entity.data.table import Table
from metadata.generated.schema.entity.domains.domain import Domain
from metadata.generated.schema.entity.services.connections.metadata.collibraConnection import (
    CollibraConnection,
)
from metadata.generated.schema.entity.teams.user import User
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.generated.schema.type.basic import (
    EntityName,
    FullyQualifiedEntityName,
    Markdown,
)
from metadata.generated.schema.type.entityReferenceList import EntityReferenceList
from metadata.ingestion.api.models import Either, Entity, StackTraceError
from metadata.ingestion.api.steps import InvalidSourceException, Source
from metadata.ingestion.models.user import OMetaUserProfile
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.source.connections import get_connection, test_connection_common
from metadata.ingestion.source.metadata.collibra.client import CollibraClient
from metadata.utils import fqn
from metadata.utils.helpers import retry_with_docker_host
from metadata.utils.logger import ingestion_logger
from metadata.utils.tag_utils import get_ometa_tag_and_classification, get_tag_labels

logger = ingestion_logger()

COLLIBRA_TAG_CATEGORY = "CollibraMetadata"
COLLIBRA_GLOSSARY_TAG = "collibra_glossary"


@dataclass
class CollibraSource(Source):
    """
    Collibra source class
    """

    config: WorkflowSource
    collibra_client: CollibraClient
    glossary_cache: Dict[str, Glossary]
    domain_cache: Dict[str, Domain]
    user_cache: Dict[str, User]
    asset_responsibilities: Dict[str, List[str]]
    term_cache: Dict[str, GlossaryTerm]
    term_relations: Dict[str, List[str]]

    @retry_with_docker_host()
    def __init__(
        self,
        config: WorkflowSource,
        metadata: OpenMetadata,
    ):
        super().__init__()
        self.config = config
        self.metadata = metadata
        self.service_connection = self.config.serviceConnection.root.config

        self.collibra_client = get_connection(self.service_connection)
        self.connection_obj = self.collibra_client
        self.glossary_cache: Dict[str, Glossary] = {}
        self.domain_cache: Dict[str, Domain] = {}
        self.user_cache: Dict[str, User] = {}
        self.asset_responsibilities: Dict[str, List[str]] = {}
        self.term_cache: Dict[str, GlossaryTerm] = {}
        self.term_relations: Dict[str, List[str]] = {}

        self.test_connection()

    @classmethod
    def create(
        cls, config_dict, metadata: OpenMetadata, pipeline_name: Optional[str] = None
    ):
        config: WorkflowSource = WorkflowSource.model_validate(config_dict)
        connection: CollibraConnection = config.serviceConnection.root.config
        if not isinstance(connection, CollibraConnection):
            raise InvalidSourceException(
                f"Expected CollibraConnection, but got {connection}"
            )
        return cls(config, metadata)

    def prepare(self):
        """Not required to implement"""

    def _iter(self, *_, **__) -> Iterable[Either[Entity]]:
        """
        Main iteration logic for Collibra metadata extraction
        """
        yield from self._ingest_users()
        yield from self._fetch_all_responsibilities()
        yield from self._ingest_glossaries()
        yield from self._apply_term_relationships()
        yield from self._ingest_domains()

        if self.service_connection.enableEnrichment:
            yield from self._enrich_existing_assets()

    def _ingest_glossaries(self) -> Iterable[Either[Entity]]:
        """
        Ingest glossaries and glossary terms from Collibra
        """
        try:
            glossaries_response = self.collibra_client.list_glossaries()
            if not glossaries_response or "results" not in glossaries_response:
                logger.warning("No glossaries found in Collibra")
                return

            for glossary_data in glossaries_response.get("results", []):
                try:
                    glossary_name = glossary_data.get("name")

                    yield from self._create_glossary_entity(glossary_data)

                    glossary_id = glossary_data.get("id")
                    if glossary_id:
                        yield from self._ingest_glossary_terms(glossary_id)

                except Exception as exc:
                    yield Either(
                        left=StackTraceError(
                            name=glossary_data.get("name", "Unknown"),
                            error=f"Failed to process glossary: {exc}",
                            stackTrace=traceback.format_exc(),
                        )
                    )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name="Glossaries",
                    error=f"Failed to fetch glossaries: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_glossary_entity(
        self, glossary_data: Dict[str, Any]
    ) -> Iterable[Either[CreateGlossaryRequest]]:
        """
        Create a glossary entity from Collibra glossary data
        """
        try:
            glossary_name = glossary_data.get("name")
            glossary_description = glossary_data.get("description", "")

            yield from get_ometa_tag_and_classification(
                tags=[COLLIBRA_GLOSSARY_TAG],
                classification_name=COLLIBRA_TAG_CATEGORY,
                tag_description="Collibra Glossary Tag",
                classification_description="Tags associated with Collibra entities",
            )

            owners = self._get_owners_for_asset(glossary_data.get("id"))

            glossary_request = CreateGlossaryRequest(
                name=EntityName(glossary_name),
                displayName=glossary_data.get("displayName", glossary_name),
                description=Markdown(glossary_description)
                if glossary_description
                else None,
                owners=owners,
                tags=get_tag_labels(
                    metadata=self.metadata,
                    tags=[COLLIBRA_GLOSSARY_TAG],
                    classification_name=COLLIBRA_TAG_CATEGORY,
                ),
            )
            yield Either(right=glossary_request)

            glossary_fqn = fqn.build(
                self.metadata,
                entity_type=Glossary,
                glossary_name=glossary_name,
            )
            glossary_entity = self.metadata.get_by_name(
                entity=Glossary, fqn=glossary_fqn
            )
            if glossary_entity:
                self.glossary_cache[glossary_data.get("id")] = glossary_entity

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=glossary_data.get("name", "Unknown"),
                    error=f"Failed to create glossary entity: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _ingest_glossary_terms(
        self, glossary_id: str
    ) -> Iterable[Either[CreateGlossaryTermRequest]]:
        """
        Ingest glossary terms for a specific glossary
        """
        try:
            terms_response = self.collibra_client.list_glossary_terms(
                glossary_id=glossary_id
            )
            if not terms_response or "results" not in terms_response:
                return

            glossary_entity = self.glossary_cache.get(glossary_id)
            if not glossary_entity:
                logger.warning(f"Glossary {glossary_id} not found in cache")
                return

            for term_data in terms_response.get("results", []):
                try:
                    yield from self._create_glossary_term_entity(
                        term_data, glossary_entity
                    )
                except Exception as exc:
                    yield Either(
                        left=StackTraceError(
                            name=term_data.get("name", "Unknown"),
                            error=f"Failed to process glossary term: {exc}",
                            stackTrace=traceback.format_exc(),
                        )
                    )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=f"GlossaryTerms-{glossary_id}",
                    error=f"Failed to fetch glossary terms: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_glossary_term_entity(
        self, term_data: Dict[str, Any], glossary_entity: Glossary
    ) -> Iterable[Either[CreateGlossaryTermRequest]]:
        """
        Create a glossary term entity from Collibra business term data
        """
        try:
            term_name = term_data.get("name")
            term_description = term_data.get("description", "")

            attributes = self.collibra_client.get_asset_attributes(term_data.get("id"))

            synonyms = []
            custom_attributes = {}

            if attributes and "results" in attributes:
                for attr in attributes["results"]:
                    attr_name = attr.get("type", {}).get("name")
                    attr_value = attr.get("value")

                    if attr_name == "Synonym" and attr_value:
                        synonyms.append(attr_value)
                    elif attr_name and attr_value and attr_name != "Synonym":
                        custom_attributes[f"collibra_{attr_name}"] = attr_value

            tags = self.collibra_client.get_asset_tags(term_data.get("id"))

            yield from get_ometa_tag_and_classification(
                tags=tags if tags else [],
                classification_name=COLLIBRA_TAG_CATEGORY,
                tag_description="Collibra Tag",
                classification_description="Tags from Collibra",
            )

            owners = self._get_owners_for_asset(term_data.get("id"))

            term_request = CreateGlossaryTermRequest(
                name=EntityName(term_name),
                displayName=term_data.get("displayName", term_name),
                description=Markdown(term_description) if term_description else None,
                glossary=FullyQualifiedEntityName(
                    glossary_entity.fullyQualifiedName.root
                ),
                synonyms=synonyms if synonyms else None,
                owners=owners,
                tags=get_tag_labels(
                    metadata=self.metadata,
                    tags=tags if tags else [],
                    classification_name=COLLIBRA_TAG_CATEGORY,
                )
                if tags
                else None,
                extension=custom_attributes if custom_attributes else None,
            )
            yield Either(right=term_request)

            term_fqn = fqn.build(
                self.metadata,
                entity_type=GlossaryTerm,
                glossary_name=glossary_entity.name.root,
                glossary_term_name=term_name,
            )
            term_entity = self.metadata.get_by_name(entity=GlossaryTerm, fqn=term_fqn)
            if term_entity:
                self.term_cache[term_data.get("id")] = term_entity

            relations_response = self.collibra_client.get_relations(term_data.get("id"))
            if relations_response and "results" in relations_response:
                related_ids = []
                for relation in relations_response.get("results", []):
                    target_id = relation.get("target", {}).get("id")
                    if target_id:
                        related_ids.append(target_id)
                if related_ids:
                    self.term_relations[term_data.get("id")] = related_ids

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=term_data.get("name", "Unknown"),
                    error=f"Failed to create glossary term entity: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _apply_term_relationships(self) -> Iterable[Either[CreateGlossaryTermRequest]]:
        """
        Apply term-to-term relationships after all terms are created
        """
        try:
            for source_id, target_ids in self.term_relations.items():
                try:
                    source_term = self.term_cache.get(source_id)
                    if not source_term:
                        continue

                    related_term_refs = []
                    for target_id in target_ids:
                        target_term = self.term_cache.get(target_id)
                        if target_term:
                            term_ref = self.metadata.get_entity_reference(
                                entity=GlossaryTerm,
                                fqn=target_term.fullyQualifiedName.root,
                            )
                            if term_ref:
                                related_term_refs.append(term_ref)

                    if related_term_refs:
                        updated_term = CreateGlossaryTermRequest(
                            name=source_term.name,
                            displayName=source_term.displayName,
                            description=source_term.description,
                            glossary=FullyQualifiedEntityName(
                                source_term.glossary.fullyQualifiedName
                            ),
                            synonyms=source_term.synonyms,
                            relatedTerms=EntityReferenceList(root=related_term_refs),
                            owners=source_term.owners,
                            tags=source_term.tags,
                            extension=source_term.extension,
                        )
                        yield Either(right=updated_term)

                except Exception as exc:
                    logger.debug(
                        f"Failed to apply relationships for term {source_id}: {exc}"
                    )
                    continue

        except Exception as exc:
            logger.warning(f"Failed to apply term relationships: {exc}")

    def _ingest_domains(self) -> Iterable[Either[CreateDomainRequest]]:
        """
        Ingest domains and communities from Collibra
        """
        try:
            communities_response = self.collibra_client.list_communities()
            if not communities_response or "results" not in communities_response:
                logger.warning("No communities found in Collibra")
                return

            for community_data in communities_response.get("results", []):
                try:
                    yield from self._create_domain_from_community(community_data)

                    community_id = community_data.get("id")
                    if community_id:
                        yield from self._ingest_community_domains(community_id)

                except Exception as exc:
                    yield Either(
                        left=StackTraceError(
                            name=community_data.get("name", "Unknown"),
                            error=f"Failed to process community: {exc}",
                            stackTrace=traceback.format_exc(),
                        )
                    )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name="Domains",
                    error=f"Failed to fetch communities: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_domain_from_community(
        self, community_data: Dict[str, Any]
    ) -> Iterable[Either[CreateDomainRequest]]:
        """
        Create a domain entity from Collibra community data
        """
        try:
            domain_name = community_data.get("name")
            domain_description = community_data.get("description", "")

            owners = self._get_owners_for_asset(community_data.get("id"))

            domain_request = CreateDomainRequest(
                name=EntityName(domain_name),
                displayName=community_data.get("displayName", domain_name),
                description=Markdown(domain_description)
                if domain_description
                else None,
                domainType="Source-aligned",
                owners=owners,
            )
            yield Either(right=domain_request)

            domain_fqn = fqn.build(
                self.metadata,
                entity_type=Domain,
                domain_name=domain_name,
            )
            domain_entity = self.metadata.get_by_name(entity=Domain, fqn=domain_fqn)
            if domain_entity:
                self.domain_cache[community_data.get("id")] = domain_entity

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=community_data.get("name", "Unknown"),
                    error=f"Failed to create domain from community: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _ingest_community_domains(
        self, community_id: str
    ) -> Iterable[Either[CreateDomainRequest]]:
        """
        Ingest domains within a community
        """
        try:
            domains_response = self.collibra_client.list_domains(
                community_id=community_id
            )
            if not domains_response or "results" not in domains_response:
                return

            parent_domain = self.domain_cache.get(community_id)
            if not parent_domain:
                logger.warning(f"Parent domain for community {community_id} not found")
                return

            for domain_data in domains_response.get("results", []):
                try:
                    yield from self._create_sub_domain(domain_data, parent_domain)
                except Exception as exc:
                    yield Either(
                        left=StackTraceError(
                            name=domain_data.get("name", "Unknown"),
                            error=f"Failed to process domain: {exc}",
                            stackTrace=traceback.format_exc(),
                        )
                    )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=f"Domains-{community_id}",
                    error=f"Failed to fetch domains: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_sub_domain(
        self, domain_data: Dict[str, Any], parent_domain: Domain
    ) -> Iterable[Either[CreateDomainRequest]]:
        """
        Create a sub-domain entity from Collibra domain data
        """
        try:
            domain_name = domain_data.get("name")
            domain_description = domain_data.get("description", "")

            owners = self._get_owners_for_asset(domain_data.get("id"))

            domain_request = CreateDomainRequest(
                name=EntityName(domain_name),
                displayName=domain_data.get("displayName", domain_name),
                description=Markdown(domain_description)
                if domain_description
                else None,
                domainType="Consumer-aligned",
                parent=FullyQualifiedEntityName(parent_domain.fullyQualifiedName.root),
                owners=owners,
            )
            yield Either(right=domain_request)

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=domain_data.get("name", "Unknown"),
                    error=f"Failed to create sub-domain: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _fetch_all_responsibilities(self) -> Iterable[Either[Entity]]:
        """
        Fetch all responsibilities (ownership assignments) from Collibra
        and cache them by asset ID
        """
        try:
            responsibilities_response = self.collibra_client.list_responsibilities()
            if (
                not responsibilities_response
                or "results" not in responsibilities_response
            ):
                logger.warning("No responsibilities found in Collibra")
                return

            for responsibility in responsibilities_response.get("results", []):
                try:
                    resource_id = responsibility.get("resource", {}).get("id")
                    user_id = responsibility.get("user", {}).get("id")

                    if resource_id and user_id:
                        if resource_id not in self.asset_responsibilities:
                            self.asset_responsibilities[resource_id] = []
                        self.asset_responsibilities[resource_id].append(user_id)

                except Exception as exc:
                    logger.debug(f"Failed to process responsibility: {exc}")
                    continue

        except Exception as exc:
            logger.warning(f"Failed to fetch responsibilities: {exc}")

    def _get_owners_for_asset(self, asset_id: str) -> Optional[EntityReferenceList]:
        """
        Get owner entity references for a Collibra asset
        """
        try:
            user_ids = self.asset_responsibilities.get(asset_id, [])
            if not user_ids:
                return None

            owner_refs = []
            for user_id in user_ids:
                user_entity = self.user_cache.get(user_id)
                if user_entity:
                    owner_ref = self.metadata.get_entity_reference(
                        entity=User, fqn=user_entity.fullyQualifiedName.root
                    )
                    if owner_ref:
                        owner_refs.append(owner_ref)

            return EntityReferenceList(root=owner_refs) if owner_refs else None

        except Exception as exc:
            logger.debug(f"Failed to get owners for asset {asset_id}: {exc}")
            return None

    def _ingest_users(self) -> Iterable[Either[OMetaUserProfile]]:
        """
        Ingest users from Collibra
        """
        try:
            users_response = self.collibra_client.list_users()
            if not users_response or "results" not in users_response:
                logger.warning("No users found in Collibra")
                return

            for user_data in users_response.get("results", []):
                try:
                    yield from self._create_user_entity(user_data)
                except Exception as exc:
                    yield Either(
                        left=StackTraceError(
                            name=user_data.get("userName", "Unknown"),
                            error=f"Failed to process user: {exc}",
                            stackTrace=traceback.format_exc(),
                        )
                    )

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name="Users",
                    error=f"Failed to fetch users: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _create_user_entity(
        self, user_data: Dict[str, Any]
    ) -> Iterable[Either[OMetaUserProfile]]:
        """
        Create a user entity from Collibra user data
        """
        try:
            username = user_data.get("userName")
            email = user_data.get("emailAddress")
            first_name = user_data.get("firstName", "")
            last_name = user_data.get("lastName", "")
            user_id = user_data.get("id")

            if not email or not username:
                logger.warning(f"User {username} missing required fields, skipping")
                return

            display_name = f"{first_name} {last_name}".strip() or username

            user_metadata = CreateUserRequest(
                name=EntityName(username),
                displayName=display_name,
                email=email,
            )

            yield Either(
                right=OMetaUserProfile(
                    user=user_metadata,
                    teams=[],
                )
            )

            user_fqn = username
            user_entity = self.metadata.get_by_name(entity=User, fqn=user_fqn)
            if user_entity and user_id:
                self.user_cache[user_id] = user_entity

        except Exception as exc:
            yield Either(
                left=StackTraceError(
                    name=user_data.get("userName", "Unknown"),
                    error=f"Failed to create user entity: {exc}",
                    stackTrace=traceback.format_exc(),
                )
            )

    def _enrich_existing_assets(self) -> Iterable[Either[CreateTableRequest]]:
        """
        Enrich existing OpenMetadata assets with Collibra metadata
        (descriptions, tags, owners, glossary terms)
        """
        try:
            logger.info("Starting asset enrichment from Collibra")

            collibra_assets_response = self.collibra_client.list_glossary_terms(
                limit=10000
            )
            if (
                not collibra_assets_response
                or "results" not in collibra_assets_response
            ):
                logger.warning("No assets found for enrichment")
                return

            for asset_data in collibra_assets_response.get("results", []):
                try:
                    asset_name = asset_data.get("name")
                    asset_description = asset_data.get("description", "")

                    table_entity = self.metadata.get_by_name(
                        entity=Table, fqn=asset_name, fields=["*"]
                    )

                    if not table_entity:
                        continue

                    logger.info(f"Enriching table {asset_name} with Collibra metadata")

                    tags = self.collibra_client.get_asset_tags(asset_data.get("id"))
                    owners = self._get_owners_for_asset(asset_data.get("id"))

                    yield from get_ometa_tag_and_classification(
                        tags=tags if tags else [],
                        classification_name=COLLIBRA_TAG_CATEGORY,
                        tag_description="Collibra Tag",
                        classification_description="Tags from Collibra",
                    )

                    enriched_table = CreateTableRequest(
                        name=table_entity.name,
                        displayName=table_entity.displayName,
                        description=(
                            Markdown(asset_description)
                            if asset_description
                            else table_entity.description
                        ),
                        tableType=table_entity.tableType,
                        columns=table_entity.columns,
                        databaseSchema=table_entity.databaseSchema.fullyQualifiedName,
                        owners=owners if owners else table_entity.owners,
                        tags=(
                            get_tag_labels(
                                metadata=self.metadata,
                                tags=tags if tags else [],
                                classification_name=COLLIBRA_TAG_CATEGORY,
                            )
                            if tags
                            else table_entity.tags
                        ),
                    )

                    yield Either(right=enriched_table)

                except Exception as exc:
                    logger.debug(f"Failed to enrich asset {asset_name}: {exc}")
                    continue

        except Exception as exc:
            logger.warning(f"Asset enrichment failed: {exc}")

    def close(self):
        """Not required to implement"""

    def test_connection(self) -> None:
        test_connection_common(
            self.metadata, self.connection_obj, self.service_connection
        )
