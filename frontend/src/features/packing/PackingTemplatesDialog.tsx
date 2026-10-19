import { Check, Download, Pencil, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { usePackingTemplateActions, usePackingTemplates, type PackingTemplate } from '../../api/packingTemplates'
import type { PackingList } from '../../api/types'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField } from '../../components/ui/Field'
import { templateItems } from '../../lib/packing'

interface Props {
  open: boolean
  list: PackingList
  onClose: () => void
  /** Vorlage in die Packliste dieser Reise übernehmen. */
  onApply: (template: PackingTemplate) => void
}

/** Packlisten-Vorlagen: aktuelle Liste speichern, eine Vorlage übernehmen, umbenennen oder löschen. */
export function PackingTemplatesDialog({ open, list, onClose, onApply }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Packlisten-Vorlagen"
      description="Speicher eine Packliste und übernimm sie in neue Reisen. Haken werden nicht mitgespeichert."
      width="lg"
    >
      {open && <TemplatesBody list={list} onApply={onApply} />}
    </Dialog>
  )
}

function TemplatesBody({ list, onApply }: Pick<Props, 'list' | 'onApply'>) {
  const templates = usePackingTemplates()
  const { save, rename, remove } = usePackingTemplateActions()
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const all = templates.data ?? []
  const overwrites = all.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const t = await save.mutateAsync({ name: name.trim(), items: templateItems(list) })
      setSaved(t.name)
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  const submitRename = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setError(null)
    try {
      await rename.mutateAsync(editing)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Umbenennen fehlgeschlagen.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3.5">
        <span className="text-sm font-bold">Diese Packliste als Vorlage speichern</span>
        {list.items.length === 0 ? (
          <span className="text-[13px] text-muted">Die Packliste ist noch leer.</span>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <InputField
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(null)
              }}
              placeholder="z. B. Strandurlaub"
              maxLength={80}
              className="min-w-[200px] flex-1"
              hint={overwrites ? `Ersetzt die Vorlage „${overwrites.name}“` : `${list.items.length} Einträge`}
            />
            <Button type="submit" variant="primary" disabled={!name.trim() || save.isPending}>
              {overwrites ? 'Ersetzen' : 'Speichern'}
            </Button>
          </div>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-[13px] text-accent">
            <Check size={14} /> „{saved}“ gespeichert
          </span>
        )}
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">Gespeicherte Vorlagen</span>
        {templates.isLoading ? (
          <span className="text-sm text-muted">Lädt …</span>
        ) : templates.error ? (
          <span className="text-sm text-danger">{templates.error.message}</span>
        ) : all.length === 0 ? (
          <span className="text-sm text-muted">Noch keine – speichere oben deine erste.</span>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {all.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                {editing?.id === t.id ? (
                  <form onSubmit={submitRename} className="flex flex-1 items-center gap-2">
                    <label className="sr-only" htmlFor={`rename-${t.id}`}>
                      Neuer Name
                    </label>
                    <input
                      id={`rename-${t.id}`}
                      value={editing.name}
                      onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                      maxLength={80}
                      autoFocus
                      className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 text-sm outline-none focus:border-accent"
                    />
                    <IconButton label="Namen speichern" className="size-8" type="submit">
                      <Check size={15} />
                    </IconButton>
                    <IconButton label="Abbrechen" className="size-8" onClick={() => setEditing(null)}>
                      <X size={15} />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-xs text-muted">{t.items.length} Einträge</span>
                    </span>
                    {confirmDelete === t.id ? (
                      <>
                        <span className="text-[13px] text-muted">Wirklich löschen?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void remove.mutateAsync(t.id).then(() => setConfirmDelete(null))}
                        >
                          Löschen
                        </Button>
                        <Button size="sm" onClick={() => setConfirmDelete(null)}>
                          Nein
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<Download size={14} />}
                          onClick={() => {
                            onApply(t)
                            setApplied(t.id)
                          }}
                        >
                          {applied === t.id ? 'Übernommen' : 'Übernehmen'}
                        </Button>
                        <IconButton
                          label={`${t.name} umbenennen`}
                          className="size-8"
                          onClick={() => setEditing({ id: t.id, name: t.name })}
                        >
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label={`${t.name} löschen`} className="size-8" onClick={() => setConfirmDelete(t.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FormError message={error} />
    </div>
  )
}
