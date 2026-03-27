import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { severityMapColor } from '@/lib/utils'

interface EventMapProps {
  /** Array of {latitude, longitude} points for this event */
  points: Array<{ latitude: number; longitude: number }>
  /** Severity level for coloring */
  severityLevel?: string
  /** Height of the map container */
  height?: string
}

export function EventMap({ points, severityLevel = 'medium', height = '300px' }: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const color = severityMapColor(severityLevel)
    const center: L.LatLngExpression = [points[0].latitude, points[0].longitude]

    const map = L.map(containerRef.current, {
      center,
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    if (points.length === 1) {
      // Single point — show marker
      L.circleMarker([points[0].latitude, points[0].longitude], {
        radius: 10,
        color,
        fillColor: color,
        fillOpacity: 0.7,
        weight: 2,
      }).addTo(map)
    } else {
      // Multiple points — show route line + markers at start/end
      const latlngs: L.LatLngExpression[] = points.map(p => [p.latitude, p.longitude])

      L.polyline(latlngs, {
        color,
        weight: 4,
        opacity: 0.8,
      }).addTo(map)

      // Start marker (green)
      L.circleMarker(latlngs[0], {
        radius: 8,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.8,
        weight: 2,
      }).bindTooltip('Start').addTo(map)

      // End marker (red)
      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 8,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
        weight: 2,
      }).bindTooltip('Slutt').addTo(map)

      // Fit bounds
      const bounds = L.latLngBounds(latlngs)
      map.fitBounds(bounds, { padding: [30, 30] })
    }

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
