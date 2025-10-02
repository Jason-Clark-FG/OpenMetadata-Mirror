from _pytest.assertion import util

# Store the original assertion explanation
_original_assertrepr_compare = util.assertrepr_compare


def pytest_assertrepr_compare(config, op, left, right):
    """
    Hook into pytest's assertion rewriting to provide custom error messages.

    This is called whenever an assertion fails and pytest is generating
    the error message to display.
    """
    # Import Matcher here to avoid circular imports
    # Adjust this import based on where your Matcher class is defined
    try:
        from metadata.utils.matchers import Matcher  # Adjust import path as needed
    except ImportError:
        # If matchers module not found, fall back to checking class name
        Matcher = None

    # Check if either side of the comparison is a Matcher
    is_left_matcher = Matcher and isinstance(left, Matcher)
    is_right_matcher = Matcher and isinstance(right, Matcher)

    # Handle: assert value == Matcher()
    if op == "==" and is_right_matcher:
        if right != left:  # Matcher comparison failed
            return [
                f"Matcher assertion failed:",
                f"",
                f"  {repr(left)} did not match {right}",
                f"",
                f"Reason:",
                f"  {right.message(left)}",
            ]

    # Handle: assert Matcher() == value
    if op == "==" and is_left_matcher:
        if left != right:  # Matcher comparison failed
            return [
                f"Matcher assertion failed:",
                f"",
                f"  {left} did not match {repr(right)}",
                f"",
                f"Reason:",
                f"  {left.message(right)}",
            ]

    # Handle: assert value != Matcher()
    if op == "!=" and is_right_matcher:
        if right == left:  # Should NOT match but it did
            return [
                f"Matcher negative assertion failed:",
                f"",
                f"  {repr(left)} should NOT match {right}",
                f"",
                f"But it did match successfully",
            ]

    # Handle: assert Matcher() != value
    if op == "!=" and is_left_matcher:
        if left == right:  # Should NOT match but it did
            return [
                f"Matcher negative assertion failed:",
                f"",
                f"  {left} should NOT match {repr(right)}",
                f"",
                f"But it did match successfully",
            ]

    # For non-matcher comparisons, return None to use default pytest behavior
    return None
