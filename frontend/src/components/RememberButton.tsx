import { Check, Pin } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/Button'

/** „Als Standard merken“: speichert die aktuellen Sucheingaben als Voreinstellung dieser Reise. */
export function RememberButton({
  onRemember,
  label = 'Als Standard für diese Reise merken',
}: {
  onRemember: () => Promise<unknown>
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={state === 'done' ? <Check size={14} /> : <Pin size={14} />}
      disabled={state === 'busy'}
      title="Beim nächsten Öffnen ist die Suche schon so ausgefüllt"
      onClick={() => {
        setState('busy')
        onRemember()
          .then(() => setState('done'))
          .catch(() => setState('error'))
      }}
    >
      {state === 'done' ? 'Gemerkt' : state === 'error' ? 'Nicht gespeichert – nochmal' : label}
    </Button>
  )
}
