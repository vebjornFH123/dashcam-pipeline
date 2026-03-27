import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { severityMapColor } from '@/lib/utils'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

interface EventMapProps {
  points: Array<{ latitude: number; longitude: number }>
  severityLevel?: string
  height?: string
}

export function EventMap({ points, severityLevel = 'medium', height = '300px' }: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const color = severityMapColor(severityLevel)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [points[0].longitude, points[0].latitude],
      zoom: 15,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      if (points.length === 1) {
        map.addSource('point', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [points[0].longitude, points[0].latitude] },
            properties: {},
          },
        })
        map.addLayer({
          id: 'point',
          type: 'circle',
          source: 'point',
          paint: {
            'circle-radius': 10,
            'circle-color': color,
            'circle-opacity': 0.7,
            'circle-stroke-width': 2,
            'circle-stroke-color': color,
          },
        })
      } else {
        const coordinates = points.map(p => [p.longitude, p.latitude] as [number, number])

        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates },
            properties: {},
          },
        })
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': color,
            'line-width': 4,
            'line-opacity': 0.8,
          },
        })

        // Start marker
        new mapboxgl.Marker({ color: '#22c55e' })
          .setLngLat(coordinates[0])
          .setPopup(new mapboxgl.Popup().setText('Start'))
          .addTo(map)

        // End marker
        new mapboxgl.Marker({ color: '#ef4444' })
          .setLngLat(coordinates[coordinates.length - 1])
          .setPopup(new mapboxgl.Popup().setText('Slutt'))
          .addTo(map)

        // Fit bounds
        const bounds = new mapboxgl.LngLatBounds()
        coordinates.forEach(c => bounds.extend(c))
        map.fitBounds(bounds, { padding: 40 })
      }
    })

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [points, severityLevel])

  if (points.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border overflow-hidden"
      style={{ height }}
    />
  )
}
