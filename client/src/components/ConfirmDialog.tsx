import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({ trigger, title, description, confirmLabel = 'Slett', onConfirm }: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <span onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        {trigger}
      </span>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => !loading && setOpen(false)} />

          {/* Dialog */}
          <div className="relative bg-background rounded-lg shadow-xl border p-6 w-[90vw] max-w-sm mx-4 animate-in zoom-in-95 duration-150">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Avbryt
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Sletter...' : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
