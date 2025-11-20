import factory.fuzzy

from metadata.generated.schema.entity.classification.tag import Tag
from metadata.generated.schema.type.basic import EntityName, FullyQualifiedEntityName
from tests.factories.metadata.generated.schema.entity.classification.classification import (
    ClassificationFactory,
)
from tests.factories.metadata.generated.schema.type.basic import UuidFactory
from tests.factories.metadata.generated.schema.type.entity_reference import (
    EntityReferenceFactory,
)
from tests.utils.factoryboy.root_model import RootSubFactory


class TagFactory(factory.Factory):
    id = RootSubFactory(UuidFactory)
    name = factory.LazyAttribute(lambda o: EntityName(root=o.fqn))
    fullyQualifiedName = factory.LazyAttribute(
        lambda o: FullyQualifiedEntityName(root=o.fqn)
    )
    classification = factory.LazyAttribute(
        lambda o: EntityReferenceFactory(entity=o.tag_classification)
    )
    recognizers = factory.LazyFunction(list)
    autoClassificationEnabled = True
    autoClassificationPriority = 80

    class Meta:
        model = Tag

    class Params:
        tag_name = factory.fuzzy.FuzzyText(prefix="Tag-", length=5)
        tag_classification = factory.SubFactory(ClassificationFactory)
