"""
Data Handlers Package.

This package provides custom handlers for the Data extension.
"""

__all__ = ["get_handler", "list_handlers", "HANDLERS"]


def _get_data_onboardings():
    from data.handlers.data_onboardings import DataOnboardings

    return DataOnboardings


def _get_initialize_extension():
    from data.handlers.initialize_extension import InitializeExtension

    return InitializeExtension


HANDLERS = {
    "data_onboardings": _get_data_onboardings,
    "initialize_extension": _get_initialize_extension,
}


def get_handler(handler_name: str):
    """Get an instantiated handler by name."""
    if handler_name not in HANDLERS:
        available = ", ".join(HANDLERS.keys())
        raise KeyError(
            f"Handler '{handler_name}' not found. Available handlers: {available}"
        )

    return HANDLERS[handler_name]()


def list_handlers():
    """List all available handler names."""
    return list(HANDLERS.keys())
