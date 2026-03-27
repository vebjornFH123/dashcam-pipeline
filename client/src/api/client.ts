import type { EventsResponse, EventDetail, GeoJSONCollection, JobsResponse, Job, UploadResponse, TripsResponse, TripDetail, TripsGeoJSONCollection } from '@/types/events'

const BASE_URL = '/api'

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getEvents(params?: { severity?: string; object_type?: string }) {
    const search = new URLSearchParams()
    if (params?.severity) search.set('severity', params.severity)
    if (params?.object_type) search.set('object_type', params.object_type)
    const qs = search.toString()
    return fetchJSON<EventsResponse>(`/events${qs ? `?${qs}` : ''}`)
  },

  getEvent(eventId: string) {
    return fetchJSON<EventDetail>(`/events/${eventId}`)
  },

  getGeoJSON() {
    return fetchJSON<GeoJSONCollection>('/geojson')
  },

  getFrameUrl(eventId: string, filename: string) {
    return `${BASE_URL}/events/${eventId}/frames/${filename}`
  },

  getAnnotatedFrameUrl(eventId: string, filename: string) {
    return `${BASE_URL}/events/${eventId}/annotated/${filename}`
  },

  async uploadVideo(file: File, trackpoints?: unknown[]): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    if (trackpoints && trackpoints.length > 0) {
      formData.append('trackpoints', JSON.stringify(trackpoints))
    }
    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload feilet' }))
      throw new Error(err.error || `Upload feilet: ${res.status}`)
    }
    return res.json() as Promise<UploadResponse>
  },

  getTrips() {
    return fetchJSON<TripsResponse>('/trips')
  },

  getTrip(tripId: string) {
    return fetchJSON<TripDetail>(`/trips/${tripId}`)
  },

  getTripsGeoJSON() {
    return fetchJSON<TripsGeoJSONCollection>('/trips/geojson')
  },

  getJobs() {
    return fetchJSON<JobsResponse>('/jobs')
  },

  getJob(jobId: string) {
    return fetchJSON<Job>(`/jobs/${jobId}`)
  },

  getJobStreamUrl(jobId: string) {
    return `${BASE_URL}/jobs/${jobId}/stream`
  },
}
