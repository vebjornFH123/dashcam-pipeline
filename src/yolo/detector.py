"""YOLO object detection on extracted frames.

Supports dual-model detection:
  1. Standard model (e.g. YOLOv8n) for traffic objects (COCO classes)
  2. Road damage model for infrastructure defects (potholes, cracks, guardrails)

The road damage model can be any YOLO-compatible .pt trained on road damage data
(e.g. RDD2022, custom trained). Pass --road-damage-model to the CLI to enable.
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

# Extended infrastructure classes (custom model)
INFRASTRUCTURE_CLASSES = {
    "guardrail": "guardrail",               # rekkverk
    "guardrail_damage": "guardrail_damage", # skadet rekkverk
    "road_marking_worn": "road_marking_worn",
    "road_surface_damage": "road_surface_damage",
    "manhole_cover": "manhole_cover",       # kumlokk
    "road_sign_damage": "road_sign_damage",
    "barrier": "barrier",                   # betongrekkverk
    "drainage_issue": "drainage_issue",     # dreneringsproblem
    "edge_deterioration": "edge_deterioration",  # kantsladd
    # Road debris & litter (gjenstander og søppel)
    "road_debris": "road_debris",           # gjenstander i veibanen
    "tire": "tire",                         # dekk/bildekk
    "litter": "litter",                     # søppel
    "fallen_tree": "fallen_tree",           # veltet tre
    "rock": "rock",                         # stein
    "construction_material": "construction_material",  # byggemateriale
    "lost_cargo": "lost_cargo",             # tapt last
    "plastic_bag": "plastic_bag",           # plastpose
    "metal_object": "metal_object",         # metallobjekt
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
    # Road damage - red/magenta tones
    "longitudinal_crack": (0, 0, 200),
    "transverse_crack": (50, 0, 200),
    "alligator_crack": (100, 0, 200),
    "pothole": (0, 0, 255),
    # Infrastructure - purple/pink tones
    "guardrail": (200, 100, 0),
    "guardrail_damage": (200, 0, 200),
    "road_surface_damage": (0, 50, 255),
    "road_marking_worn": (0, 200, 200),
    "barrier": (200, 100, 50),
    "edge_deterioration": (100, 0, 150),
    # Road debris - yellow/orange tones
    "road_debris": (0, 200, 255),
    "tire": (0, 180, 220),
    "litter": (50, 220, 255),
    "fallen_tree": (0, 150, 100),
    "rock": (100, 100, 200),
    "construction_material": (0, 140, 255),
    "lost_cargo": (0, 100, 255),
    "plastic_bag": (150, 255, 100),
    "metal_object": (180, 180, 200),
}

# Category tags for detections
DAMAGE_CATEGORIES = {
    "longitudinal_crack": "road_damage",
    "transverse_crack": "road_damage",
    "alligator_crack": "road_damage",
    "pothole": "road_damage",
    "guardrail": "infrastructure",
    "guardrail_damage": "infrastructure_damage",
    "road_marking_worn": "road_damage",
    "road_surface_damage": "road_damage",
    "manhole_cover": "infrastructure",
    "road_sign_damage": "infrastructure_damage",
    "barrier": "infrastructure",
    "drainage_issue": "infrastructure",
    "edge_deterioration": "road_damage",
    "road_debris": "road_hazard",
    "tire": "road_hazard",
    "litter": "road_hazard",
    "fallen_tree": "road_hazard",
    "rock": "road_hazard",
    "construction_material": "road_hazard",
    "lost_cargo": "road_hazard",
    "plastic_bag": "road_hazard",
    "metal_object": "road_hazard",
}


class YOLODetector:
    """YOLO-based object detector for dashcam frames.
    
    Supports dual-model detection:
      - Primary model: Standard YOLO for traffic objects
      - Road damage model: Optional second model for road/infrastructure defects
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        confidence: float = 0.25,
        road_damage_model_path: Optional[str] = None,
        road_damage_confidence: float = 0.20,
    ):
        self.model_path = model_path
        self.confidence = confidence
        self.road_damage_model_path = road_damage_model_path
        self.road_damage_confidence = road_damage_confidence
        self._model = None
        self._road_damage_model = None
        self._seg_model = None

    @property
    def model(self):
        if self._model is None:
            try:
                from ultralytics import YOLO
                logger.info(f"Loading primary YOLO model: {self.model_path}")
                self._model = YOLO(self.model_path)
            except ImportError:
                logger.error("ultralytics not installed. Install with: pip install ultralytics")
                raise
        return self._model

    @property
    def road_damage_model(self):
        if self._road_damage_model is None and self.road_damage_model_path:
            try:
                from ultralytics import YOLO
                logger.info(f"Loading road damage model: {self.road_damage_model_path}")
                self._road_damage_model = YOLO(self.road_damage_model_path)
            except ImportError:
                logger.error("ultralytics not installed")
                raise
            except Exception as e:
                logger.error(f"Failed to load road damage model: {e}")
                self.road_damage_model_path = None  # Disable for subsequent calls
        return self._road_damage_model

    @property
    def seg_model(self):
        """Segmentation model for road surface detection."""
        if self._seg_model is None and self.road_damage_model_path:
            try:
                from ultralytics import YOLO
                logger.info("Loading segmentation model for road masking: yolov8n-seg.pt")
                self._seg_model = YOLO("yolov8n-seg.pt")
            except Exception as e:
                logger.warning(f"Could not load seg model, using Y-position filter: {e}")
        return self._seg_model

    def _build_road_mask(self, frame_path: str):
        """Build a road surface mask using YOLO segmentation.

        Returns a binary mask where road pixels = 255, or None if seg model unavailable.
        """
        import cv2
        import numpy as np

        seg = self.seg_model
        if seg is None:
            return None

        img = cv2.imread(frame_path)
        if img is None:
            return None
        h, w = img.shape[:2]

        results = seg(frame_path, conf=0.25, verbose=False)

        # Build object mask from all detected objects
        object_mask = np.zeros((h, w), dtype=np.uint8)
        for r in results:
            if r.masks is not None:
                for mask in r.masks.data:
                    m = mask.cpu().numpy()
                    m_resized = cv2.resize(m, (w, h))
                    object_mask[m_resized > 0.5] = 255

        # Road = lower 65% of frame minus objects (with padding)
        road_mask = np.zeros((h, w), dtype=np.uint8)
        road_mask[int(h * 0.35):, :] = 255

        # Expand objects slightly to exclude car edges etc.
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (30, 30))
        object_expanded = cv2.dilate(object_mask, kernel)
        road_mask[object_expanded > 0] = 0

        return road_mask

    def _is_on_road(self, bbox: dict, road_mask) -> bool:
        """Check if a detection bbox center falls on the road mask."""
        import numpy as np
        cx = int((bbox["x1"] + bbox["x2"]) / 2)
        cy = int((bbox["y1"] + bbox["y2"]) / 2)
        h, w = road_mask.shape
        if 0 <= cy < h and 0 <= cx < w:
            return road_mask[cy, cx] > 0
        return False

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
        """Run detection on a single frame (both models if available).
        
        Returns:
            Dict with 'objects' list and optional 'road_damage' list.
        """
        # Primary model
        traffic_detections, img_height = self._run_model(self.model, frame_path, self.confidence)

        # Tag traffic detections
        for d in traffic_detections:
            d["category"] = "traffic"

        # Road damage model (if configured)
        damage_detections = []
        if self.road_damage_model_path:
            rdm = self.road_damage_model
            if rdm is not None:
                raw, rd_height = self._run_model(rdm, frame_path, self.road_damage_confidence)
                for d in raw:
                    d["category"] = DAMAGE_CATEGORIES.get(d["class_name"], "road_damage")

                # Road mask filter: only keep damage on actual road surface
                road_mask = self._build_road_mask(frame_path)
                if road_mask is not None:
                    before = len(raw)
                    raw = [d for d in raw if self._is_on_road(d["bbox"], road_mask)]
                    if before != len(raw):
                        logger.debug(f"Road mask: {before} → {len(raw)} damage detections")
                else:
                    # Fallback: simple Y-position filter (lower 60%)
                    h = rd_height or img_height
                    if h > 0:
                        road_top = h * 0.40
                        raw = [
                            d for d in raw
                            if (d["bbox"]["y1"] + d["bbox"]["y2"]) / 2 > road_top
                        ]
                damage_detections = raw

        all_objects = traffic_detections + damage_detections

        result = {
            "frame": os.path.basename(frame_path),
            "objects": all_objects,
        }

        # Add damage summary if any damage detections found
        if damage_detections:
            result["road_damage"] = damage_detections
            result["damage_summary"] = _summarize_damage(damage_detections)

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
            thickness = 3 if category in ("road_damage", "infrastructure_damage", "road_hazard") else 2

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
