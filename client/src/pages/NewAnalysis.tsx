import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Video, Camera, SwitchCamera, CircleStop, Loader2, FileVideo, MapPin, MapPinOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import { useCamera } from '@/hooks/useCamera'

const ACCEPT = '.mp4,.mov,.avi,.mkv,.webm'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function NewAnalysis() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const camera = useCamera()

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const result = await api.uploadVideo(file)
      navigate(`/jobs?highlight=${result.job_id}`)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [navigate])

  const handleFileSelect = useCallback((files: FileList | null) => {
    const file = files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadError(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleRecordingUpload = useCallback(async () => {
    if (!camera.recordedBlob) return
    setUploading(true)
    setUploadError(null)
    try {
      const result = await api.uploadVideo(
        camera.recordedBlob as File,
        camera.trackpoints.length > 0 ? camera.trackpoints : undefined,
      )
      camera.reset()
      camera.stopCamera()
      navigate(`/jobs?highlight=${result.job_id}`)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [camera, navigate])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ny analyse</h1>
        <p className="text-muted-foreground">Last opp video eller ta opp med kameraet</p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">
            <Upload className="mr-2 h-4 w-4" />
            Last opp
          </TabsTrigger>
          <TabsTrigger value="record" disabled={!camera.isSupported}>
            <Video className="mr-2 h-4 w-4" />
            Ta opp
          </TabsTrigger>
        </TabsList>

        {/* Upload tab */}
        <TabsContent value="upload">
          <Card>
            <CardContent className="p-6">
              <div
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileVideo className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm font-medium">Dra og slipp video her</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  eller klikk for å velge fil (.mp4, .mov, .avi, .mkv, .webm)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
              </div>

              {selectedFile && (
                <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3">
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <Button
                    onClick={() => handleUpload(selectedFile)}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Laster opp...
                      </>
                    ) : (
                      'Start analyse'
                    )}
                  </Button>
                </div>
              )}

              {uploadError && (
                <p className="mt-3 text-sm text-destructive">{uploadError}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Camera tab */}
        <TabsContent value="record">
          <Card>
            <CardContent className="p-4">
              {!camera.isSupported ? (
                <div className="py-12 text-center">
                  <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nettleseren støtter ikke kameraopptak.
                    Bruk Chrome (Android) eller Safari (iOS 14.3+).
                  </p>
                </div>
              ) : !camera.stream && !camera.recordedBlob ? (
                <div className="flex flex-col items-center py-12">
                  <Camera className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">Åpne kameraet for å starte opptak</p>
                  <Button className="mt-4" onClick={() => camera.startCamera()}>
                    <Camera className="mr-2 h-4 w-4" />
                    Åpne kamera
                  </Button>
                </div>
              ) : camera.recordedBlob ? (
                /* Recording complete — show upload */
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <FileVideo className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      Opptak ferdig — {formatDuration(camera.duration)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(camera.recordedBlob.size)}
                    </p>
                    {camera.trackpoints.length > 0 ? (
                      <p className="mt-1 flex items-center justify-center gap-1 text-xs text-green-600">
                        <MapPin className="h-3 w-3" />
                        {camera.trackpoints.length} GPS-punkter logget
                      </p>
                    ) : (
                      <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <MapPinOff className="h-3 w-3" />
                        Ingen GPS-data (posisjon ikke tilgjengelig)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { camera.reset(); camera.startCamera() }}>
                      Ta nytt opptak
                    </Button>
                    <Button className="flex-1" onClick={handleRecordingUpload} disabled={uploading}>
                      {uploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Laster opp...
                        </>
                      ) : (
                        'Start analyse'
                      )}
                    </Button>
                  </div>
                  {uploadError && (
                    <p className="text-sm text-destructive">{uploadError}</p>
                  )}
                </div>
              ) : (
                /* Camera active */
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    <video
                      ref={camera.videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full"
                    />
                    {camera.isRecording && (
                      <div className="absolute top-3 left-3 flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                          REC {formatDuration(camera.duration)}
                        </div>
                        <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          camera.gpsStatus === 'active' ? 'bg-green-600 text-white' :
                          camera.gpsStatus === 'acquiring' ? 'bg-yellow-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}>
                          <MapPin className="h-3 w-3" />
                          {camera.gpsStatus === 'active' ? 'GPS' :
                           camera.gpsStatus === 'acquiring' ? 'GPS...' : 'Ingen GPS'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={camera.switchCamera}
                      disabled={camera.isRecording}
                    >
                      <SwitchCamera className="h-5 w-5" />
                    </Button>

                    {!camera.isRecording ? (
                      <button
                        onClick={camera.startRecording}
                        className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-red-500 bg-red-500 transition-transform active:scale-95"
                        aria-label="Start opptak"
                      >
                        <span className="h-6 w-6 rounded-full bg-white" />
                      </button>
                    ) : (
                      <button
                        onClick={camera.stopRecording}
                        className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-red-500 bg-white transition-transform active:scale-95"
                        aria-label="Stopp opptak"
                      >
                        <CircleStop className="h-6 w-6 text-red-500" />
                      </button>
                    )}

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => { camera.stopCamera(); camera.reset() }}
                      disabled={camera.isRecording}
                    >
                      <span className="text-xs">Lukk</span>
                    </Button>
                  </div>

                  {camera.error && (
                    <p className="text-sm text-destructive text-center">{camera.error}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
