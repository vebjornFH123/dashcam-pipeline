"""Metadata extraction: embedded MP4 metadata, OCR, GPX/NMEA/CSV parsing."""

import logging
import os
import json
import subprocess
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_embedded_metadata(video_path: str) -> Dict[str, Any]:
    """Extract metadata embedded in MP4 container via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        data = json.loads(result.stdout) if result.stdout.strip() else {}
        fmt = data.get("format", {})
        tags = fmt.get("tags", {})

        # Collect all tags from format AND streams (Apple MOV puts tags in streams)
        all_tags = dict(tags)
        for stream in data.get("streams", []):
            stream_tags = stream.get("tags", {})
            for k, v in stream_tags.items():
                if k not in all_tags:
                    all_tags[k] = v

        meta = {
            "duration": float(fmt.get("duration", 0)),
            "creation_time": (
                all_tags.get("creation_time")
                or all_tags.get("com.apple.quicktime.creationdate")
            ),
            "location": (
                all_tags.get("location")
                or all_tags.get("com.apple.quicktime.location.ISO6709")
            ),
        }

        # Parse location string — formats:
        # Standard MP4: "+59.9139+010.7522/"
        # Apple MOV ISO6709: "+59.9139+010.7522+042.000/"  (with altitude)
        loc = meta.get("location", "") or ""
        if loc:
            match = re.match(r'([+-][\d.]+)([+-][\d.]+)', loc)
            if match:
                meta["latitude"] = float(match.group(1))
                meta["longitude"] = float(match.group(2))
                logger.info(f"GPS extracted: lat={meta['latitude']}, lon={meta['longitude']}")

        # Log all available tags for debugging
        location_tags = {k: v for k, v in all_tags.items() if 'location' in k.lower() or 'gps' in k.lower()}
        if location_tags:
            logger.info(f"Location-related tags found: {location_tags}")
        elif not loc:
            logger.info("No GPS/location tags found in video metadata")

        logger.info(f"Embedded metadata: duration={meta['duration']:.1f}s, "
                     f"creation_time={meta.get('creation_time')}, "
                     f"has_gps={'latitude' in meta}")
        return meta
    except Exception as e:
        logger.warning(f"Failed to extract embedded metadata: {e}")
        return {}


def ocr_frame(frame_path: str, regions: Optional[List[dict]] = None) -> Dict[str, str]:
    """Extract text from frame using Tesseract OCR.
    
    Args:
        frame_path: Path to the frame image.
        regions: Optional list of dicts with x, y, w, h for crop regions.
    
    Returns:
        Dict with extracted text fields.
    """
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.warning("pytesseract or PIL not installed, skipping OCR")
        return {}

    try:
        img = Image.open(frame_path)
        results = {}

        if regions:
            for i, r in enumerate(regions):
                crop = img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
                text = pytesseract.image_to_string(crop).strip()
                results[f"region_{i}"] = text
        else:
            # Try bottom overlay region (common for dashcams)
            w, h = img.size
            bottom_crop = img.crop((0, int(h * 0.9), w, h))
            text = pytesseract.image_to_string(bottom_crop).strip()
            results["overlay"] = text

            # Try to parse timestamp
            ts = parse_timestamp_from_text(text)
            if ts:
                results["timestamp"] = ts

            # Try to parse speed
            speed = parse_speed_from_text(text)
            if speed is not None:
                results["speed"] = speed

        return results
    except Exception as e:
        logger.warning(f"OCR failed for {frame_path}: {e}")
        return {}


def parse_timestamp_from_text(text: str) -> Optional[str]:
    """Try to parse a timestamp from OCR text."""
    patterns = [
        r'(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}:\d{2})',
        r'(\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}:\d{2})',
        r'(\d{2}:\d{2}:\d{2})',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None


def parse_speed_from_text(text: str) -> Optional[float]:
    """Try to parse speed from OCR text."""
    m = re.search(r'(\d+\.?\d*)\s*(km/h|mph|kph)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


def parse_gpx(gpx_path: str) -> List[Dict[str, Any]]:
    """Parse GPX file into list of track points."""
    try:
        import xml.etree.ElementTree as ET
        tree = ET.parse(gpx_path)
        root = tree.getroot()
        ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
        
        # Try with namespace first, then without
        points = root.findall('.//gpx:trkpt', ns)
        if not points:
            points = root.findall('.//{http://www.topografix.com/GPX/1/1}trkpt')
        if not points:
            points = root.findall('.//trkpt')

        trackpoints = []
        for pt in points:
            tp = {
                "lat": float(pt.get("lat", 0)),
                "lon": float(pt.get("lon", 0)),
            }
            time_el = pt.find('gpx:time', ns) or pt.find('{http://www.topografix.com/GPX/1/1}time') or pt.find('time')
            if time_el is not None and time_el.text:
                tp["time"] = time_el.text

            ele_el = pt.find('gpx:ele', ns) or pt.find('{http://www.topografix.com/GPX/1/1}ele') or pt.find('ele')
            if ele_el is not None and ele_el.text:
                tp["elevation"] = float(ele_el.text)

            speed_el = pt.find('gpx:speed', ns) or pt.find('speed')
            if speed_el is not None and speed_el.text:
                tp["speed"] = float(speed_el.text)

            trackpoints.append(tp)
        
        logger.info(f"Parsed {len(trackpoints)} GPX trackpoints from {gpx_path}")
        return trackpoints
    except Exception as e:
        logger.warning(f"Failed to parse GPX {gpx_path}: {e}")
        return []


def parse_csv_track(csv_path: str) -> List[Dict[str, Any]]:
    """Parse CSV track file. Expected columns: time/timestamp, lat/latitude, lon/longitude, speed, heading."""
    import csv
    
    points = []
    try:
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                tp = {}
                for k in ('lat', 'latitude'):
                    if k in row:
                        tp['lat'] = float(row[k])
                for k in ('lon', 'longitude', 'lng'):
                    if k in row:
                        tp['lon'] = float(row[k])
                for k in ('time', 'timestamp', 'datetime'):
                    if k in row:
                        tp['time'] = row[k]
                for k in ('speed',):
                    if k in row and row[k]:
                        tp['speed'] = float(row[k])
                for k in ('heading', 'bearing', 'direction'):
                    if k in row and row[k]:
                        tp['heading'] = float(row[k])
                if 'lat' in tp and 'lon' in tp:
                    points.append(tp)
        logger.info(f"Parsed {len(points)} CSV trackpoints from {csv_path}")
    except Exception as e:
        logger.warning(f"Failed to parse CSV {csv_path}: {e}")
    return points


def interpolate_gps_for_frames(
    trackpoints: List[Dict],
    event_start: float,
    event_end: float,
    num_frames: int,
    video_start_time: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Interpolate GPS positions for frame timestamps.
    
    If trackpoints have time info, interpolate based on timestamp.
    Otherwise, distribute evenly across the track segment.
    """
    if not trackpoints or num_frames == 0:
        return [{}] * num_frames

    frame_interval = (event_end - event_start) / max(num_frames, 1)
    frame_metadata = []

    for i in range(num_frames):
        t = event_start + i * frame_interval
        frac = i / max(num_frames - 1, 1)
        idx = frac * (len(trackpoints) - 1)
        lo = int(idx)
        hi = min(lo + 1, len(trackpoints) - 1)
        alpha = idx - lo

        meta = {
            "frame_time_offset": round(t, 3),
        }

        if "lat" in trackpoints[lo] and "lat" in trackpoints[hi]:
            meta["latitude"] = round(
                trackpoints[lo]["lat"] * (1 - alpha) + trackpoints[hi]["lat"] * alpha, 7
            )
            meta["longitude"] = round(
                trackpoints[lo]["lon"] * (1 - alpha) + trackpoints[hi]["lon"] * alpha, 7
            )
        if "speed" in trackpoints[lo]:
            meta["speed"] = round(
                trackpoints[lo].get("speed", 0) * (1 - alpha) + trackpoints[hi].get("speed", 0) * alpha, 1
            )
        if "heading" in trackpoints[lo]:
            meta["heading"] = round(
                trackpoints[lo].get("heading", 0) * (1 - alpha) + trackpoints[hi].get("heading", 0) * alpha, 1
            )
        if "time" in trackpoints[lo]:
            meta["source_time"] = trackpoints[lo]["time"]

        frame_metadata.append(meta)

    return frame_metadata


def build_frame_metadata(
    event_info: Dict,
    frames: List[str],
    trackpoints: Optional[List[Dict]] = None,
    embedded_meta: Optional[Dict] = None,
    use_ocr: bool = False
) -> List[Dict[str, Any]]:
    """Build complete metadata for each frame with fallback logic.
    
    Priority: GPX > embedded metadata > OCR
    """
    num_frames = len(frames)
    start = event_info.get("start_time", 0)
    end = event_info.get("end_time", start + num_frames)

    # Start with GPS interpolation if available
    if trackpoints:
        frame_meta = interpolate_gps_for_frames(trackpoints, start, end, num_frames)
    else:
        frame_meta = [{"frame_time_offset": round(start + i * (end - start) / max(num_frames, 1), 3)}
                      for i in range(num_frames)]

    # Enrich with embedded metadata
    if embedded_meta:
        base_time = embedded_meta.get("creation_time")
        for i, meta in enumerate(frame_meta):
            if "latitude" not in meta and "latitude" in embedded_meta:
                meta["latitude"] = embedded_meta["latitude"]
                meta["longitude"] = embedded_meta["longitude"]
            if base_time:
                meta["base_creation_time"] = base_time

    # OCR fallback
    if use_ocr:
        for i, frame_path in enumerate(frames):
            if "latitude" not in frame_meta[i]:
                ocr_data = ocr_frame(frame_path)
                frame_meta[i].update({k: v for k, v in ocr_data.items() if v})

    # Add frame filename
    for i, frame_path in enumerate(frame_meta):
        frame_path["frame"] = os.path.basename(frames[i]) if i < len(frames) else None

    return frame_meta
