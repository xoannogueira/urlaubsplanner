import clsx from 'clsx'
import { BedDouble, Check, ExternalLink, Heart, MapPin, Star } from 'lucide-react'
import { useState } from 'react'
import type { HotelOffer } from '../../api/hotels'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { ratingLabel } from '../../lib/hotels'

interface HotelResultCardProps {
  hotel: HotelOffer
  nights: number
  distanceKm: number | null
  saved: boolean
  saving: boolean
  selected: boolean
  onSave: () => void
  onSelect: () => void
}

export function HotelResultCard({ hotel, nights, distanceKm, saved, saving, selected, onSave, onSelect }: HotelResultCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = hotel.photoUrl && !imageFailed

  return (
    <article
      data-hotel-id={hotel.hotelId}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 cursor-pointer overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-100 max-sm:flex-col',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent)]' : 'border-line hover:border-muted/50',
      )}
    >
      <div className="relative h-40 shrink-0 bg-surface-3 sm:h-auto sm:w-44">
        {showImage ? (
          <img
            src={hotel.photoUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted">
            <BedDouble size={28} strokeWidth={1.6} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-bold leading-snug">{hotel.name}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {hotel.stars != null && (
                <span className="flex items-center gap-0.5 text-star" aria-label={`${hotel.stars} Sterne`}>
                  {Array.from({ length: Math.round(hotel.stars) }, (_, i) => (
                    <Star key={i} size={12} fill="currentColor" strokeWidth={0} />
                  ))}
                </span>
              )}
              {distanceKm != null && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} />
                  {formatDistance(distanceKm)} vom Zentrum
                </span>
              )}
            </div>
          </div>
          {hotel.rating != null && (
            <div className="flex shrink-0 items-center gap-2 text-right">
              <span className="flex flex-col">
                <span className="text-[13px] font-bold">{ratingLabel(hotel.rating)}</span>
                {hotel.reviewCount != null && (
                  <span className="text-xs text-muted">{hotel.reviewCount.toLocaleString('de-DE')} Bewertungen</span>
                )}
              </span>
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent font-mono text-sm font-semibold text-accent-ink">
                {hotel.rating.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {hotel.roomName && <span className="rounded-md bg-surface-2 px-2 py-1 text-muted">{hotel.roomName}</span>}
          {hotel.boardName && <span className="rounded-md bg-surface-2 px-2 py-1 text-muted">{hotel.boardName}</span>}
          {hotel.refundable && (
            <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-accent">
              <Check size={12} strokeWidth={3} />
              Kostenlos stornierbar
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-lg font-semibold">{formatEuro(hotel.totalPrice)}</span>
            <span className="text-xs text-muted">
              {nights === 1 ? '1 Nacht' : `${nights} Nächte`} · {formatEuro(Math.round(hotel.totalPrice / Math.max(1, nights)))} / Nacht
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href={hotel.bookingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
              Ansehen
              <ExternalLink size={14} />
            </a>
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
      </div>
    </article>
  )
}
