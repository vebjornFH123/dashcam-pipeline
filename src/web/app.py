"""FastAPI web application for reviewing dashcam events."""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.web.jobs import (
    create_job, get_job, list_jobs, run_worker,
    ALLOWED_EXTENSIONS,
)

# Configure logging so all modules output to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="Dashcam Analytics", version="2.0.0")

# CORS for development (Vite dev server on port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.environ.get("DASHCAM_OUTPUT_DIR", "./output")

# Path to the built React client
CLIENT_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "client", "dist")


def get_output_dir():
    return OUTPUT_DIR


# --- Startup: launch background worker ---

@app.on_event("startup")
async def startup_worker():
    os.makedirs(os.path.join(get_output_dir(), "uploads"), exist_ok=True)
    asyncio.create_task(run_worker(get_output_dir()))


# --- Upload & Jobs endpoints ---

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...), trackpoints: Optional[str] = None):
    """Upload a video file and start analysis. Optionally include GPS trackpoints."""
    filename = file.filename or "video.mp4"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"error": f"Ugyldig filformat: {ext}. Bruk: {', '.join(ALLOWED_EXTENSIONS)}"},
        )

    # Save to uploads dir
    uploads_dir = os.path.join(get_output_dir(), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    import uuid
    save_name = f"{uuid.uuid4().hex[:12]}{ext}"
    save_path = os.path.join(uploads_dir, save_name)

    with open(save_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            f.write(chunk)

    # Parse GPS trackpoints if provided (from camera recording)
    parsed_trackpoints = None
    if trackpoints:
        try:
            parsed_trackpoints = json.loads(trackpoints)
            logging.getLogger(__name__).info(
                f"Received {len(parsed_trackpoints)} GPS trackpoints with upload"
            )
        except (json.JSONDecodeError, TypeError):
            pass

    job = create_job(filename, save_path, trackpoints=parsed_trackpoints)
    return {"job_id": job.id, "status": job.status, "filename": filename}


@app.get("/api/jobs")
def api_list_jobs():
    """List all analysis jobs."""
    return {"jobs": [j.to_dict() for j in list_jobs()]}


@app.get("/api/jobs/{job_id}")
def api_get_job(job_id: str):
    """Get status of a specific job."""
    job = get_job(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    return job.to_dict()


@app.get("/api/jobs/{job_id}/stream")
async def api_job_stream(job_id: str):
    """SSE stream for live job status updates."""
    async def event_generator():
        while True:
            job = get_job(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            yield f"data: {json.dumps(job.to_dict())}\n\n"

            if job.status in ("complete", "error"):
                return

            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Existing event endpoints ---

@app.get("/api/events")
def list_events(
    severity: Optional[str] = Query(None, description="Filter by severity level"),
    object_type: Optional[str] = Query(None, description="Filter by object type"),
):
    """List all events with optional filtering."""
    summary_path = os.path.join(get_output_dir(), "summary.json")
    if not os.path.exists(summary_path):
        return {"total_events": 0, "events": []}

    with open(summary_path) as f:
        summary = json.load(f)

    events = summary.get("events", [])

    if severity and severity != "all":
        events = [e for e in events if e.get("severity_level") == severity]

    if object_type:
        events = [e for e in events if object_type in e.get("object_counts", {})]

    return {"total_events": len(events), "events": events}


@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    """Get detailed event data."""
    event_dir = os.path.join(get_output_dir(), "events", event_id)
    meta_path = os.path.join(event_dir, "metadata.json")

    if not os.path.exists(meta_path):
        return JSONResponse(status_code=404, content={"error": "Event not found"})

    with open(meta_path) as f:
        metadata = json.load(f)

    frames_dir = os.path.join(event_dir, "frames")
    annotated_dir = os.path.join(event_dir, "annotated")

    frames = sorted(os.listdir(frames_dir)) if os.path.isdir(frames_dir) else []
    annotated = sorted(os.listdir(annotated_dir)) if os.path.isdir(annotated_dir) else []

    return {
        "event_id": event_id,
        "metadata": metadata,
        "frames": frames,
        "annotated_frames": annotated,
    }


@app.get("/api/events/{event_id}/frames/{filename}")
def get_frame(event_id: str, filename: str):
    """Serve a frame image."""
    frame_path = os.path.join(get_output_dir(), "events", event_id, "frames", filename)
    if os.path.exists(frame_path):
        return FileResponse(frame_path, media_type="image/jpeg")
    return JSONResponse(status_code=404, content={"error": "Frame not found"})


@app.get("/api/events/{event_id}/annotated/{filename}")
def get_annotated_frame(event_id: str, filename: str):
    """Serve an annotated frame image."""
    frame_path = os.path.join(get_output_dir(), "events", event_id, "annotated", filename)
    if os.path.exists(frame_path):
        return FileResponse(frame_path, media_type="image/jpeg")
    return JSONResponse(status_code=404, content={"error": "Frame not found"})


@app.get("/api/geojson")
def get_geojson():
    """Get GeoJSON data for map display."""
    geojson_path = os.path.join(get_output_dir(), "events.geojson")
    if os.path.exists(geojson_path):
        with open(geojson_path) as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


# --- SPA serving (must be last) ---

@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    """Serve the React SPA. Falls back to index.html for client-side routing."""
    dist = os.path.abspath(CLIENT_DIST)

    file_path = os.path.join(dist, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)

    index_path = os.path.join(dist, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")

    template_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if os.path.isfile(template_path):
        with open(template_path) as f:
            return HTMLResponse(f.read())

    return HTMLResponse("<h1>Dashcam Analytics</h1><p>Build the React client first: cd client && npm run build</p>")


def start_server(output_dir: str, host: str = "0.0.0.0", port: int = 8000):
    """Start the web UI server."""
    global OUTPUT_DIR
    OUTPUT_DIR = output_dir
    import uvicorn
    uvicorn.run(app, host=host, port=port)
