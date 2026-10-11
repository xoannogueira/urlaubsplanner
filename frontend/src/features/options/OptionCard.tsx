import clsx from 'clsx'
import { CalendarDays, ExternalLink, Heart, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { OptionStatus, Stage, TripOption } from '../../api/types'
import { StatusControl } from '../../components/StatusControl'
import { IconButton } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatDateRange, formatEuro, formatRelative, hostOf } from '../../lib/format'

interface OptionCardProps {
  option: TripOption
  stage?: Stage
  travelers: number
  onStatus: (status: OptionStatus) => void
  onEdit: () => void
  onDelete: () => void
  /** Auf der Karte ausgewählt. */
  selected?: boolean
  /** Klick auf die Karte (nicht auf Buttons/Links) wählt den Pin auf der Karte aus. */
  onSelect?: () => void
}

export function OptionCard({ option, stage, travelers, onStatus, onEdit, onDelete, selected, onSelect }: OptionCardProps) {
  const favorite = option.status === 'Favorite'
  const chosen = option.status === 'Selected' || option.status === 'Booked'
  const hasDates = option.startDate || option.endDate
  const location = displayLocation(option.title, option.locationName)

  return (
    <article
      data-option-id={option.id}
      onClick={(e) => {
        if (onSelect && !(e.target as HTMLElement).closest('button, a, input, select, textarea')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-100',
        onSelect && 'cursor-pointer',
        selected
          ? 'border-accent shadow-[0_0_0_3px_var(--accent)]'
          : chosen
            ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]'
            : 'border-line hover:border-muted/50',
      )}
    >
      {option.imageUrl && <CardImage src={option.imageUrl} />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-bold leading-snug">{option.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            {stage && <span>{stage.name}</span>}
            {location && (
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {location}
              </span>
            )}
            {hasDates && (
              <span className="flex items-center gap-1">
                <CalendarDays size={13} />
                {formatDateRange(option.startDate, option.endDate)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton label={`${option.title} bearbeiten`} onClick={onEdit} className="size-9">
            <Pencil size={15} />
          </IconButton>
          <IconButton label={`${option.title} löschen`} onClick={onDelete} className="size-9">
            <Trash2 size={15} />
          </IconButton>
          <IconButton
            label={favorite ? 'Favorit entfernen' : 'Als Favorit merken'}
            aria-pressed={favorite}
            active={favorite}
            onClick={() => onStatus(favorite ? 'Idea' : 'Favorite')}
          >
            <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
          </IconButton>
        </div>
      </div>

      {option.notes && <p className="line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">{option.notes}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-lg font-semibold">
            {option.totalPrice != null ? formatEuro(option.totalPrice) : 'Preis offen'}
          </span>
          <span className="text-xs text-muted">
            {option.price != null && option.pricePerPerson
              ? `${formatEuro(option.price)} p. P. × ${travelers}`
              : option.price != null
                ? 'Gesamtpreis'
                : 'noch kein Preis eingetragen'}
            {option.priceCheckedAt && ` · geprüft ${formatRelative(option.priceCheckedAt)}`}
          </span>
        </div>
        {option.url ? (
          <a href={option.url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
            {hostOf(option.url)}
            <ExternalLink size={14} />
          </a>
        ) : (
          <span className="text-xs text-muted">kein Link</span>
        )}
      </div>

      <StatusControl value={option.status} onChange={onStatus} label={`Status von ${option.title}`} />
    </article>
  )
}

/** "Hotel Miradouro, Lissabon, Portugal" bei Titel "Hotel Miradouro" → "Lissabon, Portugal". */
function displayLocation(title: string, location: string | null): string | null {
  if (!location) return null
  const t = title.trim().toLowerCase()
  const l = location.trim()
  if (l.toLowerCase() === t) return null
  return l.toLowerCase().startsWith(`${t}, `) ? l.slice(t.length + 2) : l
}

/** Foto aus der Hotelsuche; verschwindet still, wenn es nicht mehr geladen werden kann. */
function CardImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="-mx-4 -mt-4 mb-1 h-36 overflow-hidden rounded-t-2xl bg-surface-3">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </div>
  )
}
