import { useState } from 'react'
import { MapContainer } from '@/components/MapContainer'
import { TopBar } from '@/components/TopBar'
import { RecordingOverlay } from '@/components/RecordingOverlay'
import { AnalysisToast } from '@/components/AnalysisToast'
import { EventSidebar } from '@/components/EventSidebar'
import { TripPanel } from '@/components/TripPanel'

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

      {/* Sidebar: show TripPanel when trip selected, otherwise EventSidebar */}
      {!isRecording && (
        selectedTripId ? (
          <TripPanel
            tripId={selectedTripId}
            onClose={() => setSelectedTripId(null)}
            onSelectEvent={setSelectedEventId}
          />
        ) : (
          <EventSidebar
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onSelectTrip={setSelectedTripId}
            onRecord={() => setIsRecording(true)}
          />
        )
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
          onTripReady={(tripId) => setSelectedTripId(tripId)}
        />
      )}
    </div>
  )
}
