"""Tests for event detection module."""

import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from src.detection.event_detector import merge_nearby_events, detect_motion_opencv


class TestMergeEvents(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(merge_nearby_events([]), [])

    def test_no_merge(self):
        events = [{"time": 1.0}, {"time": 5.0}, {"time": 10.0}]
        result = merge_nearby_events(events, min_gap=2.0)
        self.assertEqual(len(result), 3)

    def test_merge_nearby(self):
        events = [{"time": 1.0}, {"time": 1.5}, {"time": 2.0}, {"time": 10.0}]
        result = merge_nearby_events(events, min_gap=2.0)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["time"], 1.0)
        self.assertEqual(result[1]["time"], 10.0)


if __name__ == "__main__":
    unittest.main()
