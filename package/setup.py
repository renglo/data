"""
Data Package
Custom handlers and utilities for the Data extension.

Blueprints stay at repo-root ``blueprints/``. This setup copies them into
``data/blueprints/`` at build time so the wheel includes the current tag.
"""

from pathlib import Path

from setuptools import find_packages, setup

_PACKAGE_DIR = Path(__file__).resolve().parent
_SRC = _PACKAGE_DIR.parent / "blueprints"
_DEST = _PACKAGE_DIR / "data" / "blueprints"
if _SRC.is_dir():
    _DEST.mkdir(parents=True, exist_ok=True)
    for _path in _SRC.glob("*.json"):
        _DEST.joinpath(_path.name).write_bytes(_path.read_bytes())


setup(
    name="renglo-data",
    version="1.0.0",
    description="Data extension custom handlers and utilities",
    author="Renglo Team",
    license="MIT",
    packages=find_packages(),
    python_requires=">=3.12",
    install_requires=[],
    include_package_data=True,
    package_data={"data": ["blueprints/*.json"]},
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3.12",
    ],
)
