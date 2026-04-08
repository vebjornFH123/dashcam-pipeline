# Road Damage Detection Guide

## Overview

The dashcam pipeline supports **dual-model YOLO detection**:

1. **Primary model** (YOLOv8): Traffic objects — cars, trucks, pedestrians, bicycles, signs, etc.
2. **Road damage model** (RDD2022-trained): 4 road damage classes

## Supported Damage Classes

| Class | RDD2022 Code | Norwegian | Description |
|-------|-------------|-----------|-------------|
| `longitudinal_crack` | D00 | Lengdesprekk | Cracks along the road direction |
| `transverse_crack` | D10 | Tverrsprekk | Cracks across the road |
| `alligator_crack` | D20 | Nettsprekk | Network/fatigue cracking pattern |
| `pothole` | D40 | Hull i veidekke | Holes in the road surface |

## Usage

### Run the pipeline

```bash
python -m src.main \
  --input ./videos \
  --output ./output \
  --strategy full_scan
```

The model is auto-detected from `models/road_damage.pt`.

### Training

See `scripts/train_road_damage.py` for training on the RDD2022 dataset:

```bash
# Prepare dataset (one-time)
python scripts/train_road_damage.py \
  --prepare \
  --rdd-zip ~/datasets/RDD2022.zip \
  --countries Norway Japan Czech United_States

# Train
python scripts/train_road_damage.py \
  --model yolov8s.pt \
  --epochs 150 \
  --batch 16 \
  --device mps
```

## Output Format

When road damage is detected, each frame's detection result includes:

```json
{
  "frame": "frame_0001.jpg",
  "objects": [...],
  "road_damage": [
    {
      "class_name": "pothole",
      "confidence": 0.87,
      "category": "road_damage",
      "bbox": {"x1": 200, "y1": 400, "x2": 350, "y2": 500}
    }
  ],
  "damage_summary": {
    "damage_types": {"pothole": 1},
    "total_findings": 1,
    "max_confidence": 0.87
  }
}
```

## Severity Scoring

Road damage contributes up to 20 points to the severity score (out of 100):

| Class | Weight | Risk |
|-------|--------|------|
| Pothole | 9 | Highest |
| Alligator crack | 7 | High |
| Transverse crack | 5 | Medium |
| Longitudinal crack | 4 | Medium |

Multiple damage types in the same event trigger a compound multiplier.

## NVDB Integration

Damage detections are included in the NVDB export for integration with
Nasjonal vegdatabank (Norwegian road database).
