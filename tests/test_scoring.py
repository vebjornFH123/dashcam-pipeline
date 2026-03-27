"""Tests for severity scoring module."""

import unittest
from src.scoring.severity import compute_severity


class TestSeverity(unittest.TestCase):
    def test_empty_detections(self):
        result = compute_severity([])
        self.assertEqual(result["severity_score"], 0)
        self.assertEqual(result["severity_level"], "low")

    def test_high_severity(self):
        detections = [{
            "frame": "f1.jpg",
            "objects": [
                {"class_name": "person", "confidence": 0.9, "bbox": {"x1": 100, "y1": 100, "x2": 800, "y2": 900}},
                {"class_name": "person", "confidence": 0.85, "bbox": {"x1": 200, "y1": 200, "x2": 700, "y2": 800}},
                {"class_name": "bicycle", "confidence": 0.7, "bbox": {"x1": 50, "y1": 50, "x2": 400, "y2": 400}},
            ]
        }] * 5
        result = compute_severity(detections)
        self.assertGreater(result["severity_score"], 30)
        self.assertIn(result["severity_level"], ("medium", "high"))

    def test_low_severity(self):
        detections = [{
            "frame": "f1.jpg",
            "objects": [
                {"class_name": "car", "confidence": 0.5, "bbox": {"x1": 900, "y1": 500, "x2": 950, "y2": 530}},
            ]
        }]
        result = compute_severity(detections)
        self.assertLess(result["severity_score"], 35)


if __name__ == "__main__":
    unittest.main()
