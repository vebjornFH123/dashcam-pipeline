import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, ChevronLeft, ChevronRight, Play, Pause, Download,
  Camera, MapPin, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { formatTimestamp } from '@/lib/utils'
import type { EventDetail } from '@/types/events'

interface TripPanelProps {
  tripId: string
  onClose: () => void
}

export function TripPanel({ tripId, onClose }: TripPanelProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => api.getTrip(tripId),
  })

  const trip = data?.trip
  const events = data?.events ?? []

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden sm:flex absolute top-0 right-0 h-full w-96 z-20 flex-col bg-background/95 backdrop-blur-sm border-l shadow-xl">
        <PanelContent
          trip={trip}
          events={events}
          isLoading={isLoading}
          expandedEventId={expandedEventId}
          onExpandEvent={setExpandedEventId}
          onClose={onClose}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-20 max-h-[75vh] flex flex-col bg-background/95 backdrop-blur-sm border-t rounded-t-xl shadow-xl">
        <PanelContent
          trip={trip}
          events={events}
          isLoading={isLoading}
          expandedEventId={expandedEventId}
          onExpandEvent={setExpandedEventId}
          onClose={onClose}
        />
      </div>
    </>
  )
}

function PanelContent({ trip, events, isLoading, expandedEventId, onExpandEvent, onClose }: {
  trip: { trip_id: string; filename: string; created_at: string; completed_at: string | null; total_events: number; worst_severity: string; gps_track: number[][] } | undefined
  events: EventDetail[]
  isLoading: boolean
  expandedEventId: string | null
  onExpandEvent: (id: string | null) => void
  onClose: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h2 className="text-sm font-bold">Kjøretur</h2>
          <p className="text-xs text-muted-foreground">
            {formatTimestamp(trip?.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {trip && <SeverityBadge level={trip.worst_severity} />}
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Trip stats */}
      {trip && (
        <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b text-center shrink-0">
          <div>
            <div className="text-lg font-bold">{trip.total_events}</div>
            <div className="text-xs text-muted-foreground">Hendelser</div>
          </div>
          <div>
            <div className="text-lg font-bold">{trip.gps_track.length}</div>
            <div className="text-xs text-muted-foreground">GPS-punkter</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {trip.completed_at && trip.created_at
                ? Math.round((new Date(trip.completed_at).getTime() - new Date(trip.created_at).getTime()) / 1000) + 's'
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground">Varighet</div>
          </div>
        </div>
      )}

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Ingen hendelser registrert på denne turen.
          </div>
        ) : (
          <div className="divide-y">
            {events.map((event) => (
              <EventItem
                key={event.event_id}
                event={event}
                isExpanded={expandedEventId === event.event_id}
                onToggle={() => onExpandEvent(expandedEventId === event.event_id ? null : event.event_id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function EventItem({ event, isExpanded, onToggle }: {
  event: EventDetail
  isExpanded: boolean
  onToggle: () => void
}) {
  const { metadata } = event
  const objectList = Object.entries(metadata.object_counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')

  return (
    <div>
      {/* Compact event card */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{metadata.event_id}</span>
            <SeverityBadge level={metadata.severity.severity_level} />
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Camera className="h-3 w-3" /> {metadata.num_frames} frames
          </span>
          {objectList && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {objectList}
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <InlineFrameViewer event={event} />

          {/* Severity info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Score</span>
              <span className="ml-2 font-bold">{metadata.severity.severity_score}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Start</span>
              <span className="ml-2">{formatTimestamp(metadata.start_time)}</span>
            </div>
          </div>

          {/* Detections */}
          {Object.keys(metadata.object_counts).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(metadata.object_counts).map(([cls, count]) => (
                <Badge key={cls} variant="secondary" className="text-xs">
                  {cls}: {count}
                </Badge>
              ))}
            </div>
          )}

          {metadata.damage_counts && Object.keys(metadata.damage_counts).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(metadata.damage_counts).map(([cls, count]) => (
                <Badge key={cls} variant="destructive" className="text-xs">
                  {cls}: {count}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InlineFrameViewer({ event }: { event: EventDetail }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [showAnnotated, setShowAnnotated] = useState(true)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentFrames = showAnnotated && event.annotated_frames.length > 0
    ? event.annotated_frames
    : event.frames

  useEffect(() => {
    if (playing && currentFrames.length > 0) {
      intervalRef.current = setInterval(() => {
        setFrameIndex((i) => {
          if (i >= currentFrames.length - 1) {
            setPlaying(false)
            return i
          }
          return i + 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, currentFrames.length])

  const handleDownload = useCallback(() => {
    if (!currentFrames[frameIndex]) return
    const url = showAnnotated && event.annotated_frames.length
      ? api.getAnnotatedFrameUrl(event.event_id, currentFrames[frameIndex])
      : api.getFrameUrl(event.event_id, currentFrames[frameIndex])
    const a = document.createElement('a')
    a.href = url
    a.download = currentFrames[frameIndex]
    a.click()
  }, [event, frameIndex, currentFrames, showAnnotated])

  if (currentFrames.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center bg-muted rounded-lg text-xs text-muted-foreground">
        Ingen frames
      </div>
    )
  }

  const currentFrame = currentFrames[frameIndex]
  const frameUrl = showAnnotated && event.annotated_frames.length > 0
    ? api.getAnnotatedFrameUrl(event.event_id, currentFrame)
    : api.getFrameUrl(event.event_id, currentFrame)

  return (
    <div className="rounded-lg overflow-hidden border">
      <div className="relative">
        <img
          src={frameUrl}
          alt={`Frame ${frameIndex + 1}`}
          className="w-full object-contain max-h-48"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-white text-xs">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white hover:bg-white/20"
            disabled={frameIndex === 0}
            onClick={() => { setFrameIndex(i => i - 1); setPlaying(false) }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-white hover:bg-white/20"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <span>{frameIndex + 1} / {currentFrames.length}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-white hover:bg-white/20"
              onClick={handleDownload}
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white hover:bg-white/20"
            disabled={frameIndex === currentFrames.length - 1}
            onClick={() => { setFrameIndex(i => i + 1); setPlaying(false) }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {event.annotated_frames.length > 0 && (
        <div className="flex gap-1 p-1.5 border-t bg-muted/50">
          <Button
            variant={showAnnotated ? 'default' : 'outline'}
            size="xs"
            onClick={() => { setShowAnnotated(true); setFrameIndex(0); setPlaying(false) }}
          >
            Annotert
          </Button>
          <Button
            variant={!showAnnotated ? 'default' : 'outline'}
            size="xs"
            onClick={() => { setShowAnnotated(false); setFrameIndex(0); setPlaying(false) }}
          >
            Original
          </Button>
        </div>
      )}
    </div>
  )
}
