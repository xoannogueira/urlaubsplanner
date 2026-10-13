import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useSaveSerpApiKey, type SaveKeyResult } from '../../api/app'
import { ApiError } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { controlClass } from '../../components/ui/fieldStyles'

/** Key einfügen, bei SerpApi prüfen (kostenlos) und speichern. */
export function KeyForm({
  onSaved,
  submitLabel = 'Prüfen & speichern',
}: {
  onSaved: (result: SaveKeyResult) => void
  submitLabel?: string
}) {
  const [key, setKey] = useState('')
  const [visible, setVisible] = useState(false)
  const save = useSaveSerpApiKey()
  const error = save.error instanceof ApiError ? (save.error.fieldErrors.apiKey?.join(' ') ?? save.error.message) : null

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (key.trim()) save.mutate(key.trim(), { onSuccess: onSaved })
      }}
    >
      <label htmlFor="serpapi-key" className="text-[13px] font-bold text-muted">
        Dein SerpApi-Key
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-[1_1_320px]">
          <input
            id="serpapi-key"
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              if (save.isError) save.reset()
            }}
            placeholder="z. B. 3f9a…c21e (64 Zeichen)"
            aria-invalid={error ? true : undefined}
            aria-describedby="serpapi-key-msg"
            className={`${controlClass} w-full pr-11 font-mono text-[14px]`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Key verbergen' : 'Key anzeigen'}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-text"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Button type="submit" variant="primary" icon={<KeyRound size={16} />} disabled={!key.trim() || save.isPending}>
          {save.isPending ? 'Prüfe …' : submitLabel}
        </Button>
      </div>
      <span
        id="serpapi-key-msg"
        role={error ? 'alert' : undefined}
        className={error ? 'text-[13px] font-medium text-danger' : 'text-xs text-muted'}
      >
        {error ?? 'Der Key wird nur auf diesem Computer gespeichert und nie angezeigt oder weitergegeben.'}
      </span>
    </form>
  )
}
