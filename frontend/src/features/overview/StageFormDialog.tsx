import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Stage, StageInput } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField } from '../../components/ui/Field'

interface StageFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: StageInput) => Promise<unknown>
  stage?: Stage
  /** Vorschlag fürs Startdatum, z. B. das Ende der letzten Etappe. */
  suggestedStart?: string
}

export function StageFormDialog({ open, onClose, onSubmit, stage, suggestedStart }: StageFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stage ? 'Etappe bearbeiten' : 'Etappe hinzufügen'}
      description="Ein Ort mit Zeitraum, z. B. Lissabon vom 12. bis 16. Mai."
      width="sm"
    >
      {open && <StageForm key={stage?.id ?? 'new'} stage={stage} suggestedStart={suggestedStart} onSubmit={onSubmit} onClose={onClose} />}
    </Dialog>
  )
}

function StageForm({ stage, suggestedStart, onSubmit, onClose }: Omit<StageFormDialogProps, 'open'>) {
  const [name, setName] = useState(stage?.name ?? '')
  const [startDate, setStartDate] = useState(stage?.startDate ?? suggestedStart ?? '')
  const [endDate, setEndDate] = useState(stage?.endDate ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit({ name, startDate, endDate })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Unbekannter Fehler'))
    } finally {
      setPending(false)
    }
  }

  const fe = error?.fieldErrors ?? {}

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <InputField
        label="Ort"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Lissabon"
        required
        autoFocus
        error={fe.name}
      />
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Anreise"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
          error={fe.startDate}
        />
        <InputField
          label="Abreise"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          required
          error={fe.endDate}
        />
      </div>
      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {stage ? 'Speichern' : 'Hinzufügen'}
        </Button>
      </div>
    </form>
  )
}
