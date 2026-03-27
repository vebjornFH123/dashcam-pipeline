"""Tests for export module."""

import json
import os
import tempfile
import unittest
from src.export.exporter import generate_summary, generate_geojson, generate_nvdb_export


class TestExport(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.events = [
            {
                "event_id": "event001",
                "source_video": "test.mp4",
                "start_time": 10.0,
                "end_time": 16.0,
                "num_frames": 6,
                "object_counts": {"car": 3, "person": 1},
                "severity": {"severity_score": 45, "severity_level": "medium", "factors": {}},
                "frame_metadata": [
                    {"latitude": 59.9139, "longitude": 10.7522, "speed": 50},
                    {"latitude": 59.9140, "longitude": 10.7523, "speed": 48},
                ]
            }
        ]

    def test_summary(self):
        path = os.path.join(self.tmpdir, "summary.json")
        result = generate_summary(self.events, path)
        self.assertTrue(os.path.exists(path))
        self.assertEqual(result["total_events"], 1)
        self.assertEqual(result["events"][0]["event_id"], "event001")

    def test_geojson(self):
        path = os.path.join(self.tmpdir, "events.geojson")
        result = generate_geojson(self.events, path)
        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(len(result["features"]), 1)
        self.assertEqual(result["features"][0]["geometry"]["type"], "LineString")

    def test_nvdb(self):
        path = os.path.join(self.tmpdir, "nvdb_export.json")
        result = generate_nvdb_export(self.events, path)
        self.assertEqual(len(result["objects"]), 1)
        self.assertEqual(result["objects"][0]["attributes"]["severity_level"], "medium")


if __name__ == "__main__":
    unittest.main()
