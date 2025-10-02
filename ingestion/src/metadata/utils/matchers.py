import re
from abc import ABC, abstractmethod
from collections.abc import Mapping
from re import Pattern
from typing import Any, Generic, Sequence, TypeVar, Union
from urllib.parse import urlparse

T = TypeVar("T")


class Matcher(ABC, Generic[T]):
    """Base class for all matchers with composability support."""

    @abstractmethod
    def matches(self, actual: Any) -> bool:
        """Check if the actual value matches the expected pattern."""
        pass

    @abstractmethod
    def message(self, actual: Any) -> str:
        """Generate a descriptive error message for mismatches."""
        pass

    def __eq__(self, other: Any) -> bool:
        """Enable matcher == actual syntax."""
        return self.matches(other)

    def __and__(self, other: "Matcher") -> "AndMatcher":
        """Combine matchers with & operator (AND logic)."""
        return AndMatcher(self, other)

    def __or__(self, other: "Matcher") -> "OrMatcher":
        """Combine matchers with | operator (OR logic)."""
        return OrMatcher(self, other)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(...)"

    def __sub__(self, other: "Matcher") -> "SubtractMatcher":
        """Subtract a matcher with - operator (AND NOT logic)."""
        return SubtractMatcher(self, other)


class AndMatcher(Matcher):
    """Combines multiple matchers with AND logic."""

    def __init__(self, *matchers: Matcher):
        self.matchers = matchers

    def matches(self, actual: Any) -> bool:
        return all(m.matches(actual) for m in self.matchers)

    def message(self, actual: Any) -> str:
        failed = [m.message(actual) for m in self.matchers if not m.matches(actual)]
        return " AND ".join(failed)


class OrMatcher(Matcher):
    """Combines multiple matchers with OR logic."""

    def __init__(self, *matchers: Matcher):
        self.matchers = matchers

    def matches(self, actual: Any) -> bool:
        return any(m.matches(actual) for m in self.matchers)

    def message(self, actual: Any) -> str:
        messages = [m.message(actual) for m in self.matchers]
        return f"None of the conditions matched: ({' OR '.join(messages)})"


class SubtractMatcher(Matcher):
    """Combines matchers with subtraction logic (A - B means A AND NOT B)."""

    def __init__(self, positive: Matcher, negative: Matcher):
        self.positive = positive
        self.negative = negative

    def matches(self, actual: Any) -> bool:
        # Must match positive and NOT match negative
        return self.positive.matches(actual) and not self.negative.matches(actual)

    def message(self, actual: Any) -> str:
        if not self.positive.matches(actual):
            return f"Does not match required condition: {self.positive.message(actual)}"
        if self.negative.matches(actual):
            return f"Matches excluded condition: value should not match {self.negative}"
        return "Match successful"


class InAnyOrder(Matcher[Sequence]):
    """Matches sequences with items in any order."""

    def __init__(self, expected: Sequence):
        self.expected = list(expected)

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
            return False

        actual_list = list(actual)
        if len(actual_list) != len(self.expected):
            return False

        expected_copy = self.expected.copy()
        for item in actual_list:
            try:
                expected_copy.remove(item)
            except ValueError:
                return False

        return len(expected_copy) == 0

    def message(self, actual: Any) -> str:
        return f"{actual} does not contain items {self.expected} in any order"


class HasValues(Matcher[Mapping]):
    """Matches dictionaries by checking specific key-value pairs."""

    def __init__(self, **expected):
        self.expected = expected

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, Mapping):
            return False

        for key, expected_value in self.expected.items():
            if key not in actual:
                return False

            actual_value = actual[key]

            # Support nested matchers
            if isinstance(expected_value, Matcher):
                if not expected_value.matches(actual_value):
                    return False
            elif actual_value != expected_value:
                return False

        return True

    def message(self, actual: Any) -> str:
        if not isinstance(actual, Mapping):
            return f"{actual} is not a mapping"

        mismatches = []
        for key, expected_value in self.expected.items():
            if key not in actual:
                mismatches.append(f"key '{key}' does not exist")
            else:
                actual_value = actual[key]
                if isinstance(expected_value, Matcher):
                    if not expected_value.matches(actual_value):
                        nested_msg = expected_value.message(actual_value)
                        mismatches.append(
                            f"{key}.{nested_msg}"
                            if "does not exist" in nested_msg
                            else f"{key}: {nested_msg}"
                        )
                elif actual_value != expected_value:
                    mismatches.append(
                        f"Object mismatch {{'{key}': {repr(actual_value)} (actual) != {repr(expected_value)} (expected)}}"
                    )

        return "; ".join(mismatches) if mismatches else "Match successful"


class HasProperties(Matcher):
    """Matches objects by checking specific attribute values."""

    def __init__(self, **expected):
        self.expected = expected

    def matches(self, actual: Any) -> bool:
        for attr, expected_value in self.expected.items():
            if not hasattr(actual, attr):
                return False

            actual_value = getattr(actual, attr)

            # Support nested matchers
            if isinstance(expected_value, Matcher):
                if not expected_value.matches(actual_value):
                    return False
            elif actual_value != expected_value:
                return False

        return True

    def message(self, actual: Any) -> str:
        mismatches = []
        for attr, expected_value in self.expected.items():
            if not hasattr(actual, attr):
                mismatches.append(f"attribute '{attr}' does not exist")
            else:
                actual_value = getattr(actual, attr)
                if isinstance(expected_value, Matcher):
                    if not expected_value.matches(actual_value):
                        mismatches.append(
                            f"{attr}: {expected_value.message(actual_value)}"
                        )
                elif actual_value != expected_value:
                    mismatches.append(
                        f"{attr}: {repr(actual_value)} (actual) != {repr(expected_value)} (expected)"
                    )

        return (
            f"{actual.__class__.__name__} - {'; '.join(mismatches)}"
            if mismatches
            else "Match successful"
        )


class AnInstanceOf(Matcher):
    """Matches objects by their type."""

    def __init__(self, expected_type: type):
        self.expected_type = expected_type

    def matches(self, actual: Any) -> bool:
        return isinstance(actual, self.expected_type)

    def message(self, actual: Any) -> str:
        return f"{actual} is not an instance of {self.expected_type.__name__} (actual type: {type(actual).__name__})"


class AnUrl(Matcher[str]):
    """Matches valid URLs."""

    def __init__(self, scheme: str = None, netloc: str = None):
        self.scheme = scheme
        self.netloc = netloc

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, str):
            return False

        try:
            parsed = urlparse(actual)
            has_scheme = bool(parsed.scheme)
            has_netloc = bool(parsed.netloc)

            if not (has_scheme and has_netloc):
                return False

            if self.scheme and parsed.scheme != self.scheme:
                return False

            if self.netloc and parsed.netloc != self.netloc:
                return False

            return True
        except Exception:
            return False

    def message(self, actual: Any) -> str:
        if not isinstance(actual, str):
            return f"{repr(actual)} is not a string"

        try:
            parsed = urlparse(actual)
            if not parsed.scheme or not parsed.netloc:
                return f"{repr(actual)} is not a valid URL"

            if self.scheme and parsed.scheme != self.scheme:
                return f"URL scheme {repr(parsed.scheme)} != {repr(self.scheme)}"

            if self.netloc and parsed.netloc != self.netloc:
                return f"URL netloc {repr(parsed.netloc)} != {repr(self.netloc)}"
        except Exception as e:
            return f"{repr(actual)} is not a valid URL: {e}"

        return "URL is valid"


class ASequenceContaining(Matcher[Sequence]):
    """Matches sequences that contain an item matching the given matcher."""

    def __init__(self, matcher: Any):
        self.matcher = matcher

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
            return False

        for item in actual:
            if isinstance(self.matcher, Matcher):
                if self.matcher.matches(item):
                    return True
            elif item == self.matcher:
                return True

        return False

    def message(self, actual: Any) -> str:
        if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
            return f"{actual} is not a sequence"

        matcher_desc = (
            repr(self.matcher)
            if not isinstance(self.matcher, Matcher)
            else str(self.matcher)
        )
        return f"Sequence {actual} does not contain any item matching {matcher_desc}"


class ASequenceOfLength(Matcher[Sequence]):
    """Matches sequences of a specific length."""

    def __init__(self, expected_length: int):
        self.expected_length = expected_length

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
            return False
        return len(actual) == self.expected_length

    def message(self, actual: Any) -> str:
        if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
            return f"{actual} is not a sequence"
        return f"Sequence length {len(actual)} != {self.expected_length}"


class MatchesRegex(Matcher[str]):
    """Matches strings against a regular expression pattern."""

    def __init__(self, pattern: Union[str, Pattern], flags: int = 0):
        """
        Initialize the regex matcher.

        Args:
            pattern: A regex pattern string or compiled Pattern object
            flags: Optional regex flags (e.g., re.IGNORECASE, re.MULTILINE)
        """
        if isinstance(pattern, str):
            self.pattern_str = pattern
            self.pattern = re.compile(pattern, flags)
        else:
            # Already a compiled pattern
            self.pattern = pattern
            self.pattern_str = pattern.pattern
        self.flags = flags

    def matches(self, actual: Any) -> bool:
        if not isinstance(actual, str):
            return False

        return self.pattern.search(actual) is not None

    def message(self, actual: Any) -> str:
        if not isinstance(actual, str):
            return f"{repr(actual)} is not a string"

        # Show first 100 chars if string is very long
        actual_display = actual if len(actual) <= 100 else actual[:97] + "..."

        return (
            f"{repr(actual_display)} does not match pattern `{str(self.pattern_str)}`"
        )

    def __repr__(self) -> str:
        return f"MatchesRegex({str(self.pattern_str)})"
