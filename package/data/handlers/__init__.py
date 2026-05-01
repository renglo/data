"""
Data handlers.

All custom handlers for the Data extension.
Each handler should implement a `run(payload)` method.
"""

__all__ = ["SchdOnboardings"]


def __getattr__(name):
    """Lazy import handlers when accessed."""
    if name == "SchdOnboardings":
        from data.handlers.data_onboardings import SchdOnboardings

        return SchdOnboardings

    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
