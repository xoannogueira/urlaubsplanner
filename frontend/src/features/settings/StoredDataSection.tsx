import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDataActions, useStoredData } from '../../api/data'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Skeleton } from '../../components/ui/Feedback'
import { formatRelative } from '../../lib/format'

const DAYS = 30
const kb = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/**
 * Gespeicherte Preisdaten (Preisarchiv pro Strecke, Preiskalender): Was seit 30 Tagen nicht benutzt wurde, lässt sich
 * komprimiert auslagern – jederzeit zurückholen oder endgültig löschen.
 */
export function StoredDataSection() {
  const data = useStoredData()
  const { offload, restore, remove } = useDataActions()
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  // Zeitpunkt beim Öffnen der Einstellungen – reicht für „seit 30 Tagen“.
  const [now] = useState(() => Date.now())

  if (data.isPending) return <Skeleton className="h-32" />
  if (!data.data) return null
  const unused = data.data.stored.filter((d) => now - Date.parse(d.lastUsed) > DAYS * 86_400_000)

  return (
    <div className="flex flex-col gap-4">
      {data.data.stored.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Preisdaten gespeichert.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {data.data.stored.map((d) => {
            const old = now - Date.parse(d.lastUsed) > DAYS * 86_400_000
            return (
              <li key={`${d.kind}-${d.key}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{d.label}</span>
                  <span className="text-xs text-muted">
                    {d.entries} {d.kind === 'kalender' ? 'Tage' : 'Preise'} · zuletzt benutzt {formatRelative(d.lastUsed)}
                  </span>
                </span>
                {old && (
                  <span className="rounded-md bg-star/15 px-2 py-0.5 text-xs font-semibold text-star">
                    seit über {DAYS} Tagen ungenutzt
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          icon={<Archive size={15} />}
          disabled={unused.length === 0 || offload.isPending}
          onClick={() => offload.mutate(DAYS, { onSuccess: (r) => setResult(`${r.count} ausgelagert`) })}
        >
          {unused.length === 0 ? `Nichts seit ${DAYS} Tagen ungenutzt` : `${unused.length} ungenutzte auslagern`}
        </Button>
        {result && <span className="text-sm text-accent">{result}</span>}
      </div>

      {data.data.offloaded.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold">Ausgelagert</span>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {data.data.offloaded.map((o) => (
              <li key={o.name} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{o.label}</span>
                  <span className="text-xs text-muted">
                    {o.entries} Einträge · {kb(o.bytes)} · ausgelagert {formatRelative(o.offloadedAt)}
                  </span>
                </span>
                <Button size="sm" icon={<ArchiveRestore size={14} />} disabled={restore.isPending} onClick={() => restore.mutate(o.name)}>
                  Zurückholen
                </Button>
                <IconButton label={`${o.label} endgültig löschen`} className="size-8" onClick={() => setToDelete(o.name)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="Endgültig löschen?"
        message="Die ausgelagerten Preisdaten werden gelöscht und lassen sich nicht zurückholen."
        confirmLabel="Löschen"
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete)
          setToDelete(null)
        }}
      />
    </div>
  )
}
