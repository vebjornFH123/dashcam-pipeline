import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, AlertTriangle, X } from 'lucide-react'
import { useJobStatus } from '@/hooks/useJobStatus'
import { Button } from '@/components/ui/button'

interface AnalysisToastProps {
  jobId: string
  onDone: () => void
}

export function AnalysisToast({ jobId, onDone }: AnalysisToastProps) {
  const { job, error } = useJobStatus(jobId)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (job?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['trips-geojson'] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    }
  }, [job?.status, queryClient])

  const isComplete = job?.status === 'complete'
  const isError = job?.status === 'error' || !!error

  return (
    <div className="absolute bottom-6 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-20">
      <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-4">
        <div className="flex items-start gap-3">
          {isComplete ? (
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          ) : isError ? (
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {isComplete ? 'Analyse ferdig' : isError ? 'Analyse feilet' : 'Analyserer...'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {error || job?.progress_message || 'Starter...'}
            </p>
            {isComplete && job && (
              <p className="text-xs text-muted-foreground mt-1">
                {job.events_count} hendelser funnet
              </p>
            )}
          </div>

          {(isComplete || isError) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDone}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
