import { Archive, ArchiveRestore, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useDataActions, useStoredData, type OffloadedData, type StoredData } from '../../api/data'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Skeleton } from '../../components/ui/Feedback'
import { formatRelative } from '../../lib/format'
import { isUnused, storedId, UNUSED_DAYS, unusedExtras } from '../../lib/storedData'

const kb = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
const records = (n: number) => (n === 1 ? '1 Datensatz' : `${n} Datensätze`)

/**
 * Gespeicherte Preisdaten (Preisarchiv pro Strecke, Preiskalender): Was seit 30 Tagen nicht benutzt wurde, lässt sich
 * komprimiert auslagern und zurückholen. Ausgewähltes lässt sich jederzeit endgültig löschen – auf Wunsch samt allem,
 * was seit 30 Tagen ungenutzt ist.
 */
export function StoredDataSection() {
  const data = useStoredData()
  const { offload, restore, deleteSelected } = useDataActions()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  // Zeitpunkt beim Öffnen der Einstellungen – reicht für „seit 30 Tagen“.
  const [now] = useState(() => Date.now())

  if (data.isPending) return <Skeleton className="h-32" />
  if (!data.data) return null
  const { stored, offloaded } = data.data
  const unused = stored.filter((d) => isUnused(d.lastUsed, now))
  // Nur Auswahl, die es noch gibt (nach Auslagern oder Zurückholen ändern sich die Listen).
  const ids = new Set([...stored.map(storedId), ...offloaded.map((o) => o.name)])
  const chosen = [...selected].filter((id) => ids.has(id))
  const extras = unusedExtras(stored, offloaded, selected, now)

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const remove = (withUnused: boolean) =>
    deleteSelected.mutate(
      {
        stored: chosen.filter((id) => stored.some((d) => storedId(d) === id)),
        offloaded: chosen.filter((id) => offloaded.some((o) => o.name === id)),
        unusedDays: withUnused ? UNUSED_DAYS : null,
      },
      {
        onSuccess: (r) => {
          setResult(`${records(r.count)} gelöscht`)
          setSelected(new Set())
          setConfirming(false)
        },
      },
    )

  return (
    <div className="flex flex-col gap-4">
      {stored.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Preisdaten gespeichert.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {stored.map((d) => (
            <Row
              key={storedId(d)}
              id={storedId(d)}
              label={d.label}
              meta={`${d.entries} ${d.kind === 'kalender' ? 'Tage' : 'Preise'} · zuletzt benutzt ${formatRelative(d.lastUsed)}`}
              old={isUnused(d.lastUsed, now)}
              checked={selected.has(storedId(d))}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          icon={<Archive size={15} />}
          disabled={unused.length === 0 || offload.isPending}
          onClick={() => offload.mutate(UNUSED_DAYS, { onSuccess: (r) => setResult(`${r.count} ausgelagert`) })}
        >
          {unused.length === 0 ? `Nichts seit ${UNUSED_DAYS} Tagen ungenutzt` : `${unused.length} ungenutzte auslagern`}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={15} />}
          disabled={chosen.length === 0 && extras.length === 0}
          onClick={() => setConfirming(true)}
        >
          {chosen.length > 0 ? `Auswahl löschen (${chosen.length})` : 'Löschen …'}
        </Button>
        {result && (
          <span role="status" className="text-sm text-accent">
            {result}
          </span>
        )}
      </div>

      {offloaded.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold">Ausgelagert</span>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {offloaded.map((o) => (
              <Row
                key={o.name}
                id={o.name}
                label={o.label}
                meta={`${o.entries} Einträge · ${kb(o.bytes)} · ausgelagert ${formatRelative(o.offloadedAt)}`}
                old={isUnused(o.offloadedAt, now)}
                checked={selected.has(o.name)}
                onToggle={toggle}
              >
                <Button size="sm" icon={<ArchiveRestore size={14} />} disabled={restore.isPending} onClick={() => restore.mutate(o.name)}>
                  Zurückholen
                </Button>
              </Row>
            ))}
          </ul>
        </div>
      )}

      {confirming && (
        <DeleteDialog
          chosen={[...stored.filter((d) => selected.has(storedId(d))), ...offloaded.filter((o) => selected.has(o.name))]}
          extras={extras}
          pending={deleteSelected.isPending}
          error={deleteSelected.error?.message ?? null}
          onClose={() => setConfirming(false)}
          onConfirm={remove}
        />
      )}
    </div>
  )
}

function Row({
  id,
  label,
  meta,
  old,
  checked,
  onToggle,
  children,
}: {
  id: string
  label: string
  meta: string
  old: boolean
  checked: boolean
  onToggle: (id: string, on: boolean) => void
  children?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-sm">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(id, e.target.checked)} className="size-4 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{label}</span>
          <span className="text-xs text-muted">{meta}</span>
        </span>
      </label>
      {old && (
        <span className="rounded-md bg-star/15 px-2 py-0.5 text-xs font-semibold text-star">seit über {UNUSED_DAYS} Tagen ungenutzt</span>
      )}
      {children}
    </li>
  )
}

/** Bestätigen vor dem endgültigen Löschen – mit der Wahl, Ungenutztes mitzulöschen (nur wenn es welches gibt). */
function DeleteDialog({
  chosen,
  extras,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  chosen: (StoredData | OffloadedData)[]
  extras: { label: string }[]
  pending: boolean
  error: string | null
  onClose: () => void
  onConfirm: (withUnused: boolean) => void
}) {
  // Ist nichts ausgewählt, geht es nur um das Ungenutzte – dann ist es vorausgewählt.
  const [withUnused, setWithUnused] = useState(chosen.length === 0)
  const total = chosen.length + (withUnused ? extras.length : 0)
  return (
    <Dialog
      open
      onClose={onClose}
      title="Preisdaten endgültig löschen?"
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="destructive" disabled={pending || total === 0} onClick={() => onConfirm(withUnused)}>
            {pending ? 'Löscht …' : `${records(total)} löschen`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {chosen.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Ausgewählt:</span>
            <ul className="list-disc pl-5 text-muted">
              {chosen.map((c, i) => (
                <li key={i}>{c.label}</li>
              ))}
            </ul>
          </div>
        )}
        {extras.length > 0 && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
            <input
              type="checkbox"
              checked={withUnused}
              onChange={(e) => setWithUnused(e.target.checked)}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">
                Auch {records(extras.length)} mitlöschen, die seit über {UNUSED_DAYS} Tagen ungenutzt {extras.length === 1 ? 'ist' : 'sind'}
              </span>
              <span className="text-xs text-muted">{extras.map((e) => e.label).join(' · ')}</span>
            </span>
          </label>
        )}
        <p className="flex items-start gap-2 font-semibold text-danger">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Gelöschte Daten lassen sich nicht zurückholen. Wer sie nur aus dem Weg haben will, lagert sie besser aus.
        </p>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
