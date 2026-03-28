import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, Camera, MapPin, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineFrameViewer } from '@/components/InlineFrameViewer'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { formatTimestamp } from '@/lib/utils'
import type { EventDetail } from '@/types/events'

interface TripPanelProps {
  tripId: string
  onClose: () => void
  onSelectEvent?: (eventId: string | null) => void
}

export function TripPanel({ tripId, onClose, onSelectEvent }: TripPanelProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const handleExpandEvent = (eventId: string | null) => {
    setExpandedEventId(eventId)
    onSelectEvent?.(eventId)
  }

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
          onExpandEvent={handleExpandEvent}
          onClose={onClose}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-20 max-h-[75svh] flex flex-col bg-background/95 backdrop-blur-sm border-t rounded-t-xl shadow-xl pb-[env(safe-area-inset-bottom)]">
        <PanelContent
          trip={trip}
          events={events}
          isLoading={isLoading}
          expandedEventId={expandedEventId}
          onExpandEvent={handleExpandEvent}
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

