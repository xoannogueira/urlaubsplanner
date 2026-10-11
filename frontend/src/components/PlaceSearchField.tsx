import clsx from 'clsx'
import { Building2, Landmark, LoaderCircle, MapPin, MapPinOff, Plane } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { usePlaceSearch } from '../api/places'
import type { LatLng, Place } from '../api/types'
import { FieldShell } from './ui/Field'
import { controlClass } from './ui/fieldStyles'

interface PlaceSearchFieldProps {
  label: string
  /** Text im Feld. */
  value: string
  /** Gespeicherte Koordinaten; null = Ort ist (noch) nicht auf der Karte. */
  coordinates: LatLng | null
  onTextChange: (text: string) => void
  onPick: (place: Place) => void
  /** Ergebnisse in der Nähe bevorzugen (z. B. Koordinaten der Etappe). */
  near?: LatLng | null
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
  error?: string[]
  className?: string
  /** Was nach der Auswahl im Feld steht: der kurze Name ("Lissabon") oder die ganze Adresse. */
  fillWith?: 'name' | 'label'
}

const typeIcons: Record<string, ReactNode> = {
  hotel: <Building2 size={16} />,
  airport: <Plane size={16} />,
  attraction: <Landmark size={16} />,
}

/**
 * Eingabefeld mit Ortsvorschlägen (Combobox nach ARIA-Muster).
 * Wird ein Vorschlag gewählt, werden Name und Koordinaten übernommen; tippt man danach weiter,
 * gelten die Koordinaten nicht mehr – so landet nie ein falscher Pin auf der Karte.
 */
export function PlaceSearchField({
  label,
  value,
  coordinates,
  onTextChange,
  onPick,
  near,
  placeholder,
  required,
  autoFocus,
  error,
  className,
  fillWith = 'name',
}: PlaceSearchFieldProps) {
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  // Nach einer Auswahl erst wieder suchen, wenn der Nutzer weitertippt.
  const [pickedText, setPickedText] = useState<string | null>(coordinates ? value : null)

  const query = pickedText === value ? '' : value
  const { data: places = [], isFetching, isError } = usePlaceSearch(query, near)
  const open = focused && query.trim().length >= 2
  const activeIndex = Math.min(active, Math.max(places.length - 1, 0))

  const pick = (place: Place) => {
    setPickedText(place[fillWith])
    onPick(place)
    setActive(0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === 'Escape') {
      // Nur die Vorschlagsliste schließen, nicht den Dialog (das native <dialog> reagiert nur auf preventDefault).
      e.preventDefault()
      e.stopPropagation()
      setPickedText(value)
      return
    }
    if (places.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((activeIndex + 1) % places.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((activeIndex - 1 + places.length) % places.length)
    } else if (e.key === 'Enter') {
      e.preventDefault() // sonst wird das Formular abgeschickt
      pick(places[activeIndex])
    }
  }

  return (
    <FieldShell label={label} error={error} className={className}>
      {(ids) => (
        <div className="relative">
          <input
            id={ids.id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && places.length > 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={ids.describedBy}
            aria-invalid={error?.length ? true : undefined}
            className={clsx(controlClass, 'pr-10')}
            value={value}
            placeholder={placeholder}
            required={required}
            autoFocus={autoFocus}
            onChange={(e) => {
              onTextChange(e.target.value)
              setActive(0)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" aria-hidden="true">
            {isFetching ? (
              <LoaderCircle size={16} className="animate-spin text-muted" />
            ) : coordinates ? (
              <MapPin size={16} className="text-accent" />
            ) : (
              <MapPinOff size={16} className="text-muted/60" />
            )}
          </span>

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`Vorschläge für ${label}`}
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-2xl"
            >
              {places.map((place, index) => (
                <li
                  key={`${place.label}-${place.latitude}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(place)}
                  onMouseEnter={() => setActive(index)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                    index === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="text-muted">{typeIcons[place.type ?? ''] ?? <MapPin size={16} />}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-bold">{place.name}</span>
                    <span className="truncate text-xs text-muted">{place.label}</span>
                  </span>
                </li>
              ))}
              {places.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted" aria-live="polite">
                  {isError
                    ? 'Ortssuche gerade nicht erreichbar – du kannst den Namen trotzdem speichern.'
                    : isFetching
                      ? 'Suche …'
                      : 'Keine Treffer'}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </FieldShell>
  )
}

export function MapHint({ coordinates }: { coordinates: LatLng | null }) {
  return (
    <span className={clsx('flex items-center gap-1.5 text-xs', coordinates ? 'text-accent' : 'text-muted')}>
      {coordinates ? <MapPin size={13} /> : <MapPinOff size={13} />}
      {coordinates ? 'Erscheint auf der Karte' : 'Vorschlag aus der Liste wählen, damit es auf der Karte erscheint'}
    </span>
  )
}
