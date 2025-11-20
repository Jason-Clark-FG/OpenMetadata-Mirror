import uuid
from uuid import UUID

import factory.fuzzy
from pydantic import BaseModel

from metadata.generated.schema.type.basic import Markdown
from metadata.generated.schema.type.customProperties.complexTypes import EntityReference
from tests.utils.factoryboy.root_model import RootSubFactory


class Entity(BaseModel):
    id: UUID
    type: str
    name: str
    fullyQualifiedName: str
    description: Markdown


class EntityFactory(factory.Factory):
    id = factory.LazyFunction(uuid.uuid4)
    type = "entity"
    name = "entity"
    fullyQualifiedName = "entity"
    description = RootSubFactory(Markdown)

    class Meta:
        model = EntityReference


class EntityReferenceFactory(factory.Factory):
    id = factory.LazyAttribute(lambda x: x.entity.id)
    type = factory.LazyAttribute(lambda x: x.entity.type)
    name = factory.LazyAttribute(lambda x: x.entity.name)
    fullyQualifiedName = factory.LazyAttribute(lambda x: x.entity.fullyQualifiedName)
    description = factory.LazyAttribute(lambda x: x.entity.description)

    class Meta:
        model = EntityReference

    class Params:
        entity = factory.SubFactory(EntityFactory)
