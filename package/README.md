# Data Handlers Module

Custom handlers for the Data extension, packaged as a Python library.

## Installation

### For Local Development

```bash
cd /path/to/extensions/data
pip install -e package/
```

## Usage

```python
from data import get_handler

handler = get_handler("data_onboardings")
result = handler.run(payload={})
```
