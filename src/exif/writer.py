"""EXIF metadata writing to JPG frames using ExifTool."""

import logging
import os
import subprocess
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


def write_exif(frame_path: str, metadata: Dict[str, Any]) -> bool:
    """Write EXIF metadata to a JPG file using exiftool.
    
    Args:
        frame_path: Path to the JPG frame.
        metadata: Dict with keys like latitude, longitude, speed, heading, timestamp.
    
    Returns:
        True if successful.
    """
    if not os.path.exists(frame_path):
        logger.warning(f"Frame not found: {frame_path}")
        return False

    args = ["exiftool", "-overwrite_original"]

    # DateTimeOriginal
    ts = metadata.get("timestamp") or metadata.get("base_creation_time")
    if ts:
        # Try to format properly
        args.append(f"-DateTimeOriginal={ts}")

    # GPS
    lat = metadata.get("latitude")
    lon = metadata.get("longitude")
    if lat is not None and lon is not None:
        lat_ref = "N" if lat >= 0 else "S"
        lon_ref = "E" if lon >= 0 else "W"
        args.extend([
            f"-GPSLatitude={abs(lat)}",
            f"-GPSLatitudeRef={lat_ref}",
            f"-GPSLongitude={abs(lon)}",
            f"-GPSLongitudeRef={lon_ref}",
        ])

    # Speed
    speed = metadata.get("speed")
    if speed is not None:
        args.extend([
            f"-GPSSpeed={speed}",
            "-GPSSpeedRef=K",  # km/h
        ])

    # Heading
    heading = metadata.get("heading")
    if heading is not None:
        args.extend([
            f"-GPSImgDirection={heading}",
            "-GPSImgDirectionRef=T",  # True north
        ])

    args.append(frame_path)

    if len(args) <= 3:
        logger.debug(f"No EXIF data to write for {frame_path}")
        return True

    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            logger.warning(f"exiftool warning for {frame_path}: {result.stderr}")
        return True
    except FileNotFoundError:
        logger.error("exiftool not found. Install with: apt install libimage-exiftool-perl")
        return False
    except Exception as e:
        logger.error(f"EXIF writing failed for {frame_path}: {e}")
        return False


def write_exif_batch(frames: List[str], metadata_list: List[Dict[str, Any]]) -> int:
    """Write EXIF data to multiple frames.
    
    Returns:
        Number of successfully processed frames.
    """
    success = 0
    for frame, meta in zip(frames, metadata_list):
        if write_exif(frame, meta):
            success += 1
    logger.info(f"EXIF written to {success}/{len(frames)} frames")
    return success
