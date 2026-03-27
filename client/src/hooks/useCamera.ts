import { useCallback, useEffect, useRef, useState } from 'react'

export interface GpsTrackpoint {
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  accuracy: number
  timestamp: string
  elapsed_seconds: number
}

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  isRecording: boolean
  duration: number
  recordedBlob: Blob | null
  trackpoints: GpsTrackpoint[]
  gpsStatus: 'inactive' | 'acquiring' | 'active' | 'error'
  error: string | null
  isSupported: boolean
  startCamera: (facingMode?: 'user' | 'environment') => Promise<void>
  stopCamera: () => void
  startRecording: () => void
  stopRecording: () => void
  switchCamera: () => void
  reset: () => void
}

function detectMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9'
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm'
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4'
  return ''
}

function getExtension(mime: string): string {
  if (mime.includes('webm')) return '.webm'
  return '.mp4'
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const trackpointsRef = useRef<GpsTrackpoint[]>([])
  const recordingStartRef = useRef<number>(0)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [trackpoints, setTrackpoints] = useState<GpsTrackpoint[]>([])
  const [gpsStatus, setGpsStatus] = useState<'inactive' | 'acquiring' | 'active' | 'error'>('inactive')
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

  const isSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && detectMimeType() !== ''

  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }

    setGpsStatus('acquiring')
    trackpointsRef.current = []
    recordingStartRef.current = Date.now()

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus('active')
        const tp: GpsTrackpoint = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
          elapsed_seconds: (pos.timestamp - recordingStartRef.current) / 1000,
        }
        trackpointsRef.current.push(tp)
      },
      (err) => {
        console.warn('GPS error:', err.message)
        if (trackpointsRef.current.length === 0) {
          setGpsStatus('error')
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    )
  }, [])

  const stopGpsTracking = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
    setTrackpoints([...trackpointsRef.current])
    setGpsStatus('inactive')
  }, [])

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    stopGpsTracking()
    mediaRecorderRef.current = null
    setIsRecording(false)
    setDuration(0)
  }, [stream, stopGpsTracking])

  const startCamera = useCallback(async (facing?: 'user' | 'environment') => {
    try {
      setError(null)
      const mode = facing ?? facingMode
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      setStream(s)
      setFacingMode(mode)
      if (videoRef.current) {
        videoRef.current.srcObject = s
      }
    } catch (e) {
      setError(`Kunne ikke åpne kamera: ${(e as Error).message}`)
    }
  }, [facingMode])

  const startRecording = useCallback(() => {
    if (!stream) return

    const mimeType = detectMimeType()
    if (!mimeType) {
      setError('Nettleseren støtter ikke videoopptak')
      return
    }

    chunksRef.current = []
    setRecordedBlob(null)
    setTrackpoints([])

    // Start GPS tracking
    startGpsTracking()

    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const ext = getExtension(mimeType)
      const type = mimeType.split(';')[0]
      const blob = new Blob(chunksRef.current, { type })
      const file = new File([blob], `recording${ext}`, { type })
      setRecordedBlob(file)
    }

    recorder.start(1000)
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setDuration(0)

    timerRef.current = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)
  }, [stream, startGpsTracking])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    stopGpsTracking()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [stopGpsTracking])

  const switchCamera = useCallback(() => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment'
    stopCamera()
    startCamera(newMode)
  }, [facingMode, stopCamera, startCamera])

  const reset = useCallback(() => {
    setRecordedBlob(null)
    setTrackpoints([])
    setDuration(0)
    setError(null)
    setGpsStatus('inactive')
  }, [])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    videoRef,
    stream,
    isRecording,
    duration,
    recordedBlob,
    trackpoints,
    gpsStatus,
    error,
    isSupported,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    switchCamera,
    reset,
  }
}
