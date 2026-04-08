#!/usr/bin/env python3
"""
Train a YOLOv8 road damage detection model using the RDD2022 dataset.

Usage:
    # Step 1: Download RDD2022 dataset first (see instructions below)
    # Step 2: Run this script
    python scripts/train_road_damage.py

    # Or with custom options:
    python scripts/train_road_damage.py --model yolov8s.pt --epochs 150 --imgsz 640

Prerequisites:
    pip install ultralytics

Dataset download:
    The RDD2022 dataset can be downloaded from:
    https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547

    After downloading, extract and run the prepare step:
    python scripts/train_road_damage.py --prepare --rdd-zip /path/to/RDD2022.zip
"""

import argparse
import os
import sys
import shutil
import glob
import xml.etree.ElementTree as ET
from pathlib import Path


# RDD2022 class mapping: PascalVOC label -> YOLO class index
RDD_CLASSES = {
    "D00": 0,  # longitudinal_crack
    "D10": 1,  # transverse_crack
    "D20": 2,  # alligator_crack
    "D40": 3,  # pothole
}

CLASS_NAMES = {
    0: "longitudinal_crack",
    1: "transverse_crack",
    2: "alligator_crack",
    3: "pothole",
}


def convert_voc_to_yolo(xml_path: str, img_width: int, img_height: int) -> list:
    """Convert a PascalVOC XML annotation to YOLO format lines."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    yolo_lines = []
    for obj in root.findall("object"):
        label = obj.find("name").text.strip()
        if label not in RDD_CLASSES:
            continue

        class_id = RDD_CLASSES[label]
        bbox = obj.find("bndbox")
        xmin = float(bbox.find("xmin").text)
        ymin = float(bbox.find("ymin").text)
        xmax = float(bbox.find("xmax").text)
        ymax = float(bbox.find("ymax").text)

        # Convert to YOLO format (center_x, center_y, width, height) normalized
        x_center = (xmin + xmax) / 2.0 / img_width
        y_center = (ymin + ymax) / 2.0 / img_height
        w = (xmax - xmin) / img_width
        h = (ymax - ymin) / img_height

        # Clamp to [0, 1]
        x_center = max(0.0, min(1.0, x_center))
        y_center = max(0.0, min(1.0, y_center))
        w = max(0.0, min(1.0, w))
        h = max(0.0, min(1.0, h))

        yolo_lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}")

    return yolo_lines


def get_image_size(img_path: str) -> tuple:
    """Get image dimensions without heavy dependencies."""
    try:
        from PIL import Image
        with Image.open(img_path) as img:
            return img.size  # (width, height)
    except ImportError:
        # Fallback: try to read from XML
        return None


def prepare_dataset(rdd_zip_path: str, output_dir: str, countries: list = None):
    """
    Extract and convert RDD2022 dataset from PascalVOC to YOLO format.

    RDD2022 structure after extraction:
        RDD2022/country/train/images/*.jpg
        RDD2022/country/train/annotations/xmls/*.xml

    Output structure (YOLO format):
        output_dir/images/train/*.jpg
        output_dir/images/val/*.jpg
        output_dir/labels/train/*.txt
        output_dir/labels/val/*.txt
    """
    import zipfile
    import random

    if countries is None:
        # Use all countries, but Norway is most relevant for your use case
        countries = ["Norway", "Japan", "India", "Czech", "United_States", "China_Drone", "China_MotorBike"]

    print(f"Preparing RDD2022 dataset from: {rdd_zip_path}")
    print(f"Using countries: {countries}")
    print(f"Output directory: {output_dir}")

    # Extract zip
    extract_dir = Path(output_dir) / "_raw"
    if not extract_dir.exists():
        print("Extracting ZIP file...")
        with zipfile.ZipFile(rdd_zip_path, 'r') as zf:
            zf.extractall(extract_dir)
        print("Extraction complete.")

    # RDD2022 contains nested ZIPs per country — extract them if needed
    for candidate_root in [extract_dir / "RDD2022", extract_dir]:
        if not candidate_root.exists():
            continue
        for nested_zip in sorted(candidate_root.glob("*.zip")):
            country_name = nested_zip.stem
            country_dir = nested_zip.parent / country_name
            if not country_dir.exists():
                print(f"  Extracting nested ZIP: {nested_zip.name} ...")
                with zipfile.ZipFile(str(nested_zip), 'r') as zf:
                    zf.extractall(nested_zip.parent)

    # Find the RDD2022 root
    rdd_root = None
    for p in extract_dir.rglob("*"):
        if p.is_dir() and p.name in countries:
            rdd_root = p.parent
            break

    if not rdd_root:
        # Try common structures
        for candidate in [extract_dir / "RDD2022", extract_dir]:
            if any((candidate / c).exists() for c in countries):
                rdd_root = candidate
                break

    if not rdd_root:
        print(f"ERROR: Could not find country folders in extracted data.")
        print(f"Contents of {extract_dir}:")
        for p in sorted(extract_dir.iterdir()):
            print(f"  {p.name}")
        sys.exit(1)

    print(f"Found RDD2022 data at: {rdd_root}")

    # Create output dirs
    out = Path(output_dir)
    for split in ["train", "val"]:
        (out / "rdd2022_images" / split).mkdir(parents=True, exist_ok=True)
        (out / "rdd2022_labels" / split).mkdir(parents=True, exist_ok=True)

    # Collect all image-annotation pairs
    all_pairs = []

    for country in countries:
        country_dir = rdd_root / country / "train"
        if not country_dir.exists():
            print(f"  Skipping {country} (not found)")
            continue

        img_dir = country_dir / "images"
        xml_dir = country_dir / "annotations" / "xmls"

        if not img_dir.exists() or not xml_dir.exists():
            print(f"  Skipping {country} (missing images or annotations)")
            continue

        images = sorted(img_dir.glob("*.jpg"))
        print(f"  {country}: {len(images)} images")

        for img_path in images:
            xml_path = xml_dir / (img_path.stem + ".xml")
            if xml_path.exists():
                all_pairs.append((img_path, xml_path, country))

    print(f"\nTotal image-annotation pairs: {len(all_pairs)}")

    if not all_pairs:
        print("ERROR: No images found!")
        sys.exit(1)

    # Shuffle and split 85/15
    random.seed(42)
    random.shuffle(all_pairs)
    split_idx = int(len(all_pairs) * 0.85)
    train_pairs = all_pairs[:split_idx]
    val_pairs = all_pairs[split_idx:]

    print(f"Train: {len(train_pairs)}, Val: {len(val_pairs)}")

    # Convert and copy
    stats = {"train": {"images": 0, "annotations": 0, "empty": 0},
             "val": {"images": 0, "annotations": 0, "empty": 0}}
    class_counts = {v: 0 for v in CLASS_NAMES.values()}

    for split, pairs in [("train", train_pairs), ("val", val_pairs)]:
        for img_path, xml_path, country in pairs:
            # Unique filename to avoid collisions across countries
            new_name = f"{country}_{img_path.stem}"

            # Get image size
            size = get_image_size(str(img_path))
            if size is None:
                # Try reading from XML
                tree = ET.parse(str(xml_path))
                root = tree.getroot()
                size_el = root.find("size")
                if size_el is not None:
                    w = int(size_el.find("width").text)
                    h = int(size_el.find("height").text)
                    size = (w, h)
                else:
                    continue

            img_w, img_h = size

            # Convert annotations
            yolo_lines = convert_voc_to_yolo(str(xml_path), img_w, img_h)

            # Copy image
            dst_img = out / "rdd2022_images" / split / f"{new_name}.jpg"
            shutil.copy2(str(img_path), str(dst_img))

            # Write YOLO label
            dst_label = out / "rdd2022_labels" / split / f"{new_name}.txt"
            with open(dst_label, 'w') as f:
                f.write("\n".join(yolo_lines))

            stats[split]["images"] += 1
            if yolo_lines:
                stats[split]["annotations"] += len(yolo_lines)
                for line in yolo_lines:
                    cls_id = int(line.split()[0])
                    class_counts[CLASS_NAMES[cls_id]] += 1
            else:
                stats[split]["empty"] += 1

    # Write data.yaml
    yaml_path = out / "data.yaml"
    with open(yaml_path, 'w') as f:
        f.write(f"path: {out.resolve()}\n")
        f.write("train: rdd2022_images/train\n")
        f.write("val: rdd2022_images/val\n")
        f.write(f"\nnc: {len(CLASS_NAMES)}\n")
        f.write("names:\n")
        for idx, name in sorted(CLASS_NAMES.items()):
            f.write(f"  {idx}: {name}\n")

    print(f"\n--- Dataset prepared ---")
    print(f"Train: {stats['train']['images']} images, {stats['train']['annotations']} annotations")
    print(f"Val:   {stats['val']['images']} images, {stats['val']['annotations']} annotations")
    print(f"\nClass distribution:")
    for name, count in sorted(class_counts.items(), key=lambda x: -x[1]):
        print(f"  {name}: {count}")
    print(f"\ndata.yaml written to: {yaml_path}")
    print(f"\nNext step: run training with:")
    print(f"  python scripts/train_road_damage.py --data {yaml_path}")


def train(args):
    """Run YOLO training."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    data_yaml = args.data
    if not os.path.exists(data_yaml):
        print(f"ERROR: data.yaml not found at: {data_yaml}")
        print("Run with --prepare first to set up the dataset.")
        sys.exit(1)

    print(f"=" * 60)
    print(f"Training road damage detection model")
    print(f"=" * 60)
    print(f"  Base model:  {args.model}")
    print(f"  Dataset:     {data_yaml}")
    print(f"  Epochs:      {args.epochs}")
    print(f"  Image size:  {args.imgsz}")
    print(f"  Batch size:  {args.batch}")
    print(f"  Device:      {args.device}")
    print(f"=" * 60)

    # Load base model (transfer learning)
    model = YOLO(args.model)

    # Train
    results = model.train(
        data=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        patience=args.patience,
        save=True,
        save_period=10,       # checkpoint every 10 epochs
        plots=True,           # generate training plots
        augment=True,         # enable augmentation
        hsv_h=0.015,          # hue augmentation
        hsv_s=0.7,            # saturation augmentation
        hsv_v=0.4,            # value augmentation
        degrees=5.0,          # rotation (small, road images are orientation-sensitive)
        translate=0.1,        # translation
        scale=0.5,            # scale
        fliplr=0.5,           # horizontal flip
        flipud=0.0,           # no vertical flip (unnatural for dashcam)
        mosaic=1.0,           # mosaic augmentation
        mixup=0.1,            # light mixup
        project="runs/road_damage",
        name="train",
        exist_ok=True,
    )

    # Copy best weights to models/
    best_pt = Path("runs/road_damage/train/weights/best.pt")
    if best_pt.exists():
        dest = Path("models/road_damage.pt")
        shutil.copy2(str(best_pt), str(dest))
        print(f"\n{'=' * 60}")
        print(f"Training complete!")
        print(f"Best model copied to: {dest}")
        print(f"{'=' * 60}")

        # Run validation
        print("\nRunning validation...")
        model = YOLO(str(dest))
        val_results = model.val(data=data_yaml)
        print(f"\nValidation mAP50:    {val_results.box.map50:.3f}")
        print(f"Validation mAP50-95: {val_results.box.map:.3f}")
    else:
        print("WARNING: best.pt not found. Check training output above for errors.")

    return results


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 road damage model on RDD2022")

    # Dataset preparation
    parser.add_argument("--prepare", action="store_true",
                        help="Prepare dataset from RDD2022 ZIP (convert VOC→YOLO)")
    parser.add_argument("--rdd-zip", type=str,
                        help="Path to downloaded RDD2022.zip file")
    parser.add_argument("--dataset-dir", type=str, default="datasets",
                        help="Output directory for prepared dataset (default: datasets)")
    parser.add_argument("--countries", type=str, nargs="+",
                        default=["Norway", "Japan", "Czech", "United_States"],
                        help="Countries to include (default: Norway Japan Czech United_States)")

    # Training
    parser.add_argument("--data", type=str, default="datasets/data.yaml",
                        help="Path to data.yaml (default: datasets/data.yaml)")
    parser.add_argument("--model", type=str, default="yolov8s.pt",
                        help="Base model for transfer learning (default: yolov8s.pt)")
    parser.add_argument("--epochs", type=int, default=150,
                        help="Number of training epochs (default: 150)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Image size (default: 640)")
    parser.add_argument("--batch", type=int, default=16,
                        help="Batch size (default: 16, reduce if OOM)")
    parser.add_argument("--device", type=str, default="",
                        help="Device: '' for auto, 'cpu', '0' for GPU 0, 'mps' for Apple Silicon")
    parser.add_argument("--patience", type=int, default=30,
                        help="Early stopping patience (default: 30)")

    args = parser.parse_args()

    if args.prepare:
        if not args.rdd_zip:
            print("ERROR: --rdd-zip is required with --prepare")
            parser.print_help()
            sys.exit(1)
        prepare_dataset(args.rdd_zip, args.dataset_dir, args.countries)
    else:
        train(args)


if __name__ == "__main__":
    main()
