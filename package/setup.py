"""
Data Package
Custom handlers and utilities for the Data extension.
"""

from setuptools import find_packages, setup


setup(
    name="data",
    version="1.0.0",
    description="Data extension custom handlers and utilities",
    author="Renglo Team",
    packages=find_packages(),
    python_requires=">=3.12",
    install_requires=[
        "flask>=3.0.0",
    ],
    include_package_data=True,
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3.12",
    ],
)
