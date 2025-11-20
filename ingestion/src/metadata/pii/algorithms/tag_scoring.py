from typing import Any, Iterable, List, Optional, Sequence, final

from metadata.generated.schema.entity.data.table import DataType
from metadata.pii.algorithms.preprocessing import preprocess_values
from metadata.pii.algorithms.presidio_utils import set_presidio_logger_level
from metadata.pii.models import ScoredTag
from metadata.pii.tag_analyzer import TagAnalyzer


@final
class TagScorer:
    """
    Tag classifier that returns ScoredTag objects with detailed match information.
    """

    def __init__(
        self,
        *,
        tag_analyzers: Iterable[TagAnalyzer],
        column_name_contribution: float = 0.5,
        score_cutoff: float = 0.1,
        relative_cardinality_cutoff: float = 0.01,
    ):
        set_presidio_logger_level()

        self._analyzers = list(tag_analyzers)

        self._column_name_contribution = column_name_contribution
        self._score_cutoff = score_cutoff
        self._relative_cardinality_cutoff = relative_cardinality_cutoff

    def predict_scores(
        self,
        sample_data: Sequence[Any],
        column_name: Optional[str] = None,
        column_data_type: Optional[DataType] = None,
    ) -> List[ScoredTag]:
        str_values = preprocess_values(sample_data)

        if not str_values:
            return []

        # Relative cardinality test
        unique_values = set(str_values)
        if len(unique_values) / len(str_values) < self._relative_cardinality_cutoff:
            return []

        results: List[ScoredTag] = []
        for analyzer in self._analyzers:
            content_score = analyzer.analyze_content(values=str_values)
            column_score = 0.0
            if column_name is not None:
                column_score = analyzer.analyze_column()
                column_score *= max(column_score, self._column_name_contribution)

            total_score = content_score + column_score
            if total_score > self._score_cutoff:
                reason = self._build_reason(
                    analyzer=analyzer,
                    content_score=content_score,
                    column_score=column_score,
                )

                scored_tag = ScoredTag(
                    tag=analyzer.tag,
                    score=total_score,
                    reason=reason,
                )

                results.append(scored_tag)

        return results

    def _build_reason(
        self, analyzer: TagAnalyzer, content_score: float, column_score: float
    ) -> str:
        """Build a human-readable reason for why this tag was matched."""
        parts = []
        if content_score > 0:
            parts.append(f"content match (score: {content_score:.2f})")
        if column_score > 0:
            parts.append(f"column name match (score: {column_score:.2f})")

        if not parts:
            return f"Detected by {analyzer.tag.name.root} recognizer"

        return f"Detected by {analyzer.tag.name.root} recognizer: {', '.join(parts)}"
