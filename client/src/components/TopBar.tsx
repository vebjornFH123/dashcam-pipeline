import { Video } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  onRecord: () => void
  isAnalyzing: boolean
}

export function TopBar({ onRecord, isAnalyzing }: TopBarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="pointer-events-auto rounded-lg bg-background/80 backdrop-blur-sm px-3 py-1.5 shadow-md border">
          <h1 className="text-sm font-bold tracking-tight">Dashcam Analytics</h1>
        </div>

        <Button
          onClick={onRecord}
          disabled={isAnalyzing}
          className="pointer-events-auto rounded-full shadow-lg gap-2"
          size="lg"
        >
          <Video className="h-5 w-5" />
          Ta opp
        </Button>
      </div>
    </div>
  )
}
