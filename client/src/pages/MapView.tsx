import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { severityMapColor } from '@/lib/utils'
import type { GeoJSONFeature } from '@/types/events'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
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

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [10.75, 59.91],
      zoom: 10,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson || geojson.features.length === 0) return

    const addLayers = () => {
      // Clean up previous layers
      for (const feature of geojson.features) {
        const id = feature.properties.event_id
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`)
        if (map.getLayer(`${id}-point`)) map.removeLayer(`${id}-point`)
        if (map.getSource(id)) map.removeSource(id)
      }

      const bounds = new mapboxgl.LngLatBounds()

      for (const feature of geojson.features) {
        const color = severityMapColor(feature.properties.severity_level)
        const id = feature.properties.event_id

        if (feature.geometry.type === 'Point') {
          const [lng, lat] = feature.geometry.coordinates as number[]

          map.addSource(id, {
            type: 'geojson',
            data: { type: 'Feature', geometry: feature.geometry, properties: {} },
          })
          map.addLayer({
            id: `${id}-point`,
            type: 'circle',
            source: id,
            paint: {
              'circle-radius': 10,
              'circle-color': color,
              'circle-opacity': 0.7,
              'circle-stroke-width': 2,
              'circle-stroke-color': color,
            },
          })

          map.on('click', `${id}-point`, () => setSelectedEvent(feature))
          map.on('mouseenter', `${id}-point`, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', `${id}-point`, () => { map.getCanvas().style.cursor = '' })

          bounds.extend([lng, lat])

        } else if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates as number[][]

          map.addSource(id, {
            type: 'geojson',
            data: { type: 'Feature', geometry: feature.geometry, properties: {} },
          })
          map.addLayer({
            id: `${id}-line`,
            type: 'line',
            source: id,
            paint: {
              'line-color': color,
              'line-width': 5,
              'line-opacity': 0.8,
            },
          })

          // Clickable circle at midpoint
          const mid = coords[Math.floor(coords.length / 2)]
          map.addSource(`${id}-mid`, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: mid }, properties: {} },
          })
          map.addLayer({
            id: `${id}-point`,
            type: 'circle',
            source: `${id}-mid`,
            paint: {
              'circle-radius': 8,
              'circle-color': color,
              'circle-opacity': 0.8,
              'circle-stroke-width': 2,
              'circle-stroke-color': color,
            },
          })

          map.on('click', `${id}-point`, () => setSelectedEvent(feature))
          map.on('click', `${id}-line`, () => setSelectedEvent(feature))
          map.on('mouseenter', `${id}-point`, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', `${id}-point`, () => { map.getCanvas().style.cursor = '' })
          map.on('mouseenter', `${id}-line`, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', `${id}-line`, () => { map.getCanvas().style.cursor = '' })

          for (const c of coords) bounds.extend(c as [number, number])
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40 })
      }
    }

    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.on('load', addLayers)
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
