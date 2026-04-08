"""Unified video analysis pipeline.

Provides a single `analyze_video()` function used by both CLI and web.
Two strategies:
  - "full_scan": Extract all frames → YOLO on all → group detections into events
  - "event_detection": Scene/motion detection → extract clips → YOLO on clips
"""

import json
import logging
import os
import shutil
from typing import Callable, Optional

logger = logging.getLogger(__name__)


def _normalize_trackpoints(trackpoints: list) -> list:
    """Normalize trackpoints from browser Geolocation API to pipeline format.

    Browser sends: {latitude, longitude, speed, heading, accuracy, timestamp, elapsed_seconds}
    Pipeline expects: {lat, lon, speed, heading, time}
    """
    normalized = []
    for tp in trackpoints:
        norm = {}
        # lat/lon — accept both formats
        norm["lat"] = tp.get("lat") or tp.get("latitude")
        norm["lon"] = tp.get("lon") or tp.get("longitude")
        if norm["lat"] is None or norm["lon"] is None:
            continue
        if "speed" in tp and tp["speed"] is not None:
            # Browser gives m/s, convert to km/h
            norm["speed"] = round(tp["speed"] * 3.6, 1) if isinstance(tp["speed"], (int, float)) else 0
        if "heading" in tp and tp["heading"] is not None:
            norm["heading"] = tp["heading"]
        if "timestamp" in tp:
            norm["time"] = tp["timestamp"]
        if "elapsed_seconds" in tp:
            norm["elapsed_seconds"] = tp["elapsed_seconds"]
        normalized.append(norm)
    return normalized


def analyze_video(
    video_path: str,
    output_dir: str,
    strategy: str = "full_scan",
    fps: float = 1.0,
    threshold: float = 0.3,
    yolo_model: str = "models/road_damage.pt",
    road_damage_confidence: float = 0.30,
    trackpoints: Optional[list] = None,
    use_ocr: bool = False,
    event_counter_start: int = 0,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> list:
    """Analyze a video and produce event data.

    Args:
        video_path: Path to input video.
        output_dir: Base output directory.
        strategy: "full_scan" or "event_detection".
        fps: Frames per second to extract.
        threshold: Detection sensitivity (0.0-1.0).
        yolo_model: Road damage YOLO model path.
        road_damage_confidence: Confidence threshold for road damage.
        trackpoints: Optional GPS trackpoints.
        use_ocr: Enable OCR metadata extraction.
        event_counter_start: Starting event number.
        progress_callback: Optional function(message) for progress updates.

    Returns:
        List of processed event dicts.
    """
    # Normalize trackpoints (browser Geolocation → pipeline format)
    if trackpoints:
        trackpoints = _normalize_trackpoints(trackpoints)
        logger.info(f"Using {len(trackpoints)} GPS trackpoints for analysis")

    def progress(msg: str):
        logger.info(msg)
        if progress_callback:
            progress_callback(msg)

    if strategy == "full_scan":
        return _analyze_full_scan(
            video_path, output_dir, fps, yolo_model,
            road_damage_confidence,
            trackpoints, use_ocr, event_counter_start, progress,
        )
    elif strategy == "event_detection":
        return _analyze_event_detection(
            video_path, output_dir, fps, threshold, yolo_model,
            road_damage_confidence,
            trackpoints, use_ocr, event_counter_start, progress,
        )
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


def _analyze_full_scan(
    video_path, output_dir, fps, yolo_model,
    road_damage_confidence,
    trackpoints, use_ocr, event_counter_start, progress,
):
    """Strategy: Analyze entire video frame by frame, group detections into events."""
    from src.extraction.frame_extractor import extract_frames
    from src.yolo.detector import YOLODetector, aggregate_object_counts, aggregate_damage_counts
    from src.metadata.extractor import extract_embedded_metadata, build_frame_metadata
    from src.exif.writer import write_exif_batch
    from src.scoring.severity import compute_severity
    from src.utils.helpers import ensure_dir

    # Step 1: Extract frames from entire video
    progress(f"Steg 1/5 — Ekstraherer frames fra hele videoen ({fps} fps)...")
    tmp_dir = ensure_dir(os.path.join(output_dir, "tmp_frames", os.path.basename(video_path)))
    all_frames = extract_frames(video_path, tmp_dir, fps=fps)

    if not all_frames:
        progress("Ingen frames kunne ekstraheres")
        return []

    progress(f"Steg 1/5 — {len(all_frames)} frames ekstrahert")

    # Step 2: YOLO on all frames
    progress(f"Steg 2/5 — Veiskade-deteksjon på {len(all_frames)} frames ({os.path.basename(yolo_model)})...")

    detector = YOLODetector(
        model_path=yolo_model,
        confidence=road_damage_confidence,
    )
    all_detections = detector.detect_frames(all_frames)

    total_objects = sum(len(d.get("objects", [])) for d in all_detections)
    total_damage = sum(len(d.get("road_damage", [])) for d in all_detections)
    frames_with_det = sum(
        1 for d in all_detections if d.get("objects") or d.get("road_damage")
    )

    progress(f"Steg 2/5 — {total_objects} objekter, {total_damage} veiskader, {frames_with_det}/{len(all_frames)} frames med funn")

    if frames_with_det == 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return []

    # Step 3: Group into events
    progress(f"Steg 3/5 — Grupperer {frames_with_det} frames til hendelser...")
    frame_dets = list(enumerate(all_detections))
    event_groups = _group_detections_to_events(frame_dets, fps=fps)
    progress(f"Steg 3/5 — {len(event_groups)} hendelser funnet")

    # Step 4: Metadata
    progress("Steg 4/5 — Henter metadata fra video...")
    embedded_meta = extract_embedded_metadata(video_path)

    # Step 5: Build events
    processed_events = []
    for idx, group in enumerate(event_groups):
        event_id = f"event{event_counter_start + idx + 1:03d}"
        event_dir = os.path.join(output_dir, "events", event_id)
        frames_dir = ensure_dir(os.path.join(event_dir, "frames"))
        annotated_dir = ensure_dir(os.path.join(event_dir, "annotated"))

        progress(f"Steg 5/5 — Bygger hendelse {event_id} ({idx+1}/{len(event_groups)})...")

        # Copy relevant frames
        event_frames = []
        for frame_idx, _det in group:
            src = all_frames[frame_idx]
            dst = os.path.join(frames_dir, os.path.basename(src))
            shutil.copy2(src, dst)
            event_frames.append(dst)

        # Re-run YOLO with annotations
        annotated_detections = detector.detect_frames(event_frames, annotated_dir=annotated_dir)
        object_counts = aggregate_object_counts(annotated_detections)
        damage_counts = aggregate_damage_counts(annotated_detections)

        # Build metadata
        start_sec = group[0][0] / fps
        end_sec = group[-1][0] / fps
        event_info = {
            "event_id": event_id,
            "clip_path": video_path,
            "start_time": start_sec,
            "end_time": end_sec,
            "trigger_time": start_sec,
            "source_video": video_path,
        }
        frame_meta = build_frame_metadata(
            event_info, event_frames,
            trackpoints=trackpoints,
            embedded_meta=embedded_meta,
            use_ocr=use_ocr,
        )
        write_exif_batch(event_frames, frame_meta)
        severity = compute_severity(annotated_detections, frame_meta)

        logger.info(f"{event_id}: severity={severity['severity_level']} ({severity['severity_score']}), "
                     f"{len(event_frames)} frames, {sum(object_counts.values())} objects, "
                     f"{sum(damage_counts.values()) if damage_counts else 0} damage")

        event_data = {
            "event_id": event_id,
            "source_video": video_path,
            "start_time": start_sec,
            "end_time": end_sec,
            "trigger_time": start_sec,
            "num_frames": len(event_frames),
            "object_counts": object_counts,
            "damage_counts": damage_counts,
            "detections": annotated_detections,
            "frame_metadata": frame_meta,
            "severity": severity,
            "embedded_metadata": embedded_meta,
        }

        meta_path = os.path.join(event_dir, "metadata.json")
        with open(meta_path, "w") as f:
            json.dump(event_data, f, indent=2, default=str)

        processed_events.append(event_data)

    # Cleanup
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return processed_events


def _analyze_event_detection(
    video_path, output_dir, fps, threshold, yolo_model,
    road_damage_confidence,
    trackpoints, use_ocr, event_counter_start, progress,
):
    """Strategy: Detect events via scene/motion changes, then analyze clips."""
    from src.detection.event_detector import detect_scene_changes, detect_motion_opencv, extract_event_clips
    from src.extraction.frame_extractor import extract_frames
    from src.yolo.detector import YOLODetector, aggregate_object_counts, aggregate_damage_counts
    from src.metadata.extractor import extract_embedded_metadata, build_frame_metadata
    from src.exif.writer import write_exif_batch
    from src.scoring.severity import compute_severity
    from src.utils.helpers import ensure_dir

    # Step 1: Detect events
    progress("Steg 1/7 — Detekterer hendelser (sceneskifte)...")
    events = detect_scene_changes(video_path, threshold)

    if not events:
        progress("Steg 1/7 — Detekterer hendelser (bevegelse)...")
        events = detect_motion_opencv(video_path, threshold)

    if not events:
        progress("Ingen hendelser detektert i videoen")
        return []

    progress(f"Steg 1/7 — {len(events)} hendelser detektert")

    # Step 2: Extract clips
    progress(f"Steg 2/7 — Klipper ut {len(events)} hendelser...")
    clips_dir = os.path.join(output_dir, "clips")
    event_infos = extract_event_clips(video_path, events, clips_dir)
    for i, ei in enumerate(event_infos):
        ei["event_id"] = f"event{event_counter_start + i + 1:03d}"

    # Step 3: Metadata
    progress("Steg 3/7 — Henter metadata fra video...")
    embedded_meta = extract_embedded_metadata(video_path)

    # Step 4: YOLO
    progress("Steg 4/7 — Laster YOLO-modell...")
    detector = YOLODetector(
        model_path=yolo_model,
        confidence=road_damage_confidence,
    )

    # Steps 5-7: Process each event
    processed_events = []
    for idx, ei in enumerate(event_infos):
        event_id = ei["event_id"]
        event_dir = os.path.join(output_dir, "events", event_id)
        frames_dir = ensure_dir(os.path.join(event_dir, "frames"))
        annotated_dir = ensure_dir(os.path.join(event_dir, "annotated"))

        progress(f"Steg 5/7 — Ekstraher frames for {event_id} ({idx+1}/{len(event_infos)})...")
        frames = extract_frames(ei["clip_path"], frames_dir, fps=fps)
        if not frames:
            continue

        progress(f"Steg 6/7 — YOLO-deteksjon på {event_id} ({len(frames)} frames)...")
        detections = detector.detect_frames(frames, annotated_dir=annotated_dir)
        object_counts = aggregate_object_counts(detections)
        damage_counts = aggregate_damage_counts(detections)

        progress(f"Steg 7/7 — Metadata & scoring for {event_id}...")
        frame_meta = build_frame_metadata(
            ei, frames,
            trackpoints=trackpoints,
            embedded_meta=embedded_meta,
            use_ocr=use_ocr,
        )
        write_exif_batch(frames, frame_meta)
        severity = compute_severity(detections, frame_meta)

        logger.info(f"{event_id}: severity={severity['severity_level']} ({severity['severity_score']})")

        event_data = {
            "event_id": event_id,
            "source_video": video_path,
            "start_time": ei["start_time"],
            "end_time": ei["end_time"],
            "trigger_time": ei["trigger_time"],
            "num_frames": len(frames),
            "object_counts": object_counts,
            "damage_counts": damage_counts,
            "detections": detections,
            "frame_metadata": frame_meta,
            "severity": severity,
            "embedded_metadata": embedded_meta,
        }

        meta_path = os.path.join(event_dir, "metadata.json")
        with open(meta_path, "w") as f:
            json.dump(event_data, f, indent=2, default=str)

        processed_events.append(event_data)

    return processed_events


def _group_detections_to_events(
    frame_detections: list,
    fps: float,
    gap_seconds: float = 5.0,
) -> list:
    """Group frames with detections into events.

    Frames within gap_seconds of each other belong to the same event.
    """
    active = [
        (idx, det) for idx, det in frame_detections
        if det.get("objects") or det.get("road_damage")
    ]

    if not active:
        return []

    groups = []
    current_group = [active[0]]

    for i in range(1, len(active)):
        prev_idx = current_group[-1][0]
        curr_idx = active[i][0]
        time_gap = (curr_idx - prev_idx) / fps if fps > 0 else 0

        if time_gap <= gap_seconds:
            current_group.append(active[i])
        else:
            groups.append(current_group)
            current_group = [active[i]]

    groups.append(current_group)
    return groups
