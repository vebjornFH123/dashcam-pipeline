# Road Damage & Infrastructure Detection Guide

## Overview

The dashcam pipeline supports **dual-model YOLO detection**:

1. **Primary model** (standard YOLOv8): Traffic objects — cars, trucks, pedestrians, bicycles, signs, etc.
2. **Road damage model** (optional): Infrastructure defects — potholes, cracks, guardrail damage, etc.

## Supported Damage Classes

### Road Surface Damage
| Class | Norwegian | Description |
|-------|-----------|-------------|
| `longitudinal_crack` | Lengdesprekk | Cracks along the road direction (D00) |
| `transverse_crack` | Tverrsprekk | Cracks across the road (D10) |
| `alligator_crack` | Nettsprekk | Network/fatigue cracking pattern (D20) |
| `pothole` | Hull i veidekke | Holes in the road surface (D40) |
| `road_surface_damage` | Veidekke-skade | General surface deterioration |
| `road_marking_worn` | Slitt vegoppmerking | Worn road markings |
| `edge_deterioration` | Kantsladd | Road edge deterioration |

### Infrastructure
| Class | Norwegian | Description |
|-------|-----------|-------------|
| `guardrail` | Rekkverk | Guardrail present (no damage) |
| `guardrail_damage` | Skadet rekkverk | Damaged guardrail |
| `barrier` | Betongrekkverk | Concrete barrier |
| `road_sign_damage` | Skadet skilt | Damaged road sign |
| `manhole_cover` | Kumlokk | Manhole cover |
| `drainage_issue` | Dreneringsproblem | Drainage issues |

### Road Debris & Litter (Gjenstander og søppel)
| Class | Norwegian | Description |
|-------|-----------|-------------|
| `road_debris` | Gjenstand i veibanen | General road debris/obstacle |
| `tire` | Bildekk | Loose tire on road |
| `fallen_tree` | Veltet tre | Fallen tree blocking road |
| `rock` | Stein | Rock on road surface |
| `construction_material` | Byggemateriale | Construction materials left on road |
| `lost_cargo` | Tapt last | Lost cargo from vehicles |
| `metal_object` | Metallobjekt | Metal debris on road |
| `litter` | Søppel | General litter/trash |
| `plastic_bag` | Plastpose | Plastic bags on road |

## Usage

### With a pre-trained road damage model

```bash
python -m src.main \
  --input ./videos \
  --output ./output \
  --road-damage-model ./models/road_damage_yolov8.pt \
  --road-damage-confidence 0.20
```

### Training your own model

1. **Dataset**: Use [RDD2022](https://github.com/sekilab/RoadDamageDetector) or the
   [Kaggle Road Damage Dataset](https://www.kaggle.com/datasets) with Norwegian road imagery.

2. **Training with Ultralytics**:
```bash
yolo train model=yolov8n.pt data=road_damage.yaml epochs=100 imgsz=640
```

3. **Custom data.yaml example**:
```yaml
train: ./train/images
val: ./val/images
nc: 7
names:
  0: longitudinal_crack
  1: transverse_crack
  2: alligator_crack
  3: pothole
  4: guardrail
  5: guardrail_damage
  6: road_surface_damage
```

### Recommended models

| Model | Source | Classes |
|-------|--------|---------|
| RDD2022 YOLOv8 | [GitHub](https://github.com/sekilab/RoadDamageDetector) | D00, D10, D20, D40 |
| Custom Norwegian | Train on Statens vegvesen data | Full class set |
| CRDDC2022 winners | Challenge results | Road damage |

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

Event metadata includes `damage_counts`:
```json
{
  "object_counts": {"car": 5, "person": 2},
  "damage_counts": {"pothole": 3, "longitudinal_crack": 1}
}
```

## Severity Scoring

Road damage contributes up to 20 points to the severity score (out of 100):
- **Potholes**: weight 9 (highest)
- **Guardrail damage**: weight 8
- **Alligator cracks**: weight 7
- **Surface damage**: weight 7
- **Transverse cracks**: weight 5
- **Edge deterioration**: weight 5

Multiple damage types in the same event trigger a compound multiplier.

## NVDB Integration

Damage detections are included in the NVDB export for integration with
Nasjonal vegdatabank (Norwegian road database).
