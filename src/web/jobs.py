"""Background job manager for video analysis."""

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def _find_road_damage_model() -> Optional[str]:
    """Find road damage model — env var, or auto-detect in models/ dir."""
    env_path = os.environ.get("DASHCAM_ROAD_DAMAGE_MODEL")
    if env_path and os.path.isfile(env_path):
        return env_path

    for candidate in [
        os.path.join(os.path.dirname(__file__), "..", "..", "models", "road_damage.pt"),
        "models/road_damage.pt",
    ]:
        abspath = os.path.abspath(candidate)
        if os.path.isfile(abspath):
            return abspath

    return None


@dataclass
class Job:
    id: str
    status: str  # queued | processing | complete | error
    filename: str
    video_path: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    events_count: int = 0
    progress_message: str = "I kø..."

    def to_dict(self):
        return asdict(self)


# In-memory store
_jobs: dict[str, Job] = {}
_job_trackpoints: dict[str, list] = {}  # job_id → GPS trackpoints
_job_queue: asyncio.Queue[str] = asyncio.Queue()


def create_job(filename: str, video_path: str, trackpoints: list | None = None) -> Job:
    """Create a new analysis job and enqueue it."""
    job = Job(
        id=uuid.uuid4().hex[:12],
        status="queued",
        filename=filename,
        video_path=video_path,
        created_at=datetime.now().isoformat(),
    )
    _jobs[job.id] = job
    if trackpoints:
        _job_trackpoints[job.id] = trackpoints
        logger.info(f"Job {job.id} created for {filename} with {len(trackpoints)} GPS trackpoints")
    else:
        logger.info(f"Job {job.id} created for {filename}")
    _job_queue.put_nowait(job.id)
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)


def list_jobs() -> list[Job]:
    return sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)


def _rebuild_exports(output_dir: str):
    """Rebuild summary.json and events.geojson from all events on disk."""
    from src.export.exporter import generate_summary, generate_geojson

    events_dir = os.path.join(output_dir, "events")
    if not os.path.isdir(events_dir):
        return

    all_events = []
    for event_id in sorted(os.listdir(events_dir)):
        meta_path = os.path.join(events_dir, event_id, "metadata.json")
        if os.path.isfile(meta_path):
            with open(meta_path) as f:
                all_events.append(json.load(f))

    if all_events:
        generate_summary(all_events, os.path.join(output_dir, "summary.json"))
        generate_geojson(all_events, os.path.join(output_dir, "events.geojson"))
        logger.info(f"Rebuilt exports with {len(all_events)} total events")


def _count_existing_events(output_dir: str) -> int:
    events_dir = os.path.join(output_dir, "events")
    if not os.path.isdir(events_dir):
        return 0
    return len([d for d in os.listdir(events_dir) if d.startswith("event")])


async def run_worker(output_dir: str):
    """Background worker that processes one job at a time using the shared pipeline."""
    from src.pipeline import analyze_video

    rd_model = _find_road_damage_model()
    if rd_model:
        logger.info(f"Road damage model: {rd_model}")
    else:
        logger.info("No road damage model found (set DASHCAM_ROAD_DAMAGE_MODEL or place models/road_damage.pt)")

    logger.info("Job worker started, waiting for jobs...")

    while True:
        job_id = await _job_queue.get()
        job = _jobs.get(job_id)
        if not job or job.status != "queued":
            continue

        job.status = "processing"
        job.started_at = datetime.now().isoformat()
        job.progress_message = f"Starter analyse av {job.filename}..."
        logger.info(f"[Job {job.id}] Processing: {job.filename}")
        start_time = datetime.now()

        try:
            event_counter = _count_existing_events(output_dir)

            def progress_cb(msg: str):
                job.progress_message = msg
                logger.info(f"[Job {job.id}] {msg}")

            # Get trackpoints if provided with upload
            trackpoints = _job_trackpoints.pop(job.id, None)
            if trackpoints:
                logger.info(f"[Job {job.id}] Using {len(trackpoints)} GPS trackpoints from recording")

            loop = asyncio.get_event_loop()
            events = await loop.run_in_executor(
                None,
                lambda: analyze_video(
                    video_path=job.video_path,
                    output_dir=output_dir,
                    strategy="full_scan",
                    fps=1.0,
                    yolo_model="yolov8n.pt",
                    road_damage_model=_find_road_damage_model(),
                    road_damage_confidence=0.30,
                    trackpoints=trackpoints,
                    event_counter_start=event_counter,
                    progress_callback=progress_cb,
                ),
            )

            elapsed = (datetime.now() - start_time).total_seconds()
            job.events_count = len(events)
            job.status = "complete"
            job.completed_at = datetime.now().isoformat()
            job.progress_message = f"Ferdig — {len(events)} hendelser funnet ({elapsed:.1f}s)"
            logger.info(f"[Job {job.id}] Complete: {len(events)} events in {elapsed:.1f}s")

            _rebuild_exports(output_dir)

        except Exception as e:
            job.status = "error"
            job.error = str(e)
            job.completed_at = datetime.now().isoformat()
            job.progress_message = f"Feil: {e}"
            logger.error(f"[Job {job.id}] Failed: {e}", exc_info=True)

        finally:
            try:
                if os.path.isfile(job.video_path):
                    os.remove(job.video_path)
                    logger.info(f"[Job {job.id}] Cleaned up: {job.video_path}")
            except OSError:
                pass
