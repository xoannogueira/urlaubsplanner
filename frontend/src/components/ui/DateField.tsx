import { useState } from 'react'
import { DateInput, TimeInput } from './DateInput'
import { FieldShell } from './Field'

interface DateFieldProps {
  label: string
  value: string
  onValue: (value: string) => void
  /** Frühester/spätester Tag im Kalender (z. B. Reisebeginn/-ende). */
  min?: string | null
  max?: string | null
  /** Ist das Feld leer, springt der Kalender zu diesem Tag (z. B. Reisebeginn) statt zu heute. */
  openAt?: string | null
  required?: boolean
  error?: string[]
  hint?: string
  className?: string
}

/**
 * Datumsfeld im deutschen Format (TT.MM.JJJJ) mit Kalender-Knopf. Der Kalender orientiert sich am Reisezeitraum;
 * liegt ein vorhandener Wert außerhalb (z. B. nach Änderung der Reisedaten), werden die Grenzen nicht gesetzt.
 */
export function DateField({ label, value, onValue, min, max, openAt, required, error, hint, className }: DateFieldProps) {
  const [textError, setTextError] = useState<string | null>(null)
  const outside = Boolean(value && ((min && value < min) || (max && value > max)))
  const errors = [...(textError ? [textError] : []), ...(error ?? [])]
  return (
    <FieldShell label={label} error={errors.length ? errors : undefined} hint={hint} className={className}>
      {(ids) => (
        <DateInput
          id={ids.id}
          describedBy={ids.describedBy}
          label={label}
          value={value}
          onValue={onValue}
          min={!outside ? min : null}
          max={!outside ? max : null}
          openAt={openAt}
          required={required}
          invalid={errors.length > 0}
          onTextError={setTextError}
        />
      )}
    </FieldShell>
  )
}

/** Uhrzeit-Feld (24 Stunden) mit Beschriftung. */
export function TimeField({
  label,
  value,
  onValue,
  className,
}: {
  label: string
  value: string
  onValue: (v: string) => void
  className?: string
}) {
  return (
    <FieldShell label={label} className={className}>
      {(ids) => <TimeInput id={ids.id} describedBy={ids.describedBy} value={value} onValue={onValue} />}
    </FieldShell>
  )
}
