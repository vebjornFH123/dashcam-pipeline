import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, AlertTriangle, ChevronLeft, ChevronRight, Play, Pause, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeverityBadge } from '@/components/SeverityBadge'
import { api } from '@/api/client'
import { formatTimestamp } from '@/lib/utils'
import { EventMap } from '@/components/EventMap'

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const [frameIndex, setFrameIndex] = useState(0)
  const [showAnnotated, setShowAnnotated] = useState(true)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.getEvent(eventId!),
    enabled: !!eventId,
  })

  const currentFrames = data
    ? (showAnnotated && data.annotated_frames.length > 0 ? data.annotated_frames : data.frames)
    : []

  // Slideshow
  useEffect(() => {
    if (playing && currentFrames.length > 0) {
      intervalRef.current = setInterval(() => {
        setFrameIndex((i) => {
          if (i >= currentFrames.length - 1) {
            setPlaying(false)
            return i
          }
          return i + 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, currentFrames.length])

  const handleDownload = useCallback(() => {
    if (!eventId || !currentFrames[frameIndex]) return
    const url = showAnnotated && data?.annotated_frames.length
      ? api.getAnnotatedFrameUrl(eventId, currentFrames[frameIndex])
      : api.getFrameUrl(eventId, currentFrames[frameIndex])
    const a = document.createElement('a')
    a.href = url
    a.download = currentFrames[frameIndex]
    a.click()
  }, [eventId, frameIndex, currentFrames, showAnnotated, data])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tilbake
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm text-destructive">Hendelse ikke funnet.</p>
        </div>
      </div>
    )
  }

  const { metadata, annotated_frames } = data
  const currentFrame = currentFrames[frameIndex]
  const frameUrl = currentFrame
    ? (showAnnotated && annotated_frames.length > 0
      ? api.getAnnotatedFrameUrl(eventId!, currentFrame)
      : api.getFrameUrl(eventId!, currentFrame))
    : null

  const frameMeta = metadata.frame_metadata[frameIndex]

  // Extract GPS points for map
  const gpsPoints = metadata.frame_metadata
    .filter((f): f is typeof f & { latitude: number; longitude: number } =>
      f.latitude != null && f.longitude != null
    )
    .map(f => ({ latitude: f.latitude, longitude: f.longitude }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tilbake
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{metadata.event_id}</h1>
        <SeverityBadge level={metadata.severity.severity_level} />
      </div>

      {/* Frame viewer */}
      <Card>
        <CardContent className="p-0">
          {frameUrl ? (
            <div className="relative">
              <img
                src={frameUrl}
                alt={`Frame ${frameIndex + 1}`}
                className="w-full rounded-t-lg object-contain max-h-[60vh]"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-4 py-2 text-white text-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-white hover:bg-white/20"
                  disabled={frameIndex === 0}
                  onClick={() => { setFrameIndex(i => i - 1); setPlaying(false) }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-white hover:bg-white/20"
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span>Frame {frameIndex + 1} / {currentFrames.length}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-white hover:bg-white/20"
                    onClick={handleDownload}
                    title="Last ned frame"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-white hover:bg-white/20"
                  disabled={frameIndex === currentFrames.length - 1}
                  onClick={() => { setFrameIndex(i => i + 1); setPlaying(false) }}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              Ingen frames tilgjengelig
            </div>
          )}
          {annotated_frames.length > 0 && (
            <div className="flex gap-2 p-3 border-t">
              <Button
                variant={showAnnotated ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setShowAnnotated(true); setFrameIndex(0); setPlaying(false) }}
              >
                Annotert
              </Button>
              <Button
                variant={!showAnnotated ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setShowAnnotated(false); setFrameIndex(0); setPlaying(false) }}
              >
                Original
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="detections">Deteksjoner</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Alvorlighet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metadata.severity.severity_score}</div>
                <SeverityBadge level={metadata.severity.severity_level} />
                {metadata.severity.factors && (
                  <div className="mt-3 space-y-1 text-sm">
                    {Object.entries(metadata.severity.factors).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-medium">{v as number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detaljer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Video</span>
                  <span className="truncate ml-2">{metadata.source_video}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span>{formatTimestamp(metadata.start_time)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slutt</span>
                  <span>{formatTimestamp(metadata.end_time)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frames</span>
                  <span>{metadata.num_frames}</span>
                </div>
                {frameMeta?.speed != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hastighet</span>
                    <span>{frameMeta.speed} km/t</span>
                  </div>
                )}
                {frameMeta?.latitude != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Posisjon</span>
                    <span>{frameMeta.latitude.toFixed(5)}, {frameMeta.longitude?.toFixed(5)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Map showing event GPS track */}
          {gpsPoints.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Posisjon</CardTitle>
              </CardHeader>
              <CardContent>
                <EventMap
                  points={gpsPoints}
                  severityLevel={metadata.severity.severity_level}
                  height="300px"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="detections">
          <Card>
            <CardContent className="p-4 space-y-4">
              {Object.keys(metadata.object_counts).length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Objekter</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(metadata.object_counts).map(([cls, count]) => (
                      <Badge key={cls} variant="secondary">
                        {cls}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {metadata.damage_counts && Object.keys(metadata.damage_counts).length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Veiskader</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(metadata.damage_counts).map(([cls, count]) => (
                      <Badge key={cls} variant="destructive">
                        {cls}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(metadata.object_counts).length === 0 &&
                (!metadata.damage_counts || Object.keys(metadata.damage_counts).length === 0) && (
                <p className="text-sm text-muted-foreground">Ingen deteksjoner for denne hendelsen.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata">
          <Card>
            <CardContent className="p-4">
              <pre className="overflow-auto rounded bg-muted p-4 text-xs">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
