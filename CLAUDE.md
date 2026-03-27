# Dashcam Analytics Platform

## Architecture

```
src/
  pipeline.py          # Shared analysis logic (full_scan + event_detection strategies)
  main.py              # CLI entrypoint
  detection/           # Scene change + motion detection (ffprobe/OpenCV)
  extraction/          # Frame extraction (ffmpeg)
  yolo/                # YOLOv8 dual-model detection (traffic + road damage)
  metadata/            # GPS, OCR, GPX/CSV parsing, timestamp interpolation
  exif/                # EXIF writing (exiftool)
  scoring/             # Severity scoring engine (0-100, 4 levels)
  export/              # summary.json, events.geojson, nvdb_export.json
  web/
    app.py             # FastAPI server (API + SPA serving)
    jobs.py            # Background job manager (asyncio queue)

client/                # React 19 + Vite + TypeScript + Tailwind + shadcn/ui
  src/pages/           # Dashboard, EventList, EventDetail, MapView, NewAnalysis, Jobs
  src/hooks/           # useCamera (MediaRecorder), useJobStatus (SSE)
```

## Commands

### Backend
```bash
# Development
uvicorn src.web.app:app --reload --port 8000

# With road damage model
DASHCAM_ROAD_DAMAGE_MODEL=models/road_damage.pt uvicorn src.web.app:app --reload --port 8000

# CLI processing
python -m src.main --input ./videos --output ./output --strategy full_scan
```

### Frontend
```bash
cd client
npm run dev          # Vite dev server (port 5173, proxies /api to 8000)
npm run build        # Production build → client/dist/
npx tsc --noEmit     # Type check only
```

## Key Design Decisions

- **Two detection strategies**: `full_scan` (YOLO on every frame) vs `event_detection` (scene change first). Web uses full_scan, CLI defaults to event_detection.
- **Road damage detection**: Requires a separate YOLO model (`models/road_damage.pt`). Standard `yolov8n.pt` only detects COCO objects (cars, people, etc.).
- **Road surface masking**: Uses YOLOv8n-seg to detect objects → inverts mask → only keeps road damage detections on actual road surface.
- **PWA**: Installable on Android/iOS. Service worker caches static assets.
- **No database**: Jobs stored in-memory (lost on restart). Events stored as JSON files on disk.

## Dependencies

### System (install separately)
- ffmpeg + ffprobe
- exiftool (`brew install exiftool`)
- tesseract (optional, for OCR)

### Python
```bash
pip install -r requirements.txt
```

### Node
```bash
cd client && npm install
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DASHCAM_OUTPUT_DIR` | Output directory | `./output` |
| `DASHCAM_ROAD_DAMAGE_MODEL` | Path to road damage .pt model | Auto-detect `models/road_damage.pt` |
| `VITE_MAPBOX_TOKEN` | Mapbox GL token for map view | (required for map) |
