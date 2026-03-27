import { useEffect, useState } from 'react'
import { Circle, Square, SwitchCamera, X, Navigation, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCamera } from '@/hooks/useCamera'
import { api } from '@/api/client'

interface RecordingOverlayProps {
  onClose: () => void
  onJobStarted: (jobId: string) => void
}

export function RecordingOverlay({ onClose, onJobStarted }: RecordingOverlayProps) {
  const {
    videoRef, stream, isRecording, duration,
    recordedBlob, trackpoints, gpsStatus,
    error, isSupported,
    startCamera, stopCamera, startRecording, stopRecording, switchCamera, reset,
  } = useCamera()

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Open camera on mount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-upload when recording is done
  useEffect(() => {
    if (!recordedBlob) return

    setUploading(true)
    setUploadError(null)

    api.uploadVideo(recordedBlob as File, trackpoints)
      .then((res) => {
        stopCamera()
        onJobStarted(res.job_id)
        onClose()
      })
      .catch((err) => {
        setUploadError(err.message || 'Opplasting feilet')
        setUploading(false)
      })
  }, [recordedBlob]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const gpsIndicator = () => {
    switch (gpsStatus) {
      case 'active':
        return <Navigation className="h-4 w-4 text-green-400" />
      case 'acquiring':
        return <Navigation className="h-4 w-4 text-yellow-400 animate-pulse" />
      case 'error':
        return <Navigation className="h-4 w-4 text-red-400" />
      default:
        return null
    }
  }

  if (!isSupported) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white space-y-4 p-6">
          <p className="text-lg">Kamera støttes ikke i denne nettleseren</p>
          <p className="text-sm text-white/60">Bruk Chrome på Android eller Safari på iOS</p>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
        </div>
      </div>
    )
  }

  if (uploading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p className="text-lg">Laster opp video...</p>
          <p className="text-sm text-white/60">
            {trackpoints.length} GPS-punkter registrert
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close button */}
      {!isRecording && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => { stopCamera(); reset(); onClose() }}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Camera preview */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-3 bg-black/60 rounded-full px-4 py-2">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono text-lg">{formatDuration(duration)}</span>
            <div className="flex items-center gap-1.5 text-white/80 text-sm">
              {gpsIndicator()}
              <span>{trackpoints.length} pts</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-20 left-4 right-4 bg-red-500/90 text-white rounded-lg px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {uploadError && (
          <div className="absolute bottom-20 left-4 right-4 bg-red-500/90 text-white rounded-lg px-4 py-2 text-sm">
            {uploadError}
            <Button variant="ghost" size="sm" className="ml-2 text-white" onClick={reset}>
              Prøv igjen
            </Button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-8 py-6 bg-black/80">
        {stream && !isRecording && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={switchCamera}
          >
            <SwitchCamera className="h-6 w-6" />
          </Button>
        )}

        {stream && !isRecording && (
          <button
            onClick={startRecording}
            className="h-16 w-16 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Circle className="h-10 w-10 text-red-500 fill-red-500" />
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="h-16 w-16 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Square className="h-8 w-8 text-red-500 fill-red-500" />
          </button>
        )}

        {/* Spacer for centering */}
        {stream && !isRecording && (
          <div className="w-10" />
        )}
      </div>
    </div>
  )
}
