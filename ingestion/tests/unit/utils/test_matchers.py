import re
from dataclasses import dataclass

import pytest

from metadata.utils.matchers import (
    AnInstanceOf,
    AnUrl,
    ASequenceContaining,
    ASequenceOfLength,
    HasProperties,
    HasValues,
    InAnyOrder,
    Matcher,
    MatchesRegex,
)


class TestInAnyOrder:
    """Test suite for InAnyOrder matcher."""

    @pytest.fixture
    def matcher(self):
        return InAnyOrder([1, 2, 3])

    def test_matches_same_order(self, matcher):
        assert [1, 2, 3] == matcher

    def test_matches_different_order(self, matcher):
        assert [3, 1, 2] == matcher
        assert [2, 3, 1] == matcher

    def test_matches_reverse_order(self, matcher):
        assert [3, 2, 1] == matcher

    def test_fails_with_missing_items(self, matcher):
        assert matcher != [1, 2]
        assert matcher != [1, 2, 4]

    def test_fails_with_extra_items(self, matcher):
        assert matcher != [1, 2, 3, 4]

    def test_fails_with_duplicate_handling(self):
        matcher = InAnyOrder([1, 1, 2])
        assert matcher == [1, 1, 2]
        assert matcher == [2, 1, 1]
        assert matcher != [1, 2, 2]

    def test_fails_with_wrong_type(self, matcher):
        assert matcher != "123"
        assert matcher != 123
        assert matcher != {"a": 1, "b": 2}

    def test_empty_sequence(self):
        matcher = InAnyOrder([])
        assert [] == matcher
        assert matcher != [1]

    def test_message_on_mismatch(self, matcher):
        msg = matcher.message([4, 5, 6])
        assert "[4, 5, 6]" in msg
        assert "does not contain" in msg
        assert "[1, 2, 3]" in msg

    def test_tuple_matching(self):
        matcher = InAnyOrder((1, 2, 3))
        assert (3, 2, 1) == matcher
        assert [3, 2, 1] == matcher


class TestHasValues:
    """Test suite for HasValues matcher."""

    @pytest.fixture
    def simple_dict(self):
        return {"name": "John", "age": 30, "city": "NYC"}

    @pytest.fixture
    def nested_dict(self):
        return {"user": {"name": "John", "address": {"city": "NYC", "zip": "10001"}}}

    def test_matches_single_key(self, simple_dict):
        assert simple_dict == HasValues(name="John")

    def test_matches_multiple_keys(self, simple_dict):
        assert simple_dict == HasValues(name="John", age=30)

    def test_matches_all_keys(self, simple_dict):
        assert simple_dict == HasValues(name="John", age=30, city="NYC")

    def test_ignores_extra_keys(self, simple_dict):
        assert simple_dict == HasValues(name="John")

    def test_fails_on_missing_key(self, simple_dict):
        assert HasValues(country="USA") != simple_dict

    def test_fails_on_wrong_value(self, simple_dict):
        assert HasValues(name="Jane") != simple_dict

    def test_nested_matcher(self, nested_dict):
        matcher = HasValues(user=HasValues(name="John"))
        assert nested_dict == matcher

    def test_deeply_nested_matcher(self, nested_dict):
        matcher = HasValues(user=HasValues(address=HasValues(city="NYC")))
        assert nested_dict == matcher

    def test_nested_matcher_fails(self, nested_dict):
        matcher = HasValues(user=HasValues(name="Jane"))
        assert matcher != nested_dict

    def test_message_missing_key(self, simple_dict):
        matcher = HasValues(country="USA")
        msg = matcher.message(simple_dict)
        assert "country" in msg
        assert "does not exist" in msg

    def test_message_wrong_value(self, simple_dict):
        matcher = HasValues(name="Jane")
        msg = matcher.message(simple_dict)
        assert "name" in msg
        assert "'John'" in msg
        assert "'Jane'" in msg

    def test_message_nested_missing_key(self, nested_dict):
        matcher = HasValues(user=HasValues(phone="123"))
        msg = matcher.message(nested_dict)
        assert "phone" in msg or "does not exist" in msg

    def test_empty_matcher(self, simple_dict):
        matcher = HasValues()
        assert simple_dict == matcher

    def test_fails_on_non_mapping(self):
        matcher = HasValues(foo="bar")
        assert matcher != [1, 2, 3]
        assert matcher != "string"
        assert matcher != 123


class TestHasProperties:
    """Test suite for HasProperties matcher."""

    @dataclass
    class Person:
        name: str
        age: int
        email: str = None

    @dataclass
    class Address:
        street: str
        city: str

    @dataclass
    class User:
        name: str
        address: "TestHasProperties.Address"

    @pytest.fixture
    def person(self):
        return self.Person(name="Alice", age=25, email="alice@example.com")

    @pytest.fixture
    def user_with_address(self):
        return self.User(
            name="Bob", address=self.Address(street="Main St", city="Boston")
        )

    def test_matches_single_property(self, person):
        assert person == HasProperties(name="Alice")

    def test_matches_multiple_properties(self, person):
        assert person == HasProperties(name="Alice", age=25)

    def test_matches_all_properties(self, person):
        assert person == HasProperties(name="Alice", age=25, email="alice@example.com")

    def test_fails_on_missing_property(self, person):
        assert HasProperties(phone="123") != person

    def test_fails_on_wrong_value(self, person):
        assert HasProperties(name="Bob") != person

    def test_nested_property_matcher(self, user_with_address):
        matcher = HasProperties(name="Bob", address=HasProperties(city="Boston"))
        assert user_with_address == matcher

    def test_nested_property_matcher_fails(self, user_with_address):
        matcher = HasProperties(address=HasProperties(city="NYC"))
        assert matcher != user_with_address

    def test_message_missing_property(self, person):
        matcher = HasProperties(phone="123")
        msg = matcher.message(person)
        assert "phone" in msg
        assert "does not exist" in msg

    def test_message_wrong_value(self, person):
        matcher = HasProperties(name="Bob")
        msg = matcher.message(person)
        assert "name" in msg
        assert "Alice" in msg
        assert "Bob" in msg

    def test_empty_matcher(self, person):
        matcher = HasProperties()
        assert person == matcher

    def test_with_plain_object(self):
        class SimpleClass:
            def __init__(self):
                self.x = 10
                self.y = 20

        obj = SimpleClass()
        assert obj == HasProperties(x=10, y=20)


class TestAnInstanceOf:
    """Test suite for AnInstanceOf matcher."""

    @dataclass
    class Animal:
        name: str

    @dataclass
    class Dog(Animal):
        breed: str = "Unknown"

    @pytest.fixture
    def dog(self):
        return self.Dog(name="Buddy", breed="Golden Retriever")

    def test_matches_exact_type(self, dog):
        assert dog == AnInstanceOf(self.Dog)

    def test_matches_parent_type(self, dog):
        assert dog == AnInstanceOf(self.Animal)

    def test_matches_basic_types(self):
        assert 42 == AnInstanceOf(int)
        assert "hello" == AnInstanceOf(str)
        assert [1, 2, 3] == AnInstanceOf(list)
        assert {"key": "value"} == AnInstanceOf(dict)

    def test_fails_wrong_type(self, dog):
        assert AnInstanceOf(str) != dog
        assert AnInstanceOf(int) != dog

    def test_fails_sibling_type(self):
        class Cat(self.Animal):
            pass

        dog = self.Dog(name="Buddy")
        assert AnInstanceOf(Cat) != dog

    def test_message_on_mismatch(self):
        matcher = AnInstanceOf(str)
        msg = matcher.message(123)
        assert "str" in msg
        assert "int" in msg
        assert "not an instance" in msg

    def test_with_none(self):
        assert AnInstanceOf(str) != None
        assert None == AnInstanceOf(type(None))


class TestAnUrl:
    """Test suite for AnUrl matcher."""

    def test_matches_http_url(self):
        assert "http://example.com" == AnUrl()

    def test_matches_https_url(self):
        assert "https://example.com" == AnUrl()

    def test_matches_url_with_path(self):
        assert "https://example.com/path/to/resource" == AnUrl()

    def test_matches_url_with_query(self):
        assert "https://example.com?key=value" == AnUrl()

    def test_matches_url_with_fragment(self):
        assert "https://example.com#section" == AnUrl()

    def test_matches_url_with_port(self):
        assert "https://example.com:8080" == AnUrl()

    def test_matches_url_with_subdomain(self):
        assert "https://sub.example.com" == AnUrl()

    def test_fails_without_scheme(self):
        assert AnUrl() != "example.com"

    def test_fails_without_netloc(self):
        assert AnUrl() != "https://"

    def test_fails_invalid_string(self):
        assert AnUrl() != "not a url"

    def test_fails_non_string(self):
        assert AnUrl() != 123
        assert AnUrl() != []

    def test_scheme_filter(self):
        assert "https://example.com" == AnUrl(scheme="https")
        assert AnUrl(scheme="https") != "http://example.com"

    def test_netloc_filter(self):
        assert "https://example.com" == AnUrl(netloc="example.com")
        assert AnUrl(netloc="example.com") != "https://other.com"

    def test_scheme_and_netloc_filter(self):
        matcher = AnUrl(scheme="https", netloc="example.com")
        assert "https://example.com" == matcher
        assert matcher != "http://example.com"
        assert matcher != "https://other.com"

    def test_message_on_non_string(self):
        msg = AnUrl().message(123)
        assert "not a string" in msg

    def test_message_on_invalid_url(self):
        msg = AnUrl().message("not-a-url")
        assert "not a valid URL" in msg


class TestASequenceContaining:
    """Test suite for ASequenceContaining matcher."""

    def test_matches_with_exact_item(self):
        matcher = ASequenceContaining(2)
        assert [1, 2, 3] == matcher

    def test_matches_first_item(self):
        matcher = ASequenceContaining(1)
        assert [1, 2, 3] == matcher

    def test_matches_last_item(self):
        matcher = ASequenceContaining(3)
        assert [1, 2, 3] == matcher

    def test_fails_item_not_present(self):
        matcher = ASequenceContaining(4)
        assert matcher != [1, 2, 3]

    def test_with_nested_matcher(self):
        matcher = ASequenceContaining(AnUrl())
        assert ["https://example.com", "not-url"] == matcher

    def test_with_nested_matcher_all_fail(self):
        matcher = ASequenceContaining(AnUrl())
        assert matcher != ["not-url", "also-not-url"]

    def test_with_dict_matcher(self):
        matcher = ASequenceContaining(HasValues(name="Alice"))
        data = [
            {"name": "Bob", "age": 30},
            {"name": "Alice", "age": 25},
        ]
        assert data == matcher

    def test_empty_sequence(self):
        matcher = ASequenceContaining(1)
        assert matcher != []

    def test_fails_on_string(self):
        matcher = ASequenceContaining("a")
        assert matcher != "abc"

    def test_fails_on_non_sequence(self):
        matcher = ASequenceContaining(1)
        assert matcher != 123
        assert matcher != {"key": 1}

    def test_with_tuple(self):
        matcher = ASequenceContaining(2)
        assert (1, 2, 3) == matcher

    def test_message_on_mismatch(self):
        matcher = ASequenceContaining(4)
        msg = matcher.message([1, 2, 3])
        assert "does not contain" in msg


class TestASequenceOfLength:
    """Test suite for ASequenceOfLength matcher."""

    def test_matches_correct_length(self):
        matcher = ASequenceOfLength(3)
        assert [1, 2, 3] == matcher

    def test_matches_empty_sequence(self):
        matcher = ASequenceOfLength(0)
        assert [] == matcher

    def test_fails_longer_sequence(self):
        matcher = ASequenceOfLength(2)
        assert matcher != [1, 2, 3]

    def test_fails_shorter_sequence(self):
        matcher = ASequenceOfLength(4)
        assert matcher != [1, 2, 3]

    def test_with_tuple(self):
        matcher = ASequenceOfLength(3)
        assert (1, 2, 3) == matcher

    def test_fails_on_string(self):
        matcher = ASequenceOfLength(3)
        assert matcher != "abc"

    def test_fails_on_non_sequence(self):
        matcher = ASequenceOfLength(1)
        assert matcher != 1
        assert matcher != {"key": "value"}

    def test_message_on_mismatch(self):
        matcher = ASequenceOfLength(5)
        msg = matcher.message([1, 2, 3])
        assert "length" in msg.lower()
        assert "3" in msg
        assert "5" in msg


class TestAndMatcher:
    """Test suite for AND composition."""

    def test_both_conditions_pass(self):
        matcher = AnInstanceOf(list) & ASequenceOfLength(3)
        assert [1, 2, 3] == matcher

    def test_first_condition_fails(self):
        matcher = AnInstanceOf(dict) & ASequenceOfLength(3)
        assert matcher != [1, 2, 3]

    def test_second_condition_fails(self):
        matcher = AnInstanceOf(list) & ASequenceOfLength(5)
        assert matcher != [1, 2, 3]

    def test_both_conditions_fail(self):
        matcher = AnInstanceOf(dict) & ASequenceOfLength(5)
        assert matcher != [1, 2, 3]

    def test_chaining_multiple_conditions(self):
        matcher = AnInstanceOf(list) & ASequenceOfLength(3) & ASequenceContaining(2)
        assert [1, 2, 3] == matcher

    def test_complex_composition(self):
        @dataclass
        class User:
            name: str
            age: int

        user = User(name="Alice", age=25)
        matcher = AnInstanceOf(User) & HasProperties(name="Alice", age=25)
        assert user == matcher

    def test_message_shows_all_failures(self):
        matcher = AnInstanceOf(dict) & ASequenceOfLength(5)
        msg = matcher.message([1, 2, 3])
        assert "AND" in msg


class TestOrMatcher:
    """Test suite for OR composition."""

    def test_first_condition_passes(self):
        matcher = AnInstanceOf(list) | AnInstanceOf(dict)
        assert [1, 2, 3] == matcher

    def test_second_condition_passes(self):
        matcher = AnInstanceOf(dict) | AnInstanceOf(list)
        assert [1, 2, 3] == matcher

    def test_both_conditions_pass(self):
        matcher = ASequenceOfLength(3) | ASequenceContaining(1)
        assert [1, 2, 3] == matcher

    def test_both_conditions_fail(self):
        matcher = AnInstanceOf(dict) | AnInstanceOf(str)
        assert matcher != [1, 2, 3]

    def test_chaining_multiple_conditions(self):
        matcher = AnInstanceOf(dict) | AnInstanceOf(str) | AnInstanceOf(list)
        assert [1, 2, 3] == matcher

    def test_message_shows_all_failures(self):
        matcher = AnInstanceOf(dict) | AnInstanceOf(str)
        msg = matcher.message([1, 2, 3])
        assert "OR" in msg


class TestComplexCompositions:
    """Test suite for complex matcher compositions."""

    def test_and_or_combination(self):
        # (list AND length=3) OR (dict)
        matcher = (AnInstanceOf(list) & ASequenceOfLength(3)) | AnInstanceOf(dict)
        assert [1, 2, 3] == matcher
        assert {"key": "value"} == matcher
        assert matcher != [1, 2]

    def test_nested_sequences_with_matchers(self):
        data = [
            {"name": "Alice", "url": "https://alice.com"},
            {"name": "Bob", "url": "https://bob.com"},
        ]
        matcher = ASequenceOfLength(2) & ASequenceContaining(
            HasValues(name="Alice", url=AnUrl())
        )
        assert data == matcher

    def test_tuple_with_multiple_matchers(self):
        data = ("https://example.com", {"status": "active"}, [1, 2, 3])
        result = data == (AnUrl(), HasValues(status="active"), InAnyOrder([3, 2, 1]))
        assert result

    def test_deeply_nested_matchers(self):
        data = {
            "users": [{"name": "Alice", "age": 25}, {"name": "Bob", "age": 30}],
            "count": 2,
        }
        matcher = HasValues(
            count=2,
            users=ASequenceContaining(HasValues(name="Alice")) & ASequenceOfLength(2),
        )
        assert data == matcher

    @dataclass
    class Product:
        name: str
        price: float
        url: str

    def test_dataclass_with_complex_validation(self):
        product = self.Product(
            name="Widget", price=29.99, url="https://store.example.com/widget"
        )
        matcher = AnInstanceOf(self.Product) & HasProperties(
            name="Widget", url=AnUrl(scheme="https")
        )
        assert product == matcher


class TestEdgeCases:
    """Test suite for edge cases and corner scenarios."""

    def test_none_values(self):
        assert HasValues(key=None) != {"key": "value"}
        assert {"key": None} == HasValues(key=None)

    def test_nested_none_in_dict(self):
        data = {"user": None}
        assert data == HasValues(user=None)

    def test_empty_dict_matching(self):
        assert {} == HasValues()
        assert HasValues(key="value") != {}

    def test_empty_list_matching(self):
        assert [] == InAnyOrder([])
        assert InAnyOrder([1]) != []

    def test_boolean_values(self):
        assert {"active": True} == HasValues(active=True)
        assert HasValues(active=True) != {"active": False}

    def test_numeric_types(self):
        assert {"count": 0} == HasValues(count=0)
        assert {"value": 0.0} == HasValues(value=0.0)

    def test_unicode_strings(self):
        assert {"name": "José"} == HasValues(name="José")
        assert {"emoji": "🎉"} == HasValues(emoji="🎉")

    def test_mixed_type_sequence(self):
        matcher = InAnyOrder([1, "two", 3.0, None])
        assert [None, "two", 3.0, 1] == matcher


class TestMatchesRegex:
    """Test suite for MatchesRegex matcher."""

    def test_matches_simple_pattern(self):
        matcher = MatchesRegex(r"hello")
        assert "hello" == matcher
        assert "hello world" == matcher

    def test_fails_simple_pattern(self):
        matcher = MatchesRegex(r"hello")
        assert matcher != "goodbye"
        assert matcher != "HELLO"

    def test_matches_digit_pattern(self):
        matcher = MatchesRegex(r"^\d+$")
        assert "123" == matcher
        assert "0" == matcher

    def test_fails_digit_pattern(self):
        matcher = MatchesRegex(r"^\d+$")
        assert matcher != "abc"
        assert matcher != "123abc"

    def test_matches_with_groups(self):
        matcher = MatchesRegex(r"(\w+)@(\w+)\.com")
        assert "user@example.com" == matcher

    def test_matches_start_anchor(self):
        matcher = MatchesRegex(r"^hello")
        assert "hello world" == matcher
        assert matcher != "say hello"

    def test_matches_end_anchor(self):
        matcher = MatchesRegex(r"world$")
        assert "hello world" == matcher
        assert matcher != "world hello"

    def test_matches_with_ignorecase_flag(self):
        matcher = MatchesRegex(r"hello", re.IGNORECASE)
        assert "hello" == matcher
        assert "HELLO" == matcher
        assert "HeLLo" == matcher

    def test_matches_with_multiline_flag(self):
        matcher = MatchesRegex(r"^line", re.MULTILINE)
        text = "first line\nline two\nline three"
        assert text == matcher

    def test_matches_with_dotall_flag(self):
        matcher = MatchesRegex(r"start.*end", re.DOTALL)
        assert "start\nmiddle\nend" == matcher

    def test_matches_compiled_pattern(self):
        pattern = re.compile(r"test\d+")
        matcher = MatchesRegex(pattern)
        assert "test123" == matcher

    def test_fails_on_non_string(self):
        matcher = MatchesRegex(r"hello")
        assert matcher != 123
        assert matcher != ["hello"]
        assert matcher != None

    def test_message_on_non_string(self):
        matcher = MatchesRegex(r"hello")
        msg = matcher.message(123)
        assert "not a string" in msg

    def test_message_on_pattern_mismatch(self):
        matcher = MatchesRegex(r"^\d+$")
        msg = matcher.message("abc")
        assert "abc" in msg
        assert "does not match pattern" in msg
        assert r"^\d+$" in msg

    def test_message_truncates_long_strings(self):
        matcher = MatchesRegex(r"pattern")
        long_string = "x" * 200
        msg = matcher.message(long_string)
        assert "..." in msg
        assert len(msg) < 500  # Message should be reasonably short

    def test_partial_match(self):
        # search() behavior - matches anywhere in string
        matcher = MatchesRegex(r"world")
        assert "hello world" == matcher

    def test_complex_email_pattern(self):
        matcher = MatchesRegex(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        assert "user@example.com" == matcher
        assert "user.name@example.co.uk" == matcher
        assert matcher != "invalid@email"
        assert matcher != "@example.com"

    def test_phone_pattern(self):
        matcher = MatchesRegex(r"^\d{3}-\d{3}-\d{4}$")
        assert "123-456-7890" == matcher
        assert matcher != "123-45-6789"

    def test_repr(self):
        matcher = MatchesRegex(r"test\d+")
        repr_str = repr(matcher)
        assert "MatchesRegex" in repr_str
        assert r"test\d+" in repr_str


class TestSubtractMatcher:
    """Test suite for SubtractMatcher (- operator)."""

    def test_basic_subtraction(self):
        """Test A - B: matches A but not B."""
        matcher = MatchesRegex(r"foo") - MatchesRegex(r"food")
        assert "foo" == matcher
        assert "foobar" == matcher
        assert matcher != "food"
        assert matcher != "foodbar"

    def test_your_example(self):
        """Test the exact example from your question."""
        matcher = MatchesRegex(r"foo") & MatchesRegex(r"bar") - MatchesRegex(r"food")

        # Should match: contains both "foo" and "bar", but not "food"
        assert "foobar" == matcher
        assert "foo bar" == matcher
        assert "bar foo" == matcher
        assert "barfoo" == matcher

        # Should NOT match: contains "food"
        assert matcher != "foodbar"
        assert matcher != "foo bar food"
        assert matcher != "bar food"
        assert matcher != "foo food"

        # Should NOT match: missing "foo" or "bar"
        assert matcher != "foo"
        assert matcher != "bar"

    def test_subtraction_with_has_values(self):
        """Test subtraction with dictionary matchers."""
        matcher = HasValues(name="John") - HasValues(age=30)

        assert {"name": "John", "age": 25} == matcher
        assert {"name": "John"} == matcher
        assert matcher != {"name": "John", "age": 30}

    def test_subtraction_with_instance_of(self):
        """Test subtraction with type matchers."""
        matcher = AnInstanceOf(str) - MatchesRegex(r"^\d+$")

        assert "hello" == matcher
        assert "abc123" == matcher
        assert matcher != "123"  # All digits - excluded
        assert matcher != 123  # Not a string

    def test_chained_subtraction(self):
        """Test multiple subtractions: A - B - C."""
        matcher = (
            MatchesRegex(r"test") - MatchesRegex(r"test1") - MatchesRegex(r"test2")
        )

        assert "test" == matcher
        assert "test3" == matcher
        assert matcher != "test1"
        assert matcher != "test2"
        assert matcher != "test12"

    def test_subtraction_with_and(self):
        """Test precedence: (A & B) - C."""
        matcher = (MatchesRegex(r"foo") & MatchesRegex(r"bar")) - MatchesRegex(r"baz")

        assert "foobar" == matcher
        assert matcher != "foobarbaz"
        assert matcher != "foo"  # Missing "bar"

    def test_subtraction_with_or(self):
        """Test precedence: (A | B) - C."""
        matcher = (MatchesRegex(r"foo") | MatchesRegex(r"bar")) - MatchesRegex(r"baz")

        assert "foo" == matcher
        assert "bar" == matcher
        assert matcher != "foobaz"
        assert matcher != "barbaz"

    def test_message_on_positive_failure(self):
        """Test message when positive condition fails."""
        matcher = MatchesRegex(r"foo") - MatchesRegex(r"food")
        msg = matcher.message("bar")
        assert "Does not match required condition" in msg
        assert "foo" in msg

    def test_message_on_negative_match(self):
        """Test message when negative condition matches."""
        matcher = MatchesRegex(r"foo") - MatchesRegex(r"food")
        msg = matcher.message("food")
        assert "Matches excluded condition" in msg or "should not match" in msg

    def test_complex_email_example(self):
        """Test practical example: emails from specific domain but not test accounts."""
        matcher = (MatchesRegex(r"@example\.com$")) - MatchesRegex(r"^test")

        assert "user@example.com" == matcher
        assert "admin@example.com" == matcher
        assert matcher != "test@example.com"
        assert matcher != "testuser@example.com"
        assert matcher != "user@other.com"

    def test_sequence_subtraction(self):
        """Test subtraction with sequence matchers."""
        matcher = (ASequenceOfLength(3) & ASequenceContaining(1)) - ASequenceContaining(
            4
        )

        assert [1, 2, 3] == matcher
        assert matcher != [1, 2, 4]  # Contains excluded 4
        assert matcher != [1, 2]  # Wrong length

    def test_properties_subtraction(self):
        """Test subtraction with property matchers."""
        from dataclasses import dataclass

        @dataclass
        class User:
            name: str
            role: str
            status: str

        # Match users who are admins but not inactive
        matcher = HasProperties(role="admin") - HasProperties(status="inactive")

        active_admin = User(name="Alice", role="admin", status="active")
        inactive_admin = User(name="Bob", role="admin", status="inactive")
        active_user = User(name="Charlie", role="user", status="active")

        assert active_admin == matcher
        assert matcher != inactive_admin
        assert matcher != active_user


class TestSubtractionOperatorPrecedence:
    """Test operator precedence and associativity."""

    def test_and_before_subtraction(self):
        """Test that & binds tighter than -."""
        # A & B - C should be (A & B) - C
        matcher1 = MatchesRegex(r"foo") & MatchesRegex(r"bar") - MatchesRegex(r"baz")
        matcher2 = (MatchesRegex(r"foo") & MatchesRegex(r"bar")) - MatchesRegex(r"baz")

        test_value = "foobar"
        assert matcher1.matches(test_value) == matcher2.matches(test_value)

    def test_left_to_right_evaluation(self):
        """Test left-to-right evaluation of subtraction."""
        # A - B - C should be (A - B) - C
        matcher = (
            MatchesRegex(r"test") - MatchesRegex(r"test1") - MatchesRegex(r"test2")
        )

        assert "test" == matcher
        assert "test3" == matcher
        assert matcher != "test1"
        assert matcher != "test2"

    def test_parentheses_override_precedence(self):
        """Test that parentheses can change evaluation order."""
        # This is a bit contrived but demonstrates the principle
        matcher1 = MatchesRegex(r"foo") - (
            MatchesRegex(r"food") | MatchesRegex(r"fool")
        )

        assert "foo" == matcher1
        assert "foobar" == matcher1
        assert matcher1 != "food"
        assert matcher1 != "fool"


class TestSubtractionEdgeCases:
    """Test edge cases for subtraction matcher."""

    def test_subtract_always_true_matcher(self):
        """Test subtracting a matcher that always matches."""

        class AlwaysMatches(Matcher):
            def matches(self, actual):
                return True

            def message(self, actual):
                return "Always matches"

        matcher = MatchesRegex(r"foo") - AlwaysMatches()
        # Should never match because AlwaysMatches always excludes
        assert matcher != "foo"
        assert matcher != "foobar"

    def test_subtract_never_true_matcher(self):
        """Test subtracting a matcher that never matches."""

        class NeverMatches(Matcher):
            def matches(self, actual):
                return False

            def message(self, actual):
                return "Never matches"

        matcher = MatchesRegex(r"foo") - NeverMatches()
        # Should behave like just the positive matcher
        assert "foo" == matcher
        assert "foobar" == matcher
        assert matcher != "bar"

    def test_subtract_same_matcher(self):
        """Test A - A (should never match)."""
        pattern = MatchesRegex(r"foo")
        matcher = pattern - MatchesRegex(r"foo")

        assert matcher != "foo"
        assert matcher != "foobar"

    def test_empty_string_with_subtraction(self):
        """Test subtraction with empty string patterns."""
        # Match anything but not empty strings
        matcher = AnInstanceOf(str) - MatchesRegex(r"^$")

        assert "hello" == matcher
        assert matcher != ""

    def test_message_quality(self):
        """Test that error messages are helpful."""
        matcher = (MatchesRegex(r"user")) - MatchesRegex(r"@test\.com$")

        # Test positive condition failure
        msg1 = matcher.message("admin")
        assert "required condition" in msg1.lower() or "does not match" in msg1.lower()

        # Test negative condition match
        msg2 = matcher.message("user@test.com")
        assert "excluded" in msg2.lower() or "should not match" in msg2.lower()
