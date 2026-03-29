import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera, MapPin, ChevronDown, ChevronUp, Video, Route, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SeverityBadge } from '@/components/SeverityBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { api } from '@/api/client'
import { InlineFrameViewer } from '@/components/InlineFrameViewer'
import { formatTimestamp } from '@/lib/utils'
import type { EventSummary, Trip } from '@/types/events'

interface EventSidebarProps {
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
  onSelectTrip?: (tripId: string) => void
  onRecord?: () => void
}

export function EventSidebar({ selectedEventId, onSelectEvent, onSelectTrip, onRecord }: EventSidebarProps) {
  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.getTrips(),
    refetchInterval: 10_000,
  })

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.getEvents(),
    refetchInterval: 10_000,
  })

  const trips = tripsData?.trips ?? []
  const events = eventsData?.events ?? []
  const isLoading = tripsLoading || eventsLoading

  return (
    <>
      {/* Desktop: right sidebar */}
      <div className="hidden sm:flex absolute top-0 right-0 h-full w-96 z-10 flex-col bg-background/95 backdrop-blur-sm border-l shadow-xl animate-in slide-in-from-right duration-200">
        <SidebarContent
          trips={trips}
          events={events}
          isLoading={isLoading}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          onSelectTrip={onSelectTrip}
          onRecord={onRecord}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-10 max-h-[40svh] flex flex-col bg-background/95 backdrop-blur-sm border-t rounded-t-xl shadow-xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
        <SidebarContent
          trips={trips}
          events={events}
          isLoading={isLoading}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          onSelectTrip={onSelectTrip}
          onRecord={onRecord}
        />
      </div>
    </>
  )
}

function SidebarContent({ trips, events, isLoading, selectedEventId, onSelectEvent, onSelectTrip, onRecord }: {
  trips: Trip[]
  events: EventSummary[]
  isLoading: boolean
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
  onSelectTrip?: (tripId: string) => void
  onRecord?: () => void
}) {
  const queryClient = useQueryClient()
  const [collapsedTrips, setCollapsedTrips] = useState<Set<string>>(new Set())

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['trips'] })
    queryClient.invalidateQueries({ queryKey: ['trips-geojson'] })
    queryClient.invalidateQueries({ queryKey: ['events'] })
    queryClient.invalidateQueries({ queryKey: ['events-geojson'] })
  }

  const handleDeleteTrip = async (tripId: string) => {
    await api.deleteTrip(tripId)
    invalidateAll()
  }

  const handleDeleteEvent = async (eventId: string) => {
    await api.deleteEvent(eventId)
    onSelectEvent(null)
    invalidateAll()
  }

  const toggleTrip = (tripId: string) => {
    setCollapsedTrips(prev => {
      const next = new Set(prev)
      if (next.has(tripId)) next.delete(tripId)
      else next.add(tripId)
      return next
    })
  }

  // Group events by trip
  const tripEventMap = new Map<string, EventSummary[]>()
  const eventTripMap = new Map<string, string>()
  for (const trip of trips) {
    const tripEvents = events.filter(e => trip.event_ids.includes(e.event_id))
    tripEventMap.set(trip.trip_id, tripEvents)
    for (const eid of trip.event_ids) eventTripMap.set(eid, trip.trip_id)
  }
  const orphanEvents = events.filter(e => !eventTripMap.has(e.event_id))

  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-bold">Kjøreturer</h2>
        <p className="text-xs text-muted-foreground">
          {trips.length} {trips.length === 1 ? 'tur' : 'turer'} &middot; {events.length} hendelser
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {isLoading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && trips.length === 0 && events.length === 0 && (
          <div className="p-8 text-center">
            <Video className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-medium">Ingen kjøreturer ennå</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Ta opp en video for å starte analyse av veien
            </p>
            {onRecord && (
              <button
                onClick={onRecord}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                <Video className="h-4 w-4" />
                Ta opp
              </button>
            )}
          </div>
        )}

        {/* Trips with grouped events */}
        {trips.length > 0 && (
          <div className="divide-y">
            {trips.map(trip => {
              const tripEvents = tripEventMap.get(trip.trip_id) ?? []
              const isCollapsed = collapsedTrips.has(trip.trip_id)

              return (
                <div key={trip.trip_id}>
                  {/* Trip header */}
                  <button
                    onClick={() => toggleTrip(trip.trip_id)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {formatTimestamp(trip.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge level={trip.worst_severity} />
                        {isCollapsed ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{tripEvents.length} hendelser</span>
                      <span>{trip.gps_track.length} GPS-punkter</span>
                      <div className="ml-auto flex items-center gap-2">
                        <ConfirmDialog
                          trigger={
                            <button className="text-destructive/60 hover:text-destructive p-0.5">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          }
                          title="Slett kjøretur?"
                          description={`Dette sletter turen og alle ${tripEvents.length} tilhørende hendelser permanent.`}
                          onConfirm={() => handleDeleteTrip(trip.trip_id)}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectTrip?.(trip.trip_id) }}
                          className="text-primary hover:underline"
                        >
                          Vis tur →
                        </button>
                      </div>
                    </div>
                  </button>

                  {/* Trip's events */}
                  {!isCollapsed && tripEvents.length > 0 && (
                    <div className="border-t bg-muted/20">
                      {tripEvents.map(event => (
                        <EventListItem
                          key={event.event_id}
                          event={event}
                          isSelected={selectedEventId === event.event_id}
                          onSelect={() => onSelectEvent(selectedEventId === event.event_id ? null : event.event_id)}
                          onDelete={handleDeleteEvent}
                          indent
                        />
                      ))}
                    </div>
                  )}

                  {!isCollapsed && tripEvents.length === 0 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/20 border-t">
                      Ingen hendelser på denne turen
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Orphan events (not linked to a trip) */}
        {orphanEvents.length > 0 && (
          <div className="border-t">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
              Ugrupperte hendelser
            </div>
            <div className="divide-y">
              {orphanEvents.map(event => (
                <EventListItem
                  key={event.event_id}
                  event={event}
                  isSelected={selectedEventId === event.event_id}
                  onSelect={() => onSelectEvent(selectedEventId === event.event_id ? null : event.event_id)}
                  onDelete={handleDeleteEvent}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function EventListItem({ event, isSelected, onSelect, onDelete, indent }: {
  event: EventSummary
  isSelected: boolean
  onSelect: () => void
  onDelete?: (eventId: string) => Promise<void>
  indent?: boolean
}) {
  const objectList = Object.entries(event.object_counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')

  return (
    <div>
      <button
        onClick={onSelect}
        className={`w-full text-left py-2.5 transition-colors ${indent ? 'pl-8 pr-4' : 'px-4'} ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{event.event_id}</span>
            <SeverityBadge level={event.severity_level} />
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <ConfirmDialog
                trigger={
                  <button className="text-destructive/60 hover:text-destructive p-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                }
                title="Slett hendelse?"
                description={`Hendelse ${event.event_id} og alle tilhørende frames vil bli slettet permanent.`}
                onConfirm={() => onDelete(event.event_id)}
              />
            )}
            {isSelected ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Camera className="h-3 w-3" /> {event.num_frames}
          </span>
          {objectList && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" /> {objectList}
            </span>
          )}
          <span className="ml-auto font-medium">{event.severity_score}</span>
        </div>
      </button>

      {isSelected && <ExpandedEventDetail eventId={event.event_id} indent={indent} />}
    </div>
  )
}

function ExpandedEventDetail({ eventId, indent }: { eventId: string; indent?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.getEvent(eventId),
  })

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
      </div>
    )
  }

  if (!data) return null

  const { metadata } = data

  return (
    <div className={`pb-3 space-y-3 ${indent ? 'pl-8 pr-4' : 'px-4'}`}>
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
