"""Frame extraction from video clips."""

import logging
import os
import subprocess
from typing import List

logger = logging.getLogger(__name__)


def extract_frames(
    video_path: str,
    output_dir: str,
    fps: float = 1.0,
    quality: int = 2
) -> List[str]:
    """Extract frames from a video at specified FPS.
    
    Args:
        video_path: Path to the video file.
        output_dir: Directory to save extracted frames.
        fps: Frames per second to extract.
        quality: JPEG quality (2=best, 31=worst for ffmpeg).
    
    Returns:
        List of paths to extracted frames.
    """
    os.makedirs(output_dir, exist_ok=True)
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")

    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", str(quality),
        output_pattern
    ]
    logger.info(f"Extracting frames from {video_path} at {fps} fps")
    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Frame extraction failed: {e}")
        return []

    frames = sorted([
        os.path.join(output_dir, f)
        for f in os.listdir(output_dir)
        if f.endswith(".jpg") and f.startswith("frame_")
    ])
    logger.info(f"Extracted {len(frames)} frames")
    return frames
