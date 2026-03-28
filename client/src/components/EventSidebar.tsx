import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Camera, MapPin, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { InlineFrameViewer } from '@/components/InlineFrameViewer'
import { formatTimestamp } from '@/lib/utils'
import type { EventSummary } from '@/types/events'

interface EventSidebarProps {
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
}

export function EventSidebar({ selectedEventId, onSelectEvent }: EventSidebarProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.getEvents(),
    refetchInterval: 10_000,
  })

  const events = data?.events ?? []

  return (
    <>
      {/* Desktop: right sidebar */}
      <div className="hidden sm:flex absolute top-0 right-0 h-full w-96 z-10 flex-col bg-background/95 backdrop-blur-sm border-l shadow-xl">
        <SidebarContent
          events={events}
          isLoading={isLoading}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-10 max-h-[40svh] flex flex-col bg-background/95 backdrop-blur-sm border-t rounded-t-xl shadow-xl pb-[env(safe-area-inset-bottom)]">
        <SidebarContent
          events={events}
          isLoading={isLoading}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
        />
      </div>
    </>
  )
}

function SidebarContent({ events, isLoading, selectedEventId, onSelectEvent }: {
  events: EventSummary[]
  isLoading: boolean
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
}) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-bold">Hendelser</h2>
        <p className="text-xs text-muted-foreground">
          {events.length} registrert
        </p>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex h-24 items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Ingen hendelser ennå. Ta opp en video for å starte analyse.
          </div>
        )}

        {events.length > 0 && (
          <div className="divide-y">
            {events.map((event) => (
              <EventListItem
                key={event.event_id}
                event={event}
                isSelected={selectedEventId === event.event_id}
                onSelect={() => onSelectEvent(selectedEventId === event.event_id ? null : event.event_id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function EventListItem({ event, isSelected, onSelect }: {
  event: EventSummary
  isSelected: boolean
  onSelect: () => void
}) {
  const objectList = Object.entries(event.object_counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')

  return (
    <div>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{event.event_id}</span>
            <SeverityBadge level={event.severity_level} />
          </div>
          {isSelected ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Camera className="h-3 w-3" /> {event.num_frames} frames
          </span>
          {objectList && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" /> {objectList}
            </span>
          )}
          <span className="ml-auto font-medium">{event.severity_score}</span>
        </div>
      </button>

      {isSelected && <ExpandedEventDetail eventId={event.event_id} />}
    </div>
  )
}

function ExpandedEventDetail({ eventId }: { eventId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.getEvent(eventId),
  })

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
      </div>
    )
  }

  if (!data) return null

  const { metadata } = data

  return (
    <div className="px-4 pb-4 space-y-3">
      <InlineFrameViewer event={data} />

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
  )
}

