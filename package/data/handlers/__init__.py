"""
Data handlers.

All custom handlers for the Data extension.
Each handler should implement a `run(payload)` method.
"""

__all__ = ["DataOnboardings"]


def __getattr__(name):
    """Lazy import handlers when accessed."""
    if name == "DataOnboardings":
        from data.handlers.data_onboardings import DataOnboardings

        return DataOnboardings

    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
