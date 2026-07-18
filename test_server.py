import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class StorageTests(unittest.TestCase):
    def test_round_trip_local_text_file(self):
        with tempfile.TemporaryDirectory() as directory:
            data_file = Path(directory) / "calendlys.txt"
            links = [{
                "id": "1",
                "name": "Elias Pfeffer",
                "url": "https://cal.com/eliaspfeffer",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
            }]
            with patch.object(server, "DATA_FILE", data_file):
                server.write_links(links)
                self.assertEqual(server.read_links(), links)
                payload = json.loads(data_file.read_text(encoding="utf-8"))
                self.assertEqual(payload["app"], "Calendlys")
                self.assertEqual(payload["links"][0]["name"], "Elias Pfeffer")

    def test_rejects_malformed_links(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server, "DATA_FILE", Path(directory) / "calendlys.txt"):
                with self.assertRaisesRegex(ValueError, "name and URL"):
                    server.write_links([{"name": "Missing URL"}])

    def test_rejects_non_list_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server, "DATA_FILE", Path(directory) / "calendlys.txt"):
                with self.assertRaisesRegex(ValueError, "must be a list"):
                    server.write_links({"name": "Not a list"})


if __name__ == "__main__":
    unittest.main()
