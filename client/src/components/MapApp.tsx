import { useState } from 'react'
import { MapContainer } from '@/components/MapContainer'
import { TopBar } from '@/components/TopBar'
import { RecordingOverlay } from '@/components/RecordingOverlay'
import { AnalysisToast } from '@/components/AnalysisToast'
import { TripPanel } from '@/components/TripPanel'

export function MapApp() {
  const [isRecording, setIsRecording] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)

  return (
    <div className="w-screen h-svh relative overflow-hidden">
      <MapContainer
        selectedTripId={selectedTripId}
        onSelectTrip={setSelectedTripId}
      />

      <TopBar
        onRecord={() => setIsRecording(true)}
        isAnalyzing={!!activeJobId}
      />

      {isRecording && (
        <RecordingOverlay
          onClose={() => setIsRecording(false)}
          onJobStarted={(jobId) => setActiveJobId(jobId)}
        />
      )}

      {activeJobId && (
        <AnalysisToast
          jobId={activeJobId}
          onDone={() => setActiveJobId(null)}
        />
      )}

      {selectedTripId && (
        <TripPanel
          tripId={selectedTripId}
          onClose={() => setSelectedTripId(null)}
        />
      )}
    </div>
  )
}
