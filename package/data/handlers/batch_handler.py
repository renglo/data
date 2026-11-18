"""Apply a document batch that the scheduler already started.

SchdLoader imports data.handlers.batch_handler.BatchHandler and calls run.
The payload is the one SchdController stored for this job. Each operation
calls DataController. A failure leaves the earlier successes in place.
"""

from renglo.auth.auth_controller import AuthController
from renglo.common import load_config
from renglo.data.data_controller import DataController


class BatchHandler:
    def __init__(self):
        config = load_config()
        self.DAC = DataController(config=config)
        self.AUC = AuthController(config=config)

    def run(self, payload):
        payload = payload or {}
        portfolio = str(payload.get("portfolio") or "").strip()
        org = str(payload.get("org") or "").strip()
        ring = str(payload.get("collection") or payload.get("ring") or "").strip()
        operations = payload.get("operations") or []
        if not portfolio or not org or not ring:
            return {
                "success": False,
                "action": "batch_handler",
                "message": "portfolio, org, and collection are required",
                "input": payload,
            }

        found = self.AUC.get_entity(
            "ring",
            portfolio_id=portfolio,
            org_id=org,
            ring_id=ring,
        )
        if not found or not found.get("success"):
            return {
                "success": False,
                "action": "batch_handler",
                "message": "Collection not found",
                "input": payload,
            }

        succeeded = []
        failed = []
        for index, operation in enumerate(operations):
            if not isinstance(operation, dict):
                failed.append({"index": index, "message": "Operation must be an object"})
                continue
            op = operation.get("op") or operation.get("action")
            try:
                doc_id, ok, message = self._apply(portfolio, org, ring, op, operation)
            except Exception as exc:
                failed.append({"index": index, "message": str(exc)})
                continue
            if ok:
                succeeded.append(doc_id)
            else:
                failed.append({"index": index, "id": doc_id, "message": message})
        return {
            "success": True,
            "action": "batch_handler",
            "input": payload,
            "output": {"succeeded": succeeded, "failed": failed},
        }

    def _apply(self, portfolio, org, ring, op, operation):
        fields = operation.get("data") or {}
        doc_id = operation.get("id")
        if op == "create":
            result, status = self.DAC.post_a_b(portfolio, org, ring, fields)
            item = (result or {}).get("item") or {}
            return item.get("_id"), _ok(result, status), _message(result)
        if op in ("update", "replace"):
            result, status = self.DAC.put_a_b_c(portfolio, org, ring, doc_id, fields)
            return doc_id, _ok(result, status), _message(result)
        if op == "upsert":
            existing = self.DAC.get_a_b_c(portfolio, org, ring, doc_id)
            missing = not isinstance(existing, dict) or existing.get("success") is False
            if missing:
                result, status = self.DAC.post_a_b(
                    portfolio, org, ring, fields, document_id=doc_id
                )
                item = (result or {}).get("item") or {}
                return item.get("_id") or doc_id, _ok(result, status), _message(result)
            result, status = self.DAC.put_a_b_c(portfolio, org, ring, doc_id, fields)
            return doc_id, _ok(result, status), _message(result)
        if op == "delete":
            result, status = self.DAC.delete_a_b_c(portfolio, org, ring, doc_id)
            return doc_id, _ok(result, status), _message(result)
        return None, False, "Unknown operation"


def _ok(result, status):
    return status < 400 and (not isinstance(result, dict) or result.get("success") is not False)


def _message(result):
    if isinstance(result, dict):
        return result.get("message") or "Operation failed"
    return "Operation failed"
