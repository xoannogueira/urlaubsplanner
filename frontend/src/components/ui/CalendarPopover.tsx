import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { calendarWeeks, monthLabel, shiftMonth } from '../../lib/calendar'

interface CalendarPopoverProps {
  /** Element, unter dem der Kalender erscheint (das Datumsfeld) */
  anchor: HTMLElement
  value: string
  min?: string | null
  max?: string | null
  /** Monat, der ohne Wert gezeigt wird (z. B. Reisebeginn) */
  openAt?: string | null
  today: string
  onPick: (iso: string) => void
  onClose: () => void
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/**
 * Eigener Kalender auf Deutsch (Woche ab Montag) statt der Auswahl des Browsers – die bleibt z. B. in Safari nach
 * der Auswahl offen und zeigt die Sprache des Browsers. Schließt nach Auswahl, mit Escape und bei Klick daneben.
 */
export function CalendarPopover({ anchor, value, min, max, openAt, today, onPick, onClose }: CalendarPopoverProps) {
  const [month, setMonth] = useState(() => (value || openAt || today).slice(0, 7))
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Fest positioniert (auch in Dialogen mit Scrollbereich sichtbar); passt nach unten, sonst nach oben.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const height = ref.current?.offsetHeight ?? 320
      const width = ref.current?.offsetWidth ?? 296
      const below = r.bottom + 6 + height <= window.innerHeight
      setPos({
        top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height),
        left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  const weeks = calendarWeeks(month)
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Kalender"
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="z-[1000] w-[296px] rounded-2xl border border-line bg-surface p-3 text-text shadow-[0_16px_48px_rgb(0_0_0/0.35)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Voriger Monat"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-text"
        >
          <ChevronLeft size={17} />
        </button>
        <span className="text-sm font-extrabold" aria-live="polite">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          aria-label="Nächster Monat"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-text"
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[11px] font-bold text-muted" role="columnheader">
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          const selected = day.iso === value
          const ok = allowed(day.iso)
          return (
            <button
              key={day.iso}
              type="button"
              role="gridcell"
              disabled={!ok}
              aria-selected={selected}
              aria-label={day.label}
              onClick={() => onPick(day.iso)}
              className={clsx(
                'h-9 cursor-pointer rounded-lg font-mono text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-25',
                selected
                  ? 'bg-accent font-bold text-accent-ink'
                  : day.iso === today
                    ? 'font-bold text-accent ring-1 ring-accent/60 hover:bg-surface-3'
                    : day.inMonth
                      ? 'hover:bg-surface-3'
                      : 'text-muted/60 hover:bg-surface-3',
              )}
            >
              {day.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
