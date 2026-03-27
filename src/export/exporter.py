"""Export modules: summary.json, GeoJSON, NVDB-friendly JSON."""

import json
import logging
import os
from typing import Dict, List, Any

logger = logging.getLogger(__name__)


def generate_summary(events: List[Dict[str, Any]], output_path: str) -> Dict:
    """Generate global summary.json.
    
    Args:
        events: List of processed event dicts.
        output_path: Path to write summary.json.
    """
    summary = {
        "total_events": len(events),
        "events": []
    }

    for ev in events:
        frame_meta = ev.get("frame_metadata", [])
        lats = [m["latitude"] for m in frame_meta if "latitude" in m]
        lons = [m["longitude"] for m in frame_meta if "longitude" in m]

        event_summary = {
            "event_id": ev["event_id"],
            "start_time": ev.get("start_time"),
            "end_time": ev.get("end_time"),
            "source_video": os.path.basename(ev.get("source_video", "")),
            "num_frames": ev.get("num_frames", 0),
            "object_counts": ev.get("object_counts", {}),
            "severity_score": ev.get("severity", {}).get("severity_score", 0),
            "severity_level": ev.get("severity", {}).get("severity_level", "low"),
        }

        if lats and lons:
            event_summary["gps_bounds"] = {
                "min_lat": min(lats), "max_lat": max(lats),
                "min_lon": min(lons), "max_lon": max(lons),
            }

        summary["events"].append(event_summary)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Summary written to {output_path}")
    return summary


def generate_geojson(events: List[Dict[str, Any]], output_path: str) -> Dict:
    """Generate GeoJSON with events as features."""
    features = []

    for ev in events:
        frame_meta = ev.get("frame_metadata", [])
        coords = [
            [m["longitude"], m["latitude"]]
            for m in frame_meta
            if "latitude" in m and "longitude" in m
        ]

        if not coords:
            logger.debug(f"Skipping {ev.get('event_id', '?')} in GeoJSON — no GPS data")
            continue

        geometry = {
            "type": "LineString" if len(coords) > 1 else "Point",
            "coordinates": coords if len(coords) > 1 else coords[0],
        }

        feature = {
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "event_id": ev["event_id"],
                "start_time": ev.get("start_time"),
                "end_time": ev.get("end_time"),
                "severity_score": ev.get("severity", {}).get("severity_score", 0),
                "severity_level": ev.get("severity", {}).get("severity_level", "low"),
                "object_counts": ev.get("object_counts", {}),
                "num_frames": ev.get("num_frames", 0),
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson, f, indent=2)
    skipped = len(events) - len(features)
    if skipped > 0:
        logger.warning(f"GeoJSON: {skipped}/{len(events)} events skipped (no GPS data)")
    logger.info(f"GeoJSON written to {output_path} ({len(features)} features)")
    return geojson


def generate_trips_summary(trips: List[Dict[str, Any]], output_path: str) -> Dict:
    """Generate trips.json with all trip metadata."""
    summary = {
        "total_trips": len(trips),
        "trips": trips,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Trips summary written to {output_path} ({len(trips)} trips)")
    return summary


def generate_trips_geojson(trips: List[Dict[str, Any]], output_path: str) -> Dict:
    """Generate GeoJSON with one LineString per trip."""
    features = []

    for trip in trips:
        gps_track = trip.get("gps_track", [])
        if len(gps_track) < 2:
            continue

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": gps_track,
            },
            "properties": {
                "trip_id": trip["trip_id"],
                "filename": trip.get("filename", ""),
                "created_at": trip.get("created_at"),
                "completed_at": trip.get("completed_at"),
                "total_events": trip.get("total_events", 0),
                "worst_severity": trip.get("worst_severity", "low"),
                "event_ids": trip.get("event_ids", []),
            },
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson, f, indent=2)
    logger.info(f"Trips GeoJSON written to {output_path} ({len(features)} features)")
    return geojson


def generate_nvdb_export(events: List[Dict[str, Any]], output_path: str) -> Dict:
    """Generate NVDB-friendly export JSON."""
    nvdb_objects = []

    for ev in events:
        frame_meta = ev.get("frame_metadata", [])
        coords = [
            {"lat": m["latitude"], "lon": m["longitude"]}
            for m in frame_meta
            if "latitude" in m and "longitude" in m
        ]

        speeds = [m["speed"] for m in frame_meta if "speed" in m]

        nvdb_obj = {
            "event_id": ev["event_id"],
            "type": "dashcam_event",
            "position": {
                "type": "linestring" if len(coords) > 1 else "point",
                "coordinates": coords if coords else None,
            },
            "attributes": {
                "time_start": ev.get("start_time"),
                "time_end": ev.get("end_time"),
                "speed_avg": round(sum(speeds) / len(speeds), 1) if speeds else None,
                "speed_max": round(max(speeds), 1) if speeds else None,
                "objects_detected": ev.get("object_counts", {}),
                "severity_score": ev.get("severity", {}).get("severity_score", 0),
                "severity_level": ev.get("severity", {}).get("severity_level", "low"),
                "severity_factors": ev.get("severity", {}).get("factors", {}),
            },
            "road_reference": None,  # To be populated by NVDB mapping
            "source": {
                "video": os.path.basename(ev.get("source_video", "")),
                "num_frames": ev.get("num_frames", 0),
            }
        }
        nvdb_objects.append(nvdb_obj)

    nvdb_export = {
        "version": "1.0",
        "schema": "dashcam-nvdb-export",
        "description": "NVDB-compatible event export from dashcam analytics pipeline",
        "objects": nvdb_objects,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(nvdb_export, f, indent=2)
    logger.info(f"NVDB export written to {output_path}")
    return nvdb_export
