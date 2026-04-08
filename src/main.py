"""CLI entrypoint for the dashcam analytics pipeline."""

import argparse
import logging
import os
import sys

from src.utils.helpers import setup_logging, find_videos, find_track_files, ensure_dir
from src.metadata.extractor import parse_gpx, parse_csv_track
from src.export.exporter import generate_summary, generate_geojson, generate_nvdb_export
from src.pipeline import analyze_video

logger = logging.getLogger(__name__)


# Keep process_video for backwards compatibility (used by tests etc.)
def process_video(
    video_path: str,
    output_dir: str,
    threshold: float = 0.3,
    fps: float = 1.0,
    yolo_model: str = "models/road_damage.pt",
    trackpoints: list = None,
    use_ocr: bool = False,
    road_damage_confidence: float = 0.30,
    event_counter_start: int = 0,
    **kwargs,
) -> list:
    """Process a single video. Delegates to shared pipeline."""
    return analyze_video(
        video_path=video_path,
        output_dir=output_dir,
        strategy="event_detection",
        fps=fps,
        threshold=threshold,
        yolo_model=yolo_model,
        road_damage_confidence=road_damage_confidence,
        trackpoints=trackpoints,
        use_ocr=use_ocr,
        event_counter_start=event_counter_start,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Dashcam Analytics Pipeline — Road Damage Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  dashcam-pipeline --input ./videos --output ./output
  dashcam-pipeline --input video.mp4 --gpx ./tracks --fps 2 --threshold 0.15
  dashcam-pipeline --input ./videos --output ./output --run-web-ui
  dashcam-pipeline --input ./videos --strategy full_scan --output ./output
        """
    )
    parser.add_argument("--input", "-i", required=True, help="Input video file or directory")
    parser.add_argument("--output", "-o", default="./output", help="Output directory")
    parser.add_argument("--strategy", default="event_detection",
                        choices=["event_detection", "full_scan"],
                        help="Detection strategy (default: event_detection)")
    parser.add_argument("--gpx", help="Directory containing GPX/NMEA/CSV track files")
    parser.add_argument("--fps", type=float, default=1.0, help="Frames per second to extract")
    parser.add_argument("--threshold", type=float, default=0.3, help="Event detection sensitivity (0.0-1.0)")
    parser.add_argument("--yolo-model", default="models/road_damage.pt", help="Road damage YOLO model path")
    parser.add_argument("--ocr", action="store_true", help="Enable OCR for overlay text extraction")
    parser.add_argument("--road-damage-confidence", type=float, default=0.30,
                        help="Confidence threshold for road damage detection (default: 0.30)")
    parser.add_argument("--run-web-ui", action="store_true", help="Start web UI after processing")
    parser.add_argument("--web-port", type=int, default=8000, help="Web UI port")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])

    args = parser.parse_args()
    setup_logging(args.log_level)

    # Find videos
    videos = find_videos(args.input)
    if not videos:
        logger.error(f"No video files found in {args.input}")
        sys.exit(1)

    logger.info(f"Found {len(videos)} video(s) to process")

    # Load track data
    trackpoints = []
    if args.gpx:
        track_files = find_track_files(args.gpx)
        for tf in track_files:
            if tf.lower().endswith('.gpx'):
                trackpoints.extend(parse_gpx(tf))
            elif tf.lower().endswith('.csv'):
                trackpoints.extend(parse_csv_track(tf))
        logger.info(f"Loaded {len(trackpoints)} trackpoints from {len(track_files)} file(s)")

    # Process each video
    output_dir = args.output
    ensure_dir(output_dir)
    all_events = []
    event_counter = 0

    for video in videos:
        events = analyze_video(
            video_path=video,
            output_dir=output_dir,
            strategy=args.strategy,
            fps=args.fps,
            threshold=args.threshold,
            yolo_model=args.yolo_model,
            road_damage_confidence=args.road_damage_confidence,
            trackpoints=trackpoints if trackpoints else None,
            use_ocr=args.ocr,
            event_counter_start=event_counter,
        )
        all_events.extend(events)
        event_counter += len(events)

    if not all_events:
        logger.warning("No events were detected across all videos")
    else:
        generate_summary(all_events, os.path.join(output_dir, "summary.json"))
        generate_geojson(all_events, os.path.join(output_dir, "events.geojson"))
        generate_nvdb_export(all_events, os.path.join(output_dir, "nvdb_export.json"))
        logger.info(f"Pipeline complete. {len(all_events)} events processed. Output: {output_dir}")

    # Start web UI
    if args.run_web_ui:
        logger.info(f"Starting web UI on port {args.web_port}...")
        from src.web.app import start_server
        start_server(output_dir, port=args.web_port)


if __name__ == "__main__":
    main()
