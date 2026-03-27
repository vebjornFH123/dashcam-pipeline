import { Badge } from '@/components/ui/badge'
import { cn, severityColor } from '@/lib/utils'

const labels: Record<string, string> = {
  critical: 'Kritisk',
  high: 'Høy',
  medium: 'Middels',
  low: 'Lav',
}

export function SeverityBadge({ level }: { level: string }) {
  return (
    <Badge className={cn(severityColor(level), 'text-xs')}>
      {labels[level] ?? level}
    </Badge>
  )
}
