export interface ObjectCounts {
  [key: string]: number
}

export interface GpsBounds {
  min_lat: number
  max_lat: number
  min_lon: number
  max_lon: number
}

export interface EventSummary {
  event_id: string
  start_time: string | null
  end_time: string | null
  source_video: string
  num_frames: number
  object_counts: ObjectCounts
  severity_score: number
  severity_level: 'low' | 'medium' | 'high' | 'critical'
  gps_bounds?: GpsBounds
}

export interface EventsResponse {
  total_events: number
  events: EventSummary[]
}

export interface Detection {
  frame: string
  objects: DetectedObject[]
  road_damage?: DetectedObject[]
  damage_summary?: Record<string, number>
}

export interface DetectedObject {
  class_name: string
  class_id: number
  confidence: number
  category?: string
  bbox: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
}

export interface FrameMetadata {
  frame: string
  frame_time_offset?: number
  timestamp?: string
  latitude?: number
  longitude?: number
  speed?: number
  heading?: number
  base_creation_time?: string
}

export interface SeverityInfo {
  severity_score: number
  severity_level: 'low' | 'medium' | 'high' | 'critical'
  factors: Record<string, number>
}

export interface EventDetail {
  event_id: string
  metadata: {
    event_id: string
    source_video: string
    start_time: string | null
    end_time: string | null
    trigger_time: string | null
    num_frames: number
    object_counts: ObjectCounts
    damage_counts?: ObjectCounts
    detections: Detection[]
    frame_metadata: FrameMetadata[]
    severity: SeverityInfo
    embedded_metadata: Record<string, unknown>
  }
  frames: string[]
  annotated_frames: string[]
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: 'Point' | 'LineString'
    coordinates: number[] | number[][]
  }
  properties: {
    event_id: string
    start_time: string | null
    end_time: string | null
    severity_score: number
    severity_level: string
    object_counts: ObjectCounts
    num_frames: number
  }
}

export interface GeoJSONCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export interface Job {
  id: string
  status: 'queued' | 'processing' | 'complete' | 'error'
  filename: string
  video_path: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
  events_count: number
  progress_message: string
}

export interface UploadResponse {
  job_id: string
  status: string
  filename: string
}

export interface JobsResponse {
  jobs: Job[]
}
