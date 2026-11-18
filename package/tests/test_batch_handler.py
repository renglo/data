"""BatchHandler applies each operation through DataController."""
from __future__ import annotations

import unittest
from unittest.mock import patch


class _Auth:
    def get_entity(self, entity_type, **kwargs):
        if kwargs.get("ring_id") == "missing":
            return {"success": False, "message": "Entity not found", "status": 404}
        return {"success": True, "document": {"_id": kwargs["ring_id"]}, "status": 200}


class _Data:
    def __init__(self):
        self.docs = {}
        self.seq = 0

    def post_a_b(self, portfolio, org, ring, payload, document_id=None):
        self.seq += 1
        doc_id = document_id or f"id-{self.seq}"
        self.docs[(ring, doc_id)] = dict(payload)
        return {"success": True, "item": {"_id": doc_id}}, 200

    def get_a_b_c(self, portfolio, org, ring, doc_id):
        if (ring, doc_id) not in self.docs:
            return {"success": False, "message": "Item could not be retrieved"}
        return {"_id": doc_id, **self.docs[(ring, doc_id)]}

    def put_a_b_c(self, portfolio, org, ring, doc_id, payload):
        if (ring, doc_id) not in self.docs:
            return {"success": False, "message": "Item could not be saved"}, 400
        self.docs[(ring, doc_id)].update(payload)
        return {"success": True}, 200

    def delete_a_b_c(self, portfolio, org, ring, doc_id):
        if (ring, doc_id) not in self.docs:
            return {"success": False, "message": "Item could not be deleted"}, 400
        self.docs.pop((ring, doc_id), None)
        return {"success": True}, 200


class BatchHandlerTests(unittest.TestCase):
    def _handler(self, data):
        from data.handlers.batch_handler import BatchHandler

        with patch("data.handlers.batch_handler.load_config", return_value={}), \
                patch("data.handlers.batch_handler.DataController", return_value=data), \
                patch("data.handlers.batch_handler.AuthController", return_value=_Auth()):
            return BatchHandler()

    def test_a_failed_operation_keeps_earlier_successes(self):
        data = _Data()
        handler = self._handler(data)
        result = handler.run({
            "portfolio": "portfolio",
            "org": "org",
            "collection": "projects",
            "operations": [
                {"op": "create", "data": {"status": "one"}},
                {"op": "delete", "id": "missing"},
                {"op": "create", "data": {"status": "three"}},
            ],
        })
        self.assertTrue(result["success"])
        self.assertEqual(result["output"]["succeeded"], ["id-1", "id-2"])
        self.assertEqual(len(result["output"]["failed"]), 1)
        self.assertIn(("projects", "id-1"), data.docs)
        self.assertIn(("projects", "id-2"), data.docs)

    def test_a_missing_collection_does_not_write(self):
        data = _Data()
        handler = self._handler(data)
        result = handler.run({
            "portfolio": "portfolio",
            "org": "org",
            "collection": "missing",
            "operations": [{"op": "create", "data": {"status": "one"}}],
        })
        self.assertFalse(result["success"])
        self.assertEqual(data.docs, {})


if __name__ == "__main__":
    unittest.main()
