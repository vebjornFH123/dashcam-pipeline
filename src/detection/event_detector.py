"""Event detection using motion and scene-change detection."""

import logging
import subprocess
import json
import os
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


def detect_scene_changes(video_path: str, threshold: float = 0.3) -> List[dict]:
    """Detect scene changes in a video using ffprobe scene detection.
    
    Args:
        video_path: Path to the input video file.
        threshold: Scene change sensitivity (0.0 - 1.0). Lower = more sensitive.
    
    Returns:
        List of dicts with 'time' and 'score' keys.
    """
    logger.info(f"=== SCENESKIFTE-DETEKSJON ===")
    logger.info(f"  Video: {video_path}")
    logger.info(f"  Threshold: {threshold} (lavere = mer sensitiv)")
    cmd = [
        "ffprobe", "-v", "quiet",
        "-f", "lavfi",
        f"movie={video_path},select='gt(scene,{threshold})'",
        "-show_entries", "frame=pts_time,pkt_pts_time",
        "-print_format", "json"
    ]
    try:
        logger.info(f"  Kjører ffprobe scene filter...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        data = json.loads(result.stdout) if result.stdout.strip() else {"frames": []}
        scenes = []
        for frame in data.get("frames", []):
            t = float(frame.get("pts_time", frame.get("pkt_pts_time", 0)))
            scenes.append({"time": t})
            minutes = int(t // 60)
            seconds = t % 60
            logger.info(f"  >> Sceneskifte ved {minutes}m {seconds:.1f}s")
        if scenes:
            logger.info(f"  Resultat: {len(scenes)} sceneskifter funnet")
        else:
            logger.info(f"  Resultat: Ingen sceneskifter — prøver OpenCV bevegelsesdeteksjon")
        return scenes
    except Exception as e:
        logger.warning(f"  ffprobe feilet ({e}), faller tilbake til OpenCV")
        return detect_motion_opencv(video_path, threshold)


def detect_motion_opencv(video_path: str, threshold: float = 0.3) -> List[dict]:
    """Detect motion events using OpenCV frame differencing."""
    import cv2
    import numpy as np

    logger.info(f"=== BEVEGELSESDETEKSJON (OpenCV) ===")
    logger.info(f"  Video: {video_path}")
    logger.info(f"  Threshold: {threshold}")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    logger.info(f"  Video: {total_frames} frames, {fps:.1f} fps, {duration:.1f}s varighet")

    scenes = []
    prev_gray = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if prev_gray is not None:
            diff = cv2.absdiff(prev_gray, gray)
            score = float(np.mean(diff)) / 255.0
            if score > threshold:
                t = frame_idx / fps
                minutes = int(t // 60)
                seconds = t % 60
                logger.info(f"  >> Bevegelse ved {minutes}m {seconds:.1f}s (score: {score:.3f})")
                scenes.append({"time": t, "score": score})
        prev_gray = gray
        frame_idx += 1

        # Logg fremdrift for lange videoer
        if frame_idx % (int(fps) * 30) == 0:
            pct = (frame_idx / total_frames * 100) if total_frames > 0 else 0
            logger.info(f"  ... analysert {frame_idx}/{total_frames} frames ({pct:.0f}%)")

    cap.release()
    logger.info(f"  Rå deteksjoner: {len(scenes)} bevegelser over threshold")

    merged = merge_nearby_events(scenes, min_gap=2.0)
    logger.info(f"  Etter sammenslåing: {len(merged)} unike hendelser (min 2s mellom)")
    for i, e in enumerate(merged):
        t = e["time"]
        logger.info(f"    Hendelse {i+1}: {int(t//60)}m {t%60:.1f}s (score: {e.get('score', 0):.3f})")
    return merged


def merge_nearby_events(events: List[dict], min_gap: float = 2.0) -> List[dict]:
    """Merge events that are within min_gap seconds of each other."""
    if not events:
        return []
    merged = [events[0]]
    for e in events[1:]:
        if e["time"] - merged[-1]["time"] < min_gap:
            continue
        merged.append(e)
    return merged


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-print_format", "json",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def extract_event_clips(
    video_path: str,
    events: List[dict],
    output_dir: str,
    padding: float = 3.0,
    event_prefix: str = "event"
) -> List[dict]:
    """Extract video clips around detected events.
    
    Args:
        video_path: Source video path.
        events: List of event dicts with 'time' key.
        output_dir: Directory to save clips.
        padding: Seconds of padding before/after event.
        event_prefix: Prefix for event naming.
    
    Returns:
        List of event info dicts with id, clip_path, start_time, end_time.
    """
    os.makedirs(output_dir, exist_ok=True)
    duration = get_video_duration(video_path)
    event_infos = []

    for i, event in enumerate(events):
        event_id = f"{event_prefix}{i+1:03d}"
        start = max(0, event["time"] - padding)
        end = min(duration, event["time"] + padding)
        clip_path = os.path.join(output_dir, f"{event_id}.mp4")

        cmd = [
            "ffmpeg", "-y", "-ss", str(start), "-to", str(end),
            "-i", video_path, "-c", "copy", clip_path
        ]
        logger.info(f"Extracting {event_id}: {start:.1f}s - {end:.1f}s")
        try:
            subprocess.run(cmd, capture_output=True, timeout=120, check=True)
            event_infos.append({
                "event_id": event_id,
                "clip_path": clip_path,
                "start_time": start,
                "end_time": end,
                "source_video": video_path,
                "trigger_time": event["time"],
                "score": event.get("score", 0)
            })
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to extract {event_id}: {e}")

    return event_infos
