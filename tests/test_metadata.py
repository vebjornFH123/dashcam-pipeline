"""Tests for metadata extraction module."""

import unittest
from src.metadata.extractor import (
    parse_timestamp_from_text, parse_speed_from_text,
    interpolate_gps_for_frames
)


class TestMetadataParsing(unittest.TestCase):
    def test_parse_timestamp(self):
        self.assertIsNotNone(parse_timestamp_from_text("2024-01-15 14:30:22"))
        self.assertIsNotNone(parse_timestamp_from_text("12:30:45"))
        self.assertIsNone(parse_timestamp_from_text("no timestamp here"))

    def test_parse_speed(self):
        self.assertEqual(parse_speed_from_text("Speed: 65.5 km/h"), 65.5)
        self.assertEqual(parse_speed_from_text("30 mph"), 30.0)
        self.assertIsNone(parse_speed_from_text("no speed"))

    def test_interpolate_gps(self):
        trackpoints = [
            {"lat": 59.0, "lon": 10.0},
            {"lat": 60.0, "lon": 11.0},
        ]
        result = interpolate_gps_for_frames(trackpoints, 0, 5, 3)
        self.assertEqual(len(result), 3)
        self.assertAlmostEqual(result[0]["latitude"], 59.0)
        self.assertAlmostEqual(result[2]["latitude"], 60.0)

    def test_interpolate_empty(self):
        result = interpolate_gps_for_frames([], 0, 5, 3)
        self.assertEqual(len(result), 3)


if __name__ == "__main__":
    unittest.main()
