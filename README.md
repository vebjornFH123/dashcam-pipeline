# Dashcam Analytics Platform

En komplett plattform for analyse av dashcam-video med automatisk hendelsesdeteksjon, objektgjenkjenning og veiskade-analyse.

## YOLO Objektdeteksjon

Plattformen bruker YOLOv8 med støtte for dual-modell arkitektur for å detektere tre kategorier objekter:

### 🚗 Trafikkobjekter (Standard YOLO)

| Klasse | Norsk | Beskrivelse |
|--------|-------|-------------|
| `car` | Bil | Personbiler |
| `truck` | Lastebil | Lastebiler og vogntog |
| `bus` | Buss | Busser |
| `motorcycle` | Motorsykkel | Motorsykler |
| `bicycle` | Sykkel | Sykler |
| `person` | Fotgjenger | Gående personer |
| `traffic light` | Trafikklys | Trafikklys |
| `stop sign` | Stoppskilt | Stoppskilt |
| `fire hydrant` | Brannhydrant | Brannhydranter |
| `cat` | Katt | Katter i veibanen |
| `dog` | Hund | Hunder i veibanen |
| `horse` | Hest | Hester i/ved veibanen |
| `sheep` | Sau | Sau i/ved veibanen |
| `cow` | Ku | Ku/storfe i/ved veibanen |
| `bear` | Bjørn | Bjørn i/ved veibanen |
| `deer` | Hjort | Hjort/rådyr i/ved veibanen |
| `bird` | Fugl | Fugler i veibanen |

### 🔧 Veiskader og infrastruktur (Road Damage Model)

| Klasse | Norsk | Beskrivelse | Alvorlighet |
|--------|-------|-------------|-------------|
| `pothole` | Hull i veidekke | Hull og groper i veibanen | Høy (9/10) |
| `longitudinal_crack` | Langsgående sprekk | Sprekker langs kjøreretningen | Middels (5/10) |
| `transverse_crack` | Tversgående sprekk | Sprekker på tvers av kjøreretningen | Middels (5/10) |
| `alligator_crack` | Alligator-sprekk | Nettverksoppsprekking i asfalt | Høy (7/10) |
| `rutting` | Sporkjøring | Hjulspor og deformasjon i veibanen | Middels (6/10) |
| `guardrail_damage` | Rekkverk-skade | Skadet eller deformert rekkverk | Høy (8/10) |
| `road_marking_wear` | Slitt veimerking | Utslitt eller dårlig synlig veioppmerking | Lav (3/10) |

### ⚠️ Gjenstander og søppel (Road Hazards)

| Klasse | Norsk | Beskrivelse | Alvorlighet |
|--------|-------|-------------|-------------|
| `road_debris` | Veiavfall | Generelt avfall/rusk i veibanen | Høy (7/10) |
| `tire` | Dekk/dekkdeler | Dekkrester eller hele dekk i veibanen | Middels (6/10) |
| `litter` | Søppel | Mindre søppel i/ved veibanen | Lav (2/10) |
| `fallen_tree` | Veltet tre | Tre eller store greiner i veibanen | Svært høy (9/10) |
| `rock` | Stein/steinblokk | Stein eller steinras i veibanen | Høy (7/10) |
| `construction_material` | Byggemateriale | Materialer fra byggeplasser i veibanen | Høy (7/10) |
| `lost_cargo` | Tapt last | Gods som har falt av kjøretøy | Høy (8/10) |
| `plastic_bag` | Plastpose | Plastposer i/ved veibanen | Svært lav (1/10) |
| `metal_object` | Metallobjekt | Metalldeler eller gjenstander i veibanen | Middels (5/10) |

## Alvorlighetsberegning

Hver hendelse får en alvorlighetsscore (0–100) basert på:

| Komponent | Maks poeng | Beskrivelse |
|-----------|-----------|-------------|
| Trafikkobjekter | 40 | Antall og type objekter i nærheten |
| Hastighet | 20 | Høyere hastighet = høyere alvorlighet |
| Tidspunkt | 10 | Nattforhold gir økt alvorlighet |
| Proximity | 10 | Nærhet mellom detekterte objekter |
| Veiskade/gjenstander | 20 | Basert på type og alvorlighetsgrad |

## Funksjoner

- **Hendelsesdeteksjon** – Automatisk deteksjon via bevegelse og sceneskifte
- **Frame-ekstraksjon** – Konfigurerbar FPS (standard: 1 fps)
- **YOLO objektdeteksjon** – Dual-modell med trafikk + veiskade
- **Metadata** – Timestamp, GPS, hastighet, retning fra video/OCR/GPX
- **EXIF-skriving** – GPS og tidsstempel i alle JPG-filer
- **Eksport** – GeoJSON, NVDB-kompatibel JSON, summary.json
- **Web Dashboard** – React-basert UI med demomodus

## Installasjon

```bash
pip install -r requirements.txt
```

## Bruk

```bash
# Grunnleggende kjøring
dashcam-pipeline --input ./videos --output ./output

# Med veiskademodell og GPX
dashcam-pipeline \
  --input ./videos \
  --gpx ./tracks \
  --fps 1 \
  --threshold 0.2 \
  --yolo-model yolov8n.pt \
  --road-damage-model road_damage.pt \
  --road-damage-confidence 0.3 \
  --output ./output \
  --run-web-ui
```

## Utdata

```
/output/
  /events/
    /event001/
      frames/          # Rå frames (JPG med EXIF)
      annotated/       # Frames med bounding boxes
      metadata.json    # Deteksjoner, GPS, tidsstempel
    /event002/
      ...
  summary.json         # Oversikt over alle hendelser
  events.geojson       # GeoJSON for kartvisning
  nvdb_export.json     # NVDB-kompatibelt format
```
