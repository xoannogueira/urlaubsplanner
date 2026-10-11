import clsx from 'clsx'
import { BookOpen, Check, Clock, ExternalLink, Globe, Heart, MapPin, Sparkles, Ticket } from 'lucide-react'
import { useState } from 'react'
import type { ActivitySuggestion } from '../../api/activities'
import { buttonClass } from '../../components/ui/buttonStyles'
import { categoryLabels, fameLabel, googleMapsUrl, openingHoursDe, ticketsUrl } from '../../lib/activities'
import { formatDistance } from '../../lib/geo'
import { CategoryIcon } from './CategoryIcon'

interface ActivityCardProps {
  activity: ActivitySuggestion
  saved: boolean
  saving: boolean
  selected: boolean
  onSelect: () => void
  onSave: () => void
}

export function ActivityCard({ activity: a, saved, saving, selected, onSelect, onSave }: ActivityCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const hours = openingHoursDe(a.openingHours)
  const fame = fameLabel(a.popularity)
  const tickets = ticketsUrl(a)

  return (
    <article
      data-activity-id={a.id}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 cursor-pointer overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-100 max-sm:flex-col',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent)]' : 'border-line hover:border-muted/50',
      )}
    >
      <div className="relative h-40 shrink-0 bg-surface-3 sm:h-auto sm:w-40">
        {a.imageUrl && !imageFailed ? (
          <img
            src={a.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted">
            <CategoryIcon category={a.category} size={30} strokeWidth={1.5} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold leading-snug">{a.name}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="flex items-center gap-1">
              <CategoryIcon category={a.category} size={13} />
              {categoryLabels[a.category].singular}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={13} />
              {formatDistance(a.distanceKm)}
            </span>
            {fame && (
              <span className="flex items-center gap-1 font-semibold text-star">
                <Sparkles size={13} />
                {fame}
              </span>
            )}
          </div>
        </div>

        {a.description && <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">{a.description}</p>}

        {(hours || a.freeEntry) && (
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {a.freeEntry && (
              <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-accent">
                <Check size={12} strokeWidth={3} />
                Eintritt frei
              </span>
            )}
            {hours && (
              <span className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-muted" title={a.openingHours ?? undefined}>
                <Clock size={12} />
                {hours}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {a.wikipediaUrl && (
            <a href={a.wikipediaUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
              <BookOpen size={14} />
              Wikipedia
            </a>
          )}
          <a href={googleMapsUrl(a)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
            Maps
            <ExternalLink size={14} />
          </a>
          {tickets && (
            <a
              href={tickets}
              target="_blank"
              rel="noopener noreferrer"
              title="Tickets und Führungen bei GetYourGuide suchen"
              className={buttonClass('secondary', 'sm')}
            >
              <Ticket size={14} />
              Tickets
            </a>
          )}
          {a.website && (
            <a
              href={a.website}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('ghost', 'sm')}
              aria-label={`Website von ${a.name}`}
            >
              <Globe size={14} />
            </a>
          )}
          <span className="flex-1" />
          {saved ? (
            <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
              <Check size={15} strokeWidth={3} />
              Gemerkt
            </span>
          ) : (
            <button type="button" onClick={onSave} disabled={saving} className={buttonClass('primary', 'sm')}>
              <Heart size={15} />
              Merken
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
