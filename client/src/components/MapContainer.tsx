import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { api } from '@/api/client'
import { severityMapColor } from '@/lib/utils'

interface MapContainerProps {
  selectedTripId: string | null
  onSelectTrip: (tripId: string | null) => void
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
}

export function MapContainer({ selectedTripId, onSelectTrip, selectedEventId, onSelectEvent }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: Infinity,
    enabled: !import.meta.env.VITE_MAPBOX_TOKEN,
  })

  const { data: tripsGeoJSON } = useQuery({
    queryKey: ['trips-geojson'],
    queryFn: () => api.getTripsGeoJSON(),
    refetchInterval: 10_000,
  })

  const { data: eventsGeoJSON } = useQuery({
    queryKey: ['events-geojson'],
    queryFn: () => api.getGeoJSON(),
    refetchInterval: 10_000,
  })

  const mapboxToken = config?.mapbox_token || import.meta.env.VITE_MAPBOX_TOKEN || ''

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || !mapboxToken) return
    if (mapRef.current) return

    mapboxgl.accessToken = mapboxToken

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [10.75, 59.91],
      zoom: 5,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }), 'top-right')

    // Center on user location if no data
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        if (!tripsGeoJSON?.features.length && !eventsGeoJSON?.features.length) {
          map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 })
        }
      },
      () => {},
      { timeout: 5000 }
    )

    map.on('load', () => {
      // Trip lines
      map.addSource('trips', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'trip-lines',
        type: 'line',
        source: 'trips',
        paint: {
          'line-color': [
            'match', ['get', 'worst_severity'],
            'critical', severityMapColor('critical'),
            'high', severityMapColor('high'),
            'medium', severityMapColor('medium'),
            'low', severityMapColor('low'),
            severityMapColor('low'),
          ],
          'line-width': 4,
          'line-opacity': 0.7,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // Selected trip highlight layer
      map.addLayer({
        id: 'trip-lines-selected',
        type: 'line',
        source: 'trips',
        filter: ['==', ['get', 'trip_id'], ''],
        paint: {
          'line-color': [
            'match', ['get', 'worst_severity'],
            'critical', severityMapColor('critical'),
            'high', severityMapColor('high'),
            'medium', severityMapColor('medium'),
            'low', severityMapColor('low'),
            severityMapColor('low'),
          ],
          'line-width': 7,
          'line-opacity': 1,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // Event markers (always visible)
      map.addSource('events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'event-points',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'match', ['get', 'severity_level'],
            'critical', severityMapColor('critical'),
            'high', severityMapColor('high'),
            'medium', severityMapColor('medium'),
            'low', severityMapColor('low'),
            severityMapColor('low'),
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Selected event highlight layer (larger, glowing)
      map.addLayer({
        id: 'event-points-selected',
        type: 'circle',
        source: 'events',
        filter: ['==', ['get', 'event_id'], ''],
        paint: {
          'circle-radius': 14,
          'circle-color': [
            'match', ['get', 'severity_level'],
            'critical', severityMapColor('critical'),
            'high', severityMapColor('high'),
            'medium', severityMapColor('medium'),
            'low', severityMapColor('low'),
            severityMapColor('low'),
          ],
          'circle-opacity': 0.4,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Click event marker
      map.on('click', 'event-points', (e) => {
        const eventId = e.features?.[0]?.properties?.event_id
        if (eventId) onSelectEvent(eventId)
      })

      // Click trip line
      map.on('click', 'trip-lines', (e) => {
        if (e.features?.[0]?.properties?.trip_id) {
          onSelectTrip(e.features[0].properties.trip_id)
        }
      })

      // Cursor
      map.on('mouseenter', 'trip-lines', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'trip-lines', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'event-points', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'event-points', () => { map.getCanvas().style.cursor = '' })
    })

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken])

  // Update trip lines
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tripsGeoJSON) return

    const source = map.getSource('trips') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(tripsGeoJSON as unknown as GeoJSON.FeatureCollection)
    }

    if (tripsGeoJSON.features.length > 0 && !selectedTripId) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const feature of tripsGeoJSON.features) {
        for (const coord of feature.geometry.coordinates) {
          bounds.extend(coord as [number, number])
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 14 })
      }
    }
  }, [tripsGeoJSON, selectedTripId])

  // Update event markers (always show all events)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !eventsGeoJSON) return

    const source = map.getSource('events') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(eventsGeoJSON as unknown as GeoJSON.FeatureCollection)
    }

    // Fit bounds to events if no trips
    if (eventsGeoJSON.features.length > 0 && (!tripsGeoJSON || tripsGeoJSON.features.length === 0)) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const feature of eventsGeoJSON.features) {
        const coords = feature.geometry.type === 'Point'
          ? [feature.geometry.coordinates as number[]]
          : feature.geometry.coordinates as number[][]
        for (const c of coords) {
          bounds.extend(c as [number, number])
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 14 })
      }
    }
  }, [eventsGeoJSON, tripsGeoJSON])

  // Update highlight filters when selection changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Highlight selected trip line
    if (map.getLayer('trip-lines-selected')) {
      map.setFilter('trip-lines-selected', ['==', ['get', 'trip_id'], selectedTripId || ''])
    }
    // Dim unselected trips when one is selected
    if (map.getLayer('trip-lines')) {
      map.setPaintProperty('trip-lines', 'line-opacity', selectedTripId ? 0.3 : 0.7)
    }
  }, [selectedTripId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Highlight selected event marker
    if (map.getLayer('event-points-selected')) {
      map.setFilter('event-points-selected', ['==', ['get', 'event_id'], selectedEventId || ''])
    }
  }, [selectedEventId])

  // Zoom to selected trip
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedTripId || !tripsGeoJSON) return

    const feature = tripsGeoJSON.features.find(
      f => f.properties.trip_id === selectedTripId
    )
    if (!feature || feature.geometry.coordinates.length < 2) return

    const bounds = new mapboxgl.LngLatBounds()
    for (const coord of feature.geometry.coordinates) {
      bounds.extend(coord as [number, number])
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 16 })
    }
  }, [selectedTripId, tripsGeoJSON])

  // Fly to selected event
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedEventId || !eventsGeoJSON) return

    const feature = eventsGeoJSON.features.find(
      f => f.properties.event_id === selectedEventId
    )
    if (!feature) return

    const coords = feature.geometry.type === 'Point'
      ? feature.geometry.coordinates as [number, number]
      : (feature.geometry.coordinates as number[][])[0] as [number, number]

    map.flyTo({ center: coords, zoom: 15, offset: [-200, 0] })
  }, [selectedEventId, eventsGeoJSON])

  return (
    <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
  )
}
