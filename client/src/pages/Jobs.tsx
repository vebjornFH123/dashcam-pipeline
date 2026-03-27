import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, Loader2, AlertTriangle, FileVideo, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/api/client'
import { useJobStatus } from '@/hooks/useJobStatus'
import { formatTimestamp } from '@/lib/utils'
import type { Job } from '@/types/events'

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'queued': return <Clock className="h-4 w-4 text-muted-foreground" />
    case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    case 'complete': return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'error': return <AlertTriangle className="h-4 w-4 text-destructive" />
    default: return null
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'I kø'
    case 'processing': return 'Analyserer'
    case 'complete': return 'Ferdig'
    case 'error': return 'Feil'
    default: return status
  }
}

function statusVariant(status: string) {
  switch (status) {
    case 'complete': return 'default' as const
    case 'error': return 'destructive' as const
    default: return 'secondary' as const
  }
}

function ActiveJobCard({ job: initialJob }: { job: Job }) {
  const { job: liveJob } = useJobStatus(
    initialJob.status === 'queued' || initialJob.status === 'processing' ? initialJob.id : null
  )
  const queryClient = useQueryClient()
  const job = liveJob ?? initialJob

  useEffect(() => {
    if (liveJob?.status === 'complete' || liveJob?.status === 'error') {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }
  }, [liveJob?.status, queryClient])

  return <JobCard job={job} />
}

function JobCard({ job }: { job: Job }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <StatusIcon status={job.status} />
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm truncate">{job.filename}</CardTitle>
        </div>
        <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{job.progress_message}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTimestamp(job.created_at)}</span>
          {job.events_count > 0 && (
            <span>{job.events_count} hendelser</span>
          )}
        </div>
        {job.status === 'complete' && job.events_count > 0 && (
          <Link to="/events">
            <Button variant="outline" size="sm" className="mt-1 w-full">
              Se hendelser <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </Link>
        )}
        {job.error && (
          <p className="text-xs text-destructive">{job.error}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function Jobs() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.getJobs(),
    refetchInterval: 5000,
  })

  const jobs = data?.jobs ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analyser</h1>
          <p className="text-muted-foreground">{jobs.length} jobber</p>
        </div>
        <Link to="/new">
          <Button>
            <FileVideo className="mr-2 h-4 w-4" />
            Ny analyse
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileVideo className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Ingen analyser ennå. Last opp en video for å komme i gang.
            </p>
            <Link to="/new">
              <Button className="mt-4">Ny analyse</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {jobs.map((job) => {
          const isActive = job.status === 'queued' || job.status === 'processing'
          const isHighlighted = job.id === highlightId

          return (
            <div
              key={job.id}
              className={isHighlighted ? 'ring-2 ring-primary rounded-xl' : ''}
            >
              {isActive ? <ActiveJobCard job={job} /> : <JobCard job={job} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
