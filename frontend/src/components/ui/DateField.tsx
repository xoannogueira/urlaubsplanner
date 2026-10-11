import { InputField } from './Field'

interface DateFieldProps {
  label: string
  value: string
  onValue: (value: string) => void
  /** Frühester/spätester wählbarer Tag (z. B. Reisebeginn/-ende) – Tage außerhalb sind im Kalender gesperrt. */
  min?: string | null
  max?: string | null
  /** Ist das Feld leer, springt der Kalender beim Anklicken zu diesem Tag (z. B. Reisebeginn) statt zu heute. */
  openAt?: string | null
  required?: boolean
  error?: string[]
  hint?: string
  className?: string
}

/**
 * Datumsfeld, das sich am Reisezeitraum orientiert. Liegt ein vorhandener Wert außerhalb der Grenzen
 * (z. B. alte Etappe nach Änderung der Reisedaten), werden die Grenzen nicht gesetzt – sonst ließe sich das
 * Formular nicht mehr speichern.
 */
export function DateField({ label, value, onValue, min, max, openAt, required, error, hint, className }: DateFieldProps) {
  const outside = Boolean(value && ((min && value < min) || (max && value > max)))
  return (
    <InputField
      label={label}
      type="date"
      value={value}
      min={!outside && min ? min : undefined}
      max={!outside && max ? max : undefined}
      onChange={(e) => onValue(e.target.value)}
      onPointerDown={() => {
        if (!value && openAt) onValue(openAt)
      }}
      required={required}
      error={error}
      hint={hint}
      className={className}
    />
  )
}
