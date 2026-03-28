import { useState } from 'react'
import { MapContainer } from '@/components/MapContainer'
import { TopBar } from '@/components/TopBar'
import { RecordingOverlay } from '@/components/RecordingOverlay'
import { AnalysisToast } from '@/components/AnalysisToast'
import { EventSidebar } from '@/components/EventSidebar'

export function MapApp() {
  const [isRecording, setIsRecording] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  return (
    <div className="w-screen h-svh relative overflow-hidden">
      <MapContainer
        selectedTripId={selectedTripId}
        onSelectTrip={setSelectedTripId}
        selectedEventId={selectedEventId}
        onSelectEvent={setSelectedEventId}
      />

      <TopBar
        onRecord={() => setIsRecording(true)}
        isAnalyzing={!!activeJobId}
      />

      {!isRecording && (
        <EventSidebar
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
        />
      )}

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
    </div>
  )
}
