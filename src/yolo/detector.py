"""YOLO object detection on extracted frames.

Supports dual-model detection:
  1. Standard model (e.g. YOLOv8n) for traffic objects (COCO classes)
  2. Road damage model (RDD2022) for 4 damage classes:
     longitudinal_crack, transverse_crack, alligator_crack, pothole
"""

import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Road-relevant COCO classes
ROAD_CLASSES = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
    5: "bus", 7: "truck", 9: "traffic light", 11: "stop sign",
    15: "cat", 16: "dog", 17: "horse", 18: "sheep", 19: "cow",
    20: "elephant", 21: "bear", 22: "zebra", 23: "giraffe",
}

# Standard road damage classes (RDD2022 convention)
ROAD_DAMAGE_CLASSES = {
    0: "longitudinal_crack",    # D00 - lengdesprekker
    1: "transverse_crack",      # D10 - tverrsprekker
    2: "alligator_crack",       # D20 - nettsprekker
    3: "pothole",               # D40 - hull i veidekke
}

# Colors for annotation (BGR for OpenCV)
ANNOTATION_COLORS = {
    # Traffic objects
    "person": (0, 0, 255),
    "bicycle": (0, 0, 255),
    "motorcycle": (0, 0, 255),
    "car": (255, 165, 0),
    "truck": (255, 165, 0),
    "bus": (255, 165, 0),
    "traffic light": (0, 255, 255),
    "stop sign": (0, 255, 255),
    # Road damage (RDD2022)
    "longitudinal_crack": (0, 0, 200),
    "transverse_crack": (50, 0, 200),
    "alligator_crack": (100, 0, 200),
    "pothole": (0, 0, 255),
}


class YOLODetector:
    """YOLO-based road damage detector for dashcam frames.

    Uses a single RDD2022-trained model to detect 4 damage classes:
    longitudinal_crack, transverse_crack, alligator_crack, pothole.
    """

    def __init__(
        self,
        model_path: str = "models/road_damage.pt",
        confidence: float = 0.25,
        **kwargs,
    ):
        self.model_path = model_path
        self.confidence = confidence
        self._model = None

    @property
    def model(self):
        if self._model is None:
            try:
                from ultralytics import YOLO
                logger.info(f"Loading road damage model: {self.model_path}")
                self._model = YOLO(self.model_path)
            except ImportError:
                logger.error("ultralytics not installed. Install with: pip install ultralytics")
                raise
        return self._model

    def _run_model(self, model, frame_path: str, confidence: float) -> tuple:
        """Run a YOLO model on a frame and return (detections, image_height)."""
        results = model(frame_path, conf=confidence, verbose=False)
        detections = []
        img_height = 0
        for r in results:
            if hasattr(r, 'orig_shape') and r.orig_shape is not None:
                img_height = r.orig_shape[0]
            boxes = r.boxes
            if boxes is None:
                continue
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                bbox = boxes.xyxy[i].tolist()
                cls_name = r.names.get(cls_id, f"class_{cls_id}")
                detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x1": round(bbox[0], 1),
                        "y1": round(bbox[1], 1),
                        "x2": round(bbox[2], 1),
                        "y2": round(bbox[3], 1),
                    }
                })
        return detections, img_height

    def detect_frame(self, frame_path: str) -> Dict[str, Any]:
        """Run road damage detection on a single frame.

        Returns:
            Dict with 'objects' list and 'road_damage' list.
        """
        detections, img_height = self._run_model(self.model, frame_path, self.confidence)

        for d in detections:
            d["category"] = "road_damage"

        result = {
            "frame": os.path.basename(frame_path),
            "objects": detections,
        }

        if detections:
            result["road_damage"] = detections
            result["damage_summary"] = _summarize_damage(detections)

        return result

    def detect_frames(
        self,
        frame_paths: List[str],
        annotated_dir: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Run detection on multiple frames.
        
        Args:
            frame_paths: List of frame image paths.
            annotated_dir: If set, save annotated frames with bounding boxes.
        
        Returns:
            List of detection result dicts.
        """
        if annotated_dir:
            os.makedirs(annotated_dir, exist_ok=True)

        all_detections = []
        for frame_path in frame_paths:
            try:
                det = self.detect_frame(frame_path)
                all_detections.append(det)

                if annotated_dir:
                    self._save_annotated(frame_path, det, annotated_dir)
            except Exception as e:
                logger.error(f"Detection failed for {frame_path}: {e}")
                all_detections.append({
                    "frame": os.path.basename(frame_path),
                    "objects": [],
                    "error": str(e),
                })

        # Log damage summary across all frames
        damage_count = sum(
            len(d.get("road_damage", [])) for d in all_detections
        )
        if damage_count > 0:
            logger.info(f"Detected {damage_count} road damage/infrastructure findings across {len(frame_paths)} frames")

        return all_detections

    def _save_annotated(self, frame_path: str, detection: Dict, output_dir: str):
        """Draw bounding boxes and save annotated frame."""
        import cv2

        img = cv2.imread(frame_path)
        if img is None:
            return

        for obj in detection["objects"]:
            bbox = obj["bbox"]
            x1, y1 = int(bbox["x1"]), int(bbox["y1"])
            x2, y2 = int(bbox["x2"]), int(bbox["y2"])
            cls_name = obj["class_name"]
            category = obj.get("category", "traffic")
            label = f"{cls_name} {obj['confidence']:.2f}"

            color = ANNOTATION_COLORS.get(cls_name, (0, 255, 0))
            thickness = 3 if category == "road_damage" else 2

            cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)

            # Add category prefix for damage detections
            if category != "traffic":
                label = f"[{category.upper()}] {label}"

            # Background for label
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(img, (x1, y1 - th - 10), (x1 + tw + 4, y1), color, -1)
            cv2.putText(img, label, (x1 + 2, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        out_path = os.path.join(output_dir, os.path.basename(frame_path))
        cv2.imwrite(out_path, img)


def _summarize_damage(damage_detections: list) -> Dict[str, Any]:
    """Summarize damage detections for an event frame."""
    types = {}
    max_confidence = 0
    for d in damage_detections:
        cls = d["class_name"]
        types[cls] = types.get(cls, 0) + 1
        max_confidence = max(max_confidence, d["confidence"])
    return {
        "damage_types": types,
        "total_findings": len(damage_detections),
        "max_confidence": round(max_confidence, 4),
    }


def aggregate_object_counts(detections: List[Dict]) -> Dict[str, int]:
    """Count total objects per class across all frames."""
    counts = {}
    for det in detections:
        for obj in det.get("objects", []):
            cls = obj["class_name"]
            counts[cls] = counts.get(cls, 0) + 1
    return counts


def aggregate_damage_counts(detections: List[Dict]) -> Dict[str, int]:
    """Count total road damage findings per type across all frames."""
    counts = {}
    for det in detections:
        for obj in det.get("road_damage", []):
            cls = obj["class_name"]
            counts[cls] = counts.get(cls, 0) + 1
    return counts
