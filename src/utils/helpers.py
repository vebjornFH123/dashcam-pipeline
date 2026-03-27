"""Utility functions."""

import logging
import os
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)


def setup_logging(level: str = "INFO"):
    """Configure logging for the pipeline."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def find_videos(input_path: str, extensions: tuple = (".mp4", ".avi", ".mkv", ".mov", ".webm")) -> List[str]:
    """Find video files in a directory or return single file."""
    p = Path(input_path)
    if p.is_file() and p.suffix.lower() in extensions:
        return [str(p)]
    elif p.is_dir():
        videos = []
        for ext in extensions:
            videos.extend(str(f) for f in p.glob(f"*{ext}"))
            videos.extend(str(f) for f in p.glob(f"*{ext.upper()}"))
        return sorted(set(videos))
    else:
        logger.warning(f"Input path not found or not a video: {input_path}")
        return []


def find_track_files(track_dir: str) -> List[str]:
    """Find GPX, NMEA, or CSV track files."""
    if not track_dir or not os.path.isdir(track_dir):
        return []
    extensions = (".gpx", ".nmea", ".csv")
    files = []
    for f in os.listdir(track_dir):
        if any(f.lower().endswith(ext) for ext in extensions):
            files.append(os.path.join(track_dir, f))
    return sorted(files)


def ensure_dir(path: str) -> str:
    """Create directory if it doesn't exist."""
    os.makedirs(path, exist_ok=True)
    return path
