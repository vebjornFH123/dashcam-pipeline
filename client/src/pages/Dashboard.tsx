import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Camera, Activity, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EventCard } from '@/components/EventCard'
import { api } from '@/api/client'

function StatCard({ title, value, icon: Icon, description }: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.getEvents(),
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-2 text-sm text-destructive">Kunne ikke laste data. Sjekk at backend kjører.</p>
      </div>
    )
  }

  const events = data?.events ?? []
  const criticalCount = events.filter(e => e.severity_level === 'critical').length
  const highCount = events.filter(e => e.severity_level === 'high').length
  const avgScore = events.length > 0
    ? Math.round(events.reduce((s, e) => s + e.severity_score, 0) / events.length)
    : 0
  const totalFrames = events.reduce((s, e) => s + e.num_frames, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Oversikt over dashcam-hendelser</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Totalt hendelser"
          value={events.length}
          icon={Camera}
          description="Detekterte hendelser"
        />
        <StatCard
          title="Kritisk / Høy"
          value={`${criticalCount} / ${highCount}`}
          icon={AlertTriangle}
          description="Krever oppmerksomhet"
        />
        <StatCard
          title="Gj.snitt score"
          value={avgScore}
          icon={TrendingUp}
          description="Alvorlighetsscore (0-100)"
        />
        <StatCard
          title="Totalt frames"
          value={totalFrames}
          icon={Activity}
          description="Analyserte bilder"
        />
      </div>

      {/* Severity distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alvorlighetsfordeling</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 h-8">
            {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
              const count = events.filter(e => e.severity_level === level).length
              const pct = events.length > 0 ? (count / events.length) * 100 : 0
              const colors = {
                critical: 'bg-red-500',
                high: 'bg-orange-500',
                medium: 'bg-yellow-500',
                low: 'bg-green-500',
              }
              const labels = { critical: 'Kritisk', high: 'Høy', medium: 'Middels', low: 'Lav' }
              if (count === 0) return null
              return (
                <div
                  key={level}
                  className={`${colors[level]} rounded flex items-center justify-center text-xs font-medium text-white`}
                  style={{ width: `${pct}%`, minWidth: 40 }}
                  title={`${labels[level]}: ${count}`}
                >
                  {count}
                </div>
              )
            })}
            {events.length === 0 && (
              <div className="flex items-center text-sm text-muted-foreground">Ingen hendelser ennå</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent events */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Siste hendelser</h2>
        {events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 font-medium">Ingen hendelser ennå</p>
              <p className="mt-1 text-sm text-muted-foreground">Last opp en video eller ta opp med kameraet for å komme i gang</p>
              <a href="/new" className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Ny analyse
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.slice(0, 9).map((event) => (
              <EventCard key={event.event_id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
