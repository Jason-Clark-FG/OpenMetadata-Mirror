import factory.fuzzy

from metadata.generated.schema.entity.classification.classification import (
    AutoClassificationConfig,
    Classification,
    ConflictResolution,
)
from metadata.generated.schema.type.basic import EntityName, FullyQualifiedEntityName
from tests.factories.metadata.generated.schema.type.basic import (
    MarkdownFactory,
    UuidFactory,
)
from tests.utils.factoryboy.root_model import RootSubFactory


class AutoClassificationConfigFactory(factory.Factory):
    enabled = True
    conflictResolution = ConflictResolution.highest_confidence
    minimumConfidence = 0.6

    class Meta:
        model = AutoClassificationConfig


class ClassificationFactory(factory.Factory):
    id = RootSubFactory(UuidFactory)
    name = factory.LazyAttribute(lambda o: EntityName(root=o.fqn))
    fullyQualifiedName = factory.LazyAttribute(
        lambda o: FullyQualifiedEntityName(root=o.fqn)
    )
    description = RootSubFactory(MarkdownFactory)
    mutuallyExclusive = True
    autoClassificationConfig = factory.SubFactory(AutoClassificationConfigFactory)

    class Meta:
        model = Classification

    class Params:
        fqn = factory.fuzzy.FuzzyText(prefix="Classification-", length=5)
