import { Camera, Clock, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/SeverityBadge'
import { formatTimestamp } from '@/lib/utils'
import type { EventSummary } from '@/types/events'

interface EventCardProps {
  event: EventSummary
  onClick?: () => void
}

export function EventCard({ event, onClick }: EventCardProps) {
  const objectList = Object.entries(event.object_counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')

  return (
    <div onClick={onClick} className={onClick ? 'cursor-pointer' : undefined}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{event.event_id}</CardTitle>
          <SeverityBadge level={event.severity_level} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatTimestamp(event.start_time)}
          </div>
          <div className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            {event.num_frames} frames &middot; {event.source_video}
          </div>
          {objectList && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {objectList}
            </div>
          )}
          <div className="text-xs font-medium text-foreground">
            Score: {event.severity_score}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
