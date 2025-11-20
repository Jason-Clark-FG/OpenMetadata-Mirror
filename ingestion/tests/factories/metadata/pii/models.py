import factory.fuzzy

from metadata.pii.models import ScoredTag
from tests.factories.metadata.generated.schema.entity.classification.tag import (
    TagFactory,
)


class ScoredTagFactory(factory.Factory):
    tag = factory.SubFactory(TagFactory)
    score = 0.8
    reason = factory.fuzzy.FuzzyText(prefix="Detected by recognizer: ")

    class Meta:
        model = ScoredTag
