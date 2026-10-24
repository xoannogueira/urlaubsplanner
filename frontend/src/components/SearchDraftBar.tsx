import { History, RotateCcw } from 'lucide-react'
import { Button } from './ui/Button'

/** „Auf Standard zurücksetzen“ – nur sichtbar, wenn man etwas geändert hat. */
export function DraftResetButton({ changed, onReset }: { changed: boolean; onReset: () => void }) {
  if (!changed) return null
  return (
    <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={onReset} title="Eigene Änderungen verwerfen">
      Auf Standard zurücksetzen
    </Button>
  )
}

/** Nach einem Neustart: die letzte Suche nicht von selbst starten (kostet evtl. eine Suche), sondern anbieten. */
export function RepeatLastSearch({ text, cost, onRepeat }: { text: string; cost?: string; onRepeat: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
      <History size={16} className="text-muted" aria-hidden="true" />
      <span className="flex-1 text-muted">{text}</span>
      <Button size="sm" variant="primary" onClick={onRepeat}>
        Letzte Suche wiederholen{cost ? ` (${cost})` : ''}
      </Button>
    </div>
  )
}
