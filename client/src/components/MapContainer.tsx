import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { api } from '@/api/client'
import { severityMapColor } from '@/lib/utils'

interface MapContainerProps {
  selectedTripId: string | null
  onSelectTrip: (tripId: string | null) => void
}

export function MapContainer({ selectedTripId, onSelectTrip }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: Infinity,
  })

  const { data: tripsGeoJSON } = useQuery({
    queryKey: ['trips-geojson'],
    queryFn: () => api.getTripsGeoJSON(),
    refetchInterval: 10_000,
  })

  const { data: eventsGeoJSON } = useQuery({
    queryKey: ['events-geojson', selectedTripId],
    queryFn: () => api.getGeoJSON(),
    enabled: !!selectedTripId,
  })

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || !config?.mapbox_token) return
    if (mapRef.current) return

    mapboxgl.accessToken = config.mapbox_token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [10.75, 59.91],
      zoom: 10,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // Trip lines source (empty initially)
      map.addSource('trips', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Trip lines layer
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
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 6,
            4,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 1,
            0.7,
          ],
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      })

      // Event markers source (empty initially)
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

      // Click trip line
      map.on('click', 'trip-lines', (e) => {
        if (e.features?.[0]?.properties?.trip_id) {
          onSelectTrip(e.features[0].properties.trip_id)
        }
      })

      // Click elsewhere to deselect
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['trip-lines', 'event-points'] })
        if (features.length === 0) {
          onSelectTrip(null)
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
  }, [config?.mapbox_token])

  // Update trip lines when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tripsGeoJSON) return

    const source = map.getSource('trips') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(tripsGeoJSON as unknown as GeoJSON.FeatureCollection)
    }

    // Fit bounds to all trips
    if (tripsGeoJSON.features.length > 0 && !selectedTripId) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const feature of tripsGeoJSON.features) {
        for (const coord of feature.geometry.coordinates) {
          bounds.extend(coord as [number, number])
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
      }
    }
  }, [tripsGeoJSON, selectedTripId])

  // Update event markers when a trip is selected
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource('events') as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    if (!selectedTripId || !eventsGeoJSON) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Find selected trip to get its event IDs
    const selectedTrip = tripsGeoJSON?.features.find(
      f => f.properties.trip_id === selectedTripId
    )
    const eventIds = new Set(selectedTrip?.properties.event_ids ?? [])

    // Filter events to only those belonging to this trip
    const filteredFeatures = eventsGeoJSON.features.filter(
      f => eventIds.has(f.properties.event_id)
    )

    source.setData({ type: 'FeatureCollection', features: filteredFeatures } as unknown as GeoJSON.FeatureCollection)
  }, [selectedTripId, eventsGeoJSON, tripsGeoJSON])

  // Zoom to selected trip
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedTripId || !tripsGeoJSON) return

    const feature = tripsGeoJSON.features.find(
      f => f.properties.trip_id === selectedTripId
    )
    if (!feature) return

    const bounds = new mapboxgl.LngLatBounds()
    for (const coord of feature.geometry.coordinates) {
      bounds.extend(coord as [number, number])
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 16 })
    }
  }, [selectedTripId, tripsGeoJSON])

  return (
    <div ref={containerRef} className="absolute inset-0" />
  )
}
