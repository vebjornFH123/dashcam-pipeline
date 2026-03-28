import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Pause, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/api/client'
import type { EventDetail } from '@/types/events'

export function InlineFrameViewer({ event }: { event: EventDetail }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [showAnnotated, setShowAnnotated] = useState(true)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentFrames = showAnnotated && event.annotated_frames.length > 0
    ? event.annotated_frames
    : event.frames

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
    if (!currentFrames[frameIndex]) return
    const url = showAnnotated && event.annotated_frames.length
      ? api.getAnnotatedFrameUrl(event.event_id, currentFrames[frameIndex])
      : api.getFrameUrl(event.event_id, currentFrames[frameIndex])
    const a = document.createElement('a')
    a.href = url
    a.download = currentFrames[frameIndex]
    a.click()
  }, [event, frameIndex, currentFrames, showAnnotated])

  if (currentFrames.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center bg-muted rounded-lg text-xs text-muted-foreground">
        Ingen frames
      </div>
    )
  }

  const currentFrame = currentFrames[frameIndex]
  const frameUrl = showAnnotated && event.annotated_frames.length > 0
    ? api.getAnnotatedFrameUrl(event.event_id, currentFrame)
    : api.getFrameUrl(event.event_id, currentFrame)

  return (
    <div className="rounded-lg overflow-hidden border">
      <div className="relative">
        <img
          src={frameUrl}
          alt={`Frame ${frameIndex + 1}`}
          className="w-full object-contain max-h-[30svh] sm:max-h-56"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-white text-xs">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white hover:bg-white/20"
            disabled={frameIndex === 0}
            onClick={() => { setFrameIndex(i => i - 1); setPlaying(false) }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-white hover:bg-white/20"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <span>{frameIndex + 1} / {currentFrames.length}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-white hover:bg-white/20"
              onClick={handleDownload}
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white hover:bg-white/20"
            disabled={frameIndex === currentFrames.length - 1}
            onClick={() => { setFrameIndex(i => i + 1); setPlaying(false) }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {event.annotated_frames.length > 0 && (
        <div className="flex gap-1 p-1.5 border-t bg-muted/50">
          <Button
            variant={showAnnotated ? 'default' : 'outline'}
            size="xs"
            onClick={() => { setShowAnnotated(true); setFrameIndex(0); setPlaying(false) }}
          >
            Annotert
          </Button>
          <Button
            variant={!showAnnotated ? 'default' : 'outline'}
            size="xs"
            onClick={() => { setShowAnnotated(false); setFrameIndex(0); setPlaying(false) }}
          >
            Original
          </Button>
        </div>
      )}
    </div>
  )
}
