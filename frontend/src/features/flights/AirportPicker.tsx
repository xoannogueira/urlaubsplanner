import clsx from 'clsx'
import { LoaderCircle, Plane, Plus, X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { useAirportSearch, type Airport } from '../../api/airports'
import { formatDistance } from '../../lib/geo'

export const MAX_AIRPORTS = 4

interface AirportPickerProps {
  label: string
  value: Airport[]
  onChange: (airports: Airport[]) => void
  /** Flughäfen in der Nähe (z. B. der Etappe) zum schnellen An-/Abwählen. */
  suggestions?: Airport[]
  /** z. B. „Nähe Lissabon“ */
  suggestionLabel?: string
  placeholder?: string
}

/**
 * Ein oder mehrere Flughäfen wählen: tippen (Code, Stadt, Name oder Ort wie „Lissabon“) oder Vorschläge
 * aus dem Umkreis antippen. Jeder zusätzliche Flughafen ist eine zusätzliche Suche.
 */
export function AirportPicker({ label, value, onChange, suggestions = [], suggestionLabel, placeholder }: AirportPickerProps) {
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const { data: results = [], isFetching } = useAirportSearch(text)

  const chosen = new Set(value.map((a) => a.code))
  const options = results.filter((a) => !chosen.has(a.code))
  const open = focused && text.trim().length >= 2
  const full = value.length >= MAX_AIRPORTS
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))

  const add = (airport: Airport) => {
    if (!chosen.has(airport.code) && !full) onChange([...value, airport])
    setText('')
    setActive(0)
  }
  const remove = (code: string) => onChange(value.filter((a) => a.code !== code))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && text === '' && value.length > 0) {
      remove(value[value.length - 1].code)
      return
    }
    if (!open || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((activeIndex + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((activeIndex - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      add(options[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setText('')
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-bold text-muted">
        {label}
      </label>
      <div className="relative">
        <div
          className={clsx(
            'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-surface-2 px-2 py-1.5',
            focused ? 'border-accent' : 'border-line',
          )}
        >
          {value.map((a) => (
            <span
              key={a.code}
              className="flex items-center gap-1 rounded-lg bg-accent-soft py-0.5 pl-2 pr-1 text-sm font-semibold text-accent"
            >
              <span className="font-mono">{a.code}</span>
              <span className="max-w-28 truncate font-normal text-text">{a.city || a.name}</span>
              <button
                type="button"
                aria-label={`${a.code} entfernen`}
                onClick={() => remove(a.code)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-surface-3"
              >
                <X size={13} />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options.length > 0 ? `${listId}-${activeIndex}` : undefined}
            value={text}
            disabled={full}
            onChange={(e) => {
              setText(e.target.value)
              setActive(0)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder={full ? `max. ${MAX_AIRPORTS}` : value.length === 0 ? (placeholder ?? 'Stadt oder Code') : 'weiterer …'}
            className="h-8 min-w-24 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          {isFetching && <LoaderCircle size={15} className="animate-spin text-muted" />}
        </div>
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`Flughäfen für ${label}`}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted">{isFetching ? 'Suche …' : 'Kein Flughafen gefunden.'}</li>
            ) : (
              options.map((a, i) => (
                <li
                  key={a.code}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  // mousedown statt click, damit das Feld den Fokus nicht vorher verliert
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(a)
                  }}
                  className={clsx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === activeIndex && 'bg-surface-3')}
                >
                  <Plane size={15} className="shrink-0 text-muted" />
                  <span className="w-10 shrink-0 font-mono text-sm font-bold">{a.code}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{a.city || a.name}</span>
                    <span className="truncate text-xs text-muted">
                      {a.name}
                      {a.near && a.distanceKm != null && ` · ${formatDistance(a.distanceKm)} von ${a.near}`}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={suggestionLabel ?? 'Flughäfen in der Nähe'}>
          {suggestionLabel && <span className="text-xs text-muted">{suggestionLabel}:</span>}
          {suggestions.map((a) => {
            const on = chosen.has(a.code)
            return (
              <button
                key={a.code}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                title={a.name}
                onClick={() => (on ? remove(a.code) : add(a))}
                className={clsx(
                  'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold enabled:cursor-pointer disabled:opacity-40',
                  on ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-3',
                )}
              >
                {!on && <Plus size={12} />}
                <span className="font-mono">{a.code}</span>
                {a.distanceKm != null && <span className="font-normal text-muted">{formatDistance(a.distanceKm)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
