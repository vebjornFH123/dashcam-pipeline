import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { EventCard } from '@/components/EventCard'
import { api } from '@/api/client'

export function EventList() {
  const [severity, setSeverity] = useState<string>('')
  const [objectType, setObjectType] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', severity, objectType],
    queryFn: () => api.getEvents({
      ...(severity ? { severity } : {}),
      ...(objectType ? { object_type: objectType } : {}),
    }),
  })

  const events = data?.events ?? []

  // Get all unique object types from unfiltered events for the dropdown
  const { data: allData } = useQuery({
    queryKey: ['events-all'],
    queryFn: () => api.getEvents(),
  })

  const objectTypes = useMemo(() => {
    const types = new Set<string>()
    for (const ev of allData?.events ?? []) {
      for (const key of Object.keys(ev.object_counts)) {
        types.add(key)
      }
    }
    return Array.from(types).sort()
  }, [allData])

  const selectClass = "h-9 w-48 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hendelser</h1>
          <p className="text-muted-foreground">{events.length} hendelser funnet</p>
        </div>
        <div className="flex gap-2">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className={selectClass}
          >
            <option value="">Alle alvorligheter</option>
            <option value="critical">Kritisk</option>
            <option value="high">Høy</option>
            <option value="medium">Middels</option>
            <option value="low">Lav</option>
          </select>
          <select
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            className={selectClass}
          >
            <option value="">Alle objekttyper</option>
            {objectTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm text-destructive">Kunne ikke laste hendelser.</p>
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen hendelser funnet.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <EventCard key={event.event_id} event={event} />
        ))}
      </div>
    </div>
  )
}
