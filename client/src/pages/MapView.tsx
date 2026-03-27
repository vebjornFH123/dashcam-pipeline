import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { severityMapColor } from '@/lib/utils'
import type { GeoJSONFeature } from '@/types/events'

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const navigate = useNavigate()
  const [selectedEvent, setSelectedEvent] = useState<GeoJSONFeature | null>(null)

  const { data: geojson, isLoading, error } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeoJSON(),
  })

  useEffect(() => {
    if (!mapContainer.current) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(mapContainer.current, {
      center: [59.91, 10.75],
      zoom: 10,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson || geojson.features.length === 0) return

    const bounds = L.latLngBounds([])

    for (const feature of geojson.features) {
      const color = severityMapColor(feature.properties.severity_level)

      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates as number[]
        const marker = L.circleMarker([lat, lng], {
          radius: 10,
          color,
          fillColor: color,
          fillOpacity: 0.7,
          weight: 2,
        }).addTo(map)

        marker.on('click', () => setSelectedEvent(feature))
        bounds.extend([lat, lng])

      } else if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates as number[][]
        const latlngs: L.LatLngExpression[] = coords.map(([lng, lat]) => [lat, lng])

        const line = L.polyline(latlngs, {
          color,
          weight: 5,
          opacity: 0.8,
        }).addTo(map)

        // Add clickable marker at midpoint
        const mid = latlngs[Math.floor(latlngs.length / 2)]
        const marker = L.circleMarker(mid, {
          radius: 8,
          color,
          fillColor: color,
          fillOpacity: 0.8,
          weight: 2,
        }).addTo(map)

        marker.on('click', () => setSelectedEvent(feature))
        line.on('click', () => setSelectedEvent(feature))

        for (const ll of latlngs) {
          bounds.extend(ll)
        }
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [geojson])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Kart</h1>

      {isLoading && (
        <div className="flex h-12 items-center gap-2 text-sm text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          Laster kartdata...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-1 text-sm text-destructive">Kunne ikke laste GeoJSON-data.</p>
        </div>
      )}

      {!isLoading && geojson && geojson.features.length === 0 && (
        <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
          Ingen hendelser med GPS-data. Ta opp video med kameraet for å logge posisjon automatisk.
        </div>
      )}

      <div className="relative">
        <div ref={mapContainer} className="h-[calc(100svh-12rem)] w-full rounded-lg border" />

        {selectedEvent && (
          <Card className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[1000]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">{selectedEvent.properties.event_id}</CardTitle>
              <SeverityBadge level={selectedEvent.properties.severity_level} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Score: {selectedEvent.properties.severity_score}</div>
              <div>{selectedEvent.properties.num_frames} frames</div>
              {Object.entries(selectedEvent.properties.object_counts).length > 0 && (
                <div className="text-muted-foreground">
                  {Object.entries(selectedEvent.properties.object_counts)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(', ')}
                </div>
              )}
              <button
                className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => navigate(`/events/${selectedEvent.properties.event_id}`)}
              >
                Se detaljer &rarr;
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
