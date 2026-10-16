import { CircleCheck, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ADJUST_EVENT, type TripAdjustment } from '../../api/flightAdjust'

/** Hinweis unten rechts, wenn die App die Reise an einen gewählten Flug angepasst hat – mit „Rückgängig“. */
export function AdjustToast({ tripId }: { tripId: string }) {
  const [current, setCurrent] = useState<TripAdjustment | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<TripAdjustment>).detail
      if (detail.tripId === tripId) setCurrent(detail)
    }
    window.addEventListener(ADJUST_EVENT, listener)
    return () => window.removeEventListener(ADJUST_EVENT, listener)
  }, [tripId])

  useEffect(() => {
    if (!current || busy) return
    const timer = window.setTimeout(() => setCurrent(null), 15_000)
    return () => window.clearTimeout(timer)
  }, [current, busy])

  if (!current) return null
  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-[0_12px_40px_rgb(0_0_0/0.35)]"
    >
      <CircleCheck size={18} className="mt-0.5 shrink-0 text-accent" />
      <span className="flex-1">{current.message}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          current
            .undo()
            .catch((e) => console.warn('Rückgängig:', e))
            .finally(() => {
              setBusy(false)
              setCurrent(null)
            })
        }}
        className="flex shrink-0 cursor-pointer items-center gap-1 font-bold text-accent hover:underline disabled:opacity-50"
      >
        <Undo2 size={14} />
        Rückgängig
      </button>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={() => setCurrent(null)}
        className="shrink-0 cursor-pointer text-muted hover:text-text"
      >
        <X size={16} />
      </button>
    </div>
  )
}
