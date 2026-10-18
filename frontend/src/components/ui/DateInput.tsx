import clsx from 'clsx'
import { CalendarDays } from 'lucide-react'
import { useCallback, useState } from 'react'
import { isoToGerman, maskGermanDate, parseGermanDate, parseTime } from '../../lib/dateInput'
import { todayIso } from '../../lib/format'
import { CalendarPopover } from './CalendarPopover'
import { controlClass } from './fieldStyles'

interface DateInputProps {
  id?: string
  value: string
  onValue: (iso: string) => void
  min?: string | null
  max?: string | null
  /** Ist das Feld leer, öffnet der Kalender bei diesem Tag (z. B. Reisebeginn). */
  openAt?: string | null
  required?: boolean
  label?: string
  describedBy?: string
  invalid?: boolean
  /** Meldet, ob der getippte Text kein gültiges Datum ist. */
  onTextError?: (message: string | null) => void
  className?: string
}

const DATE_ERROR = 'Bitte als TT.MM.JJJJ eingeben, z. B. 19.02.2027.'

/**
 * Datum im deutschen Format TT.MM.JJJJ – egal, welche Sprache der Browser hat. Tippen geht frei
 * (Punkte werden ergänzt), der Kalender-Knopf öffnet die Auswahl des Browsers.
 */
export function DateInput({
  id,
  value,
  onValue,
  min,
  max,
  openAt,
  required,
  label,
  describedBy,
  invalid,
  onTextError,
  className,
}: DateInputProps) {
  const [text, setText] = useState(isoToGerman(value))
  const [shown, setShown] = useState(value)
  const [error, setError] = useState(false)
  const [calendar, setCalendar] = useState<{ today: string; anchor: HTMLElement } | null>(null)
  const closeCalendar = useCallback(() => setCalendar(null), [])
  // Wert von außen geändert (z. B. Kalender, Vorbelegung): Text nachziehen.
  if (value !== shown) {
    setShown(value)
    setText(isoToGerman(value))
    setError(false)
  }

  const report = (bad: boolean) => {
    setError(bad)
    onTextError?.(bad ? DATE_ERROR : null)
  }
  const commit = (raw: string, final: boolean) => {
    if (raw.trim() === '') {
      setShown('')
      onValue('')
      report(false)
      return
    }
    // Während des Tippens erst übernehmen, wenn das Jahr vollständig ist.
    const complete = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(raw) || /^\d{8}$/.test(raw)
    if (!final && !complete) return
    // Ohne Jahr („19.02.“): Jahr der Reise bzw. des bisherigen Werts, sonst das aktuelle.
    const yearHint = Number((value || openAt || min || '').slice(0, 4)) || new Date().getFullYear()
    const iso = parseGermanDate(raw, yearHint)
    if (iso) {
      setShown(iso)
      onValue(iso)
      if (final) setText(isoToGerman(iso))
      report(false)
    } else if (final) {
      report(true)
    }
  }

  return (
    <div className={clsx('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="TT.MM.JJJJ"
        aria-label={id ? undefined : (label ?? 'Datum')}
        aria-describedby={describedBy}
        aria-invalid={invalid || error ? true : undefined}
        required={required}
        value={text}
        onChange={(e) => {
          const next = maskGermanDate(text, e.target.value)
          setText(next)
          commit(next, false)
        }}
        onBlur={() => commit(text, true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text, true)
        }}
        className={clsx(controlClass, 'pr-11 font-mono tabular-nums')}
      />
      <button
        type="button"
        aria-label={`${label ?? 'Datum'}: Kalender öffnen`}
        aria-expanded={calendar !== null}
        title="Kalender öffnen"
        onClick={(e) => {
          const anchor = e.currentTarget.parentElement!
          setCalendar((c) => (c ? null : { today: todayIso(), anchor }))
        }}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-text"
      >
        <CalendarDays size={17} />
      </button>
      {calendar && (
        <CalendarPopover
          anchor={calendar.anchor}
          value={value}
          min={min}
          max={max}
          openAt={openAt}
          today={calendar.today}
          onClose={closeCalendar}
          onPick={(iso) => {
            setShown(iso)
            setText(isoToGerman(iso))
            onValue(iso)
            report(false)
            setCalendar(null)
          }}
        />
      )}
    </div>
  )
}

interface TimeInputProps {
  id?: string
  /** "HH:MM" */
  value: string
  onValue: (value: string) => void
  label?: string
  describedBy?: string
  className?: string
}

/** Uhrzeit im 24-Stunden-Format, egal welche Sprache der Browser hat: „8“, „0830“, „8.30“ werden zu 08:00/08:30. */
export function TimeInput({ id, value, onValue, label, describedBy, className }: TimeInputProps) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  const [error, setError] = useState(false)
  if (value !== shown) {
    setShown(value)
    setText(value)
    setError(false)
  }
  const commit = (final: boolean, raw = text) => {
    if (raw.trim() === '' && final) {
      setText(value)
      return
    }
    const parsed = /^\d{1,2}:\d{2}$/.test(raw) || final ? parseTime(raw) : null
    if (parsed) {
      setShown(parsed)
      onValue(parsed)
      if (final) setText(parsed)
      setError(false)
    } else if (final) {
      setError(true)
    }
  }
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      aria-label={id ? undefined : (label ?? 'Uhrzeit')}
      aria-describedby={describedBy}
      aria-invalid={error || undefined}
      title={error ? 'Bitte als HH:MM eingeben, z. B. 08:30' : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        commit(false, e.target.value)
      }}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(true)
      }}
      // Breite bestimmt der Aufrufer (sonst volle Breite wie andere Felder)
      className={clsx(controlClass.replace('w-full ', ''), 'font-mono tabular-nums', className ?? 'w-full')}
    />
  )
}
