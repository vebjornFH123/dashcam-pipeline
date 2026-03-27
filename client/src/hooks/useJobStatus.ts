import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { Job } from '@/types/events'

export function useJobStatus(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return

    const url = api.getJobStreamUrl(jobId)
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Job
        if ('error' in data && !data.status) {
          setError((data as unknown as { error: string }).error)
          eventSource.close()
          return
        }
        setJob(data)
        if (data.status === 'complete' || data.status === 'error') {
          eventSource.close()
        }
      } catch {
        setError('Kunne ikke parse jobb-status')
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      // Fallback: single fetch
      api.getJob(jobId).then(setJob).catch(() => setError('Mistet tilkobling'))
    }

    return () => eventSource.close()
  }, [jobId])

  return { job, error }
}
