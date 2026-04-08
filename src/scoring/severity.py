"""Event severity scoring engine.

Scores events based on traffic objects and RDD2022 road damage detections.
"""

import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Weights for traffic object types
OBJECT_RISK_WEIGHTS = {
    "person": 10,
    "bicycle": 8,
    "motorcycle": 7,
    "dog": 6,
    "cat": 5,
    "horse": 6,
    "cow": 6,
    "sheep": 4,
    "bear": 9,
    "car": 3,
    "truck": 4,
    "bus": 4,
    "traffic light": 2,
    "stop sign": 2,
}

# Weights for road damage types (RDD2022 classes)
DAMAGE_RISK_WEIGHTS = {
    "pothole": 9,               # D40 - hull i veidekke
    "alligator_crack": 7,       # D20 - nettsprekker
    "transverse_crack": 5,      # D10 - tverrsprekker
    "longitudinal_crack": 4,    # D00 - lengdesprekker
}


def compute_severity(
    detections: List[Dict[str, Any]],
    frame_metadata: List[Dict[str, Any]] = None,
    frame_width: int = 1920,
    frame_height: int = 1080,
) -> Dict[str, Any]:
    """Compute severity score for an event.
    
    Factors:
    1. Object risk: weighted by object type
    2. Proximity: large bounding boxes = close objects = higher risk
    3. Density: many objects in frame = higher risk
    4. Speed: higher speed = higher risk
    5. Road damage: weighted by damage type severity
    
    Returns:
        Dict with severity_score (0-100), severity_level, and factors.
    """
    if not detections:
        return {"severity_score": 0, "severity_level": "low", "factors": {}}

    # 1. Object risk score (traffic)
    object_score = 0
    total_objects = 0
    for det in detections:
        for obj in det.get("objects", []):
            cat = obj.get("category", "traffic")
            if cat == "traffic":
                weight = OBJECT_RISK_WEIGHTS.get(obj["class_name"], 1)
                conf = obj.get("confidence", 0.5)
                object_score += weight * conf
                total_objects += 1

    risk_component = min(object_score * 2, 35)

    # 2. Proximity score
    max_proximity = 0
    frame_area = frame_width * frame_height
    for det in detections:
        for obj in det.get("objects", []):
            bbox = obj.get("bbox", {})
            w = bbox.get("x2", 0) - bbox.get("x1", 0)
            h = bbox.get("y2", 0) - bbox.get("y1", 0)
            area_ratio = (w * h) / frame_area if frame_area > 0 else 0
            max_proximity = max(max_proximity, area_ratio)
    proximity_component = min(max_proximity * 100, 20)

    # 3. Density score
    max_objects_in_frame = 0
    for det in detections:
        max_objects_in_frame = max(max_objects_in_frame, len(det.get("objects", [])))
    density_component = min(max_objects_in_frame * 3, 15)

    # 4. Speed score
    speed_component = 0
    if frame_metadata:
        speeds = [m.get("speed", 0) for m in frame_metadata if m.get("speed")]
        if speeds:
            avg_speed = sum(speeds) / len(speeds)
            speed_component = min(avg_speed / 10, 10)

    # 5. Road damage score (NEW)
    damage_score = 0
    total_damage = 0
    damage_types_found = set()
    for det in detections:
        for obj in det.get("road_damage", []):
            cls = obj["class_name"]
            weight = DAMAGE_RISK_WEIGHTS.get(cls, 3)
            conf = obj.get("confidence", 0.5)
            damage_score += weight * conf
            total_damage += 1
            damage_types_found.add(cls)

    # Bonus for multiple damage types (compound deterioration)
    if len(damage_types_found) > 1:
        damage_score *= 1.0 + 0.1 * len(damage_types_found)

    damage_component = min(damage_score * 1.5, 20)

    total = (risk_component + proximity_component + density_component +
             speed_component + damage_component)
    score = min(round(total), 100)

    if score >= 80:
        level = "critical"
    elif score >= 55:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    factors = {
        "object_risk": round(risk_component, 1),
        "proximity": round(proximity_component, 1),
        "density": round(density_component, 1),
        "speed": round(speed_component, 1),
        "road_damage": round(damage_component, 1),
        "total_objects_detected": total_objects,
        "total_damage_findings": total_damage,
    }

    if damage_types_found:
        factors["damage_types_detected"] = sorted(damage_types_found)

    return {
        "severity_score": score,
        "severity_level": level,
        "factors": factors,
    }
