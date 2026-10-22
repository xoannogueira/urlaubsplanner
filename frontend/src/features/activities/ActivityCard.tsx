import clsx from 'clsx'
import { BookOpen, Check, Clock, ExternalLink, Globe, Heart, Leaf, MapPin, Phone, Route, Sparkles, Star, Ticket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useActivityPhoto, type ActivitySuggestion } from '../../api/activities'
import { buttonClass } from '../../components/ui/buttonStyles'
import { categoryLabels, fameLabel, googleMapsUrl, googleReviewsUrl, isFood, openingHoursDe, ticketsUrl } from '../../lib/activities'
import { formatDistance } from '../../lib/geo'
import { CategoryIcon } from './CategoryIcon'

interface ActivityCardProps {
  activity: ActivitySuggestion
  saved: boolean
  saving: boolean
  selected: boolean
  onSelect: () => void
  /** Mit nachgeladenem Foto, falls der Vorschlag selbst keins hatte */
  onSave: (photo: string | null) => void
  /** Google-Maps-Route vom ausgewählten Hotel der Etappe (null = noch kein Hotel). */
  routeFromHotel?: { url: string; hotel: string } | null
}

export function ActivityCard({ activity: a, saved, saving, selected, onSelect, onSave, routeFromHotel }: ActivityCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || a.imageUrl || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [a.imageUrl])
  const fallback = useActivityPhoto(a, visible).data?.url ?? null
  const image = a.imageUrl ?? fallback
  const hours = openingHoursDe(a.openingHours)
  const fame = fameLabel(a.popularity)
  const tickets = ticketsUrl(a)

  return (
    <article
      ref={ref}
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
        {image && !imageFailed ? (
          <img
            src={image}
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
        {(a.cuisine || a.diet) && (
          <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
            {a.cuisine && <span className="font-semibold">{a.cuisine}</span>}
            {a.diet && (
              <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                <Leaf size={12} />
                {a.diet}
              </span>
            )}
          </p>
        )}

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
          {isFood(a) ? (
            <a
              href={googleReviewsUrl(a)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'sm')}
              title="Öffnet Google Maps mit Bewertungen und Fotos"
            >
              <Star size={14} />
              Bewertungen (Google)
            </a>
          ) : (
            <a href={googleMapsUrl(a)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
              Maps
              <ExternalLink size={14} />
            </a>
          )}
          {a.phone && (
            <a href={`tel:${a.phone.replace(/[^+\d]/g, '')}`} className={buttonClass('secondary', 'sm')}>
              <Phone size={14} />
              Anrufen
            </a>
          )}
          {routeFromHotel && (
            <a
              href={routeFromHotel.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Weg von ${routeFromHotel.hotel} in Google Maps`}
              className={buttonClass('secondary', 'sm')}
            >
              <Route size={14} />
              Route vom Hotel
            </a>
          )}
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
            <button type="button" onClick={() => onSave(fallback)} disabled={saving} className={buttonClass('primary', 'sm')}>
              <Heart size={15} />
              Merken
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
