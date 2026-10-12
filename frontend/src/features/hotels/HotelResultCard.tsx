import clsx from 'clsx'
import { BedDouble, CalendarSearch, Check, ChevronDown, ExternalLink, Heart, MapPin, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { HotelListing, HotelOffer } from '../../api/hotels'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { marketComparison, ratingLabel, splitLabel, withRoom } from '../../lib/hotels'

/** Preis desselben Hotels bei einer anderen Zimmeraufteilung. */
export interface SplitPrice {
  rooms: number
  /** null = bei dieser Aufteilung nicht verfügbar */
  price: number | null
  loading: boolean
}

interface HotelResultCardProps {
  hotel: HotelOffer
  nights: number
  travelers: number
  /** Aktuelle Zimmeranzahl der Suche. */
  rooms: number
  distanceKm: number | null
  saved: boolean
  saving: boolean
  selected: boolean
  /** Speichert das Hotel mit dem gewählten Zimmer. */
  onSave: (hotel: HotelOffer) => void
  onSelect: () => void
  /** Nur gesetzt, wenn „Aufteilungen vergleichen“ an ist. */
  splits?: SplitPrice[]
  onPickRooms?: (rooms: number) => void
  /** Google Hotels: die „Zimmer“ sind Anbieter (Booking.com, Expedia …) mit ihrem Preis. */
  google?: boolean
}

export function HotelResultCard(props: HotelResultCardProps) {
  const {
    hotel: base,
    nights,
    travelers,
    rooms,
    distanceKm,
    saved,
    saving,
    selected,
    onSave,
    onSelect,
    splits,
    onPickRooms,
    google,
  } = props
  const [roomIndex, setRoomIndex] = useState(0)
  const [showRooms, setShowRooms] = useState(false)
  const room = base.rooms[roomIndex] ?? base.rooms[0]
  const hotel = room ? withRoom(base, room) : base
  const market = marketComparison(hotel.totalPrice, hotel.marketPrice)

  return (
    <CardFrame hotel={hotel} selected={selected} onSelect={onSelect}>
      <HotelPhoto url={hotel.photoUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <HotelHeading hotel={hotel} distanceKm={distanceKm} />

        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {hotel.roomName && (
            <span className="rounded-md bg-surface-2 px-2 py-1 text-muted">{google ? `bei ${hotel.roomName}` : hotel.roomName}</span>
          )}
          {hotel.boardName && <span className="rounded-md bg-surface-2 px-2 py-1 text-muted">{hotel.boardName}</span>}
          {hotel.refundable && (
            <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-accent">
              <Check size={12} strokeWidth={3} />
              Kostenlos stornierbar
            </span>
          )}
        </div>

        {base.rooms.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              aria-expanded={showRooms}
              onClick={() => setShowRooms(!showRooms)}
              className="flex w-fit cursor-pointer items-center gap-1 text-[13px] font-bold text-accent hover:underline"
            >
              <ChevronDown size={15} className={clsx('transition-transform duration-100', showRooms && 'rotate-180')} />
              {google ? `Preise von ${base.rooms.length} Anbietern` : `${base.rooms.length} Zimmervarianten`}
            </button>
            {showRooms && (
              <ul className="flex flex-col gap-1" aria-label={google ? `Anbieter für ${base.name}` : `Zimmer in ${base.name}`}>
                {base.rooms.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={i === roomIndex}
                      onClick={() => setRoomIndex(i)}
                      className={clsx(
                        'flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px]',
                        i === roomIndex ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{r.name ?? 'Zimmer'}</span>
                        <span className="text-xs text-muted">
                          {google
                            ? r.refundable
                              ? 'kostenlos stornierbar'
                              : 'Bedingungen beim Anbieter'
                            : [r.boardName, r.refundable ? 'kostenlos stornierbar' : 'nicht stornierbar'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono font-semibold">{formatEuro(r.totalPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {splits && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Zimmeraufteilung">
            <span className="mr-1 font-bold text-muted">Aufteilung</span>
            {splits.map((split) => {
              const current = split.rooms === rooms
              const price = current ? base.totalPrice : split.price
              return (
                <button
                  key={split.rooms}
                  type="button"
                  aria-pressed={current}
                  title={splitLabel(split.rooms, travelers)}
                  disabled={current || split.loading || price == null}
                  onClick={() => onPickRooms?.(split.rooms)}
                  className={clsx(
                    'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-semibold',
                    current ? 'border-accent bg-accent-soft text-accent' : 'border-line enabled:cursor-pointer enabled:hover:bg-surface-2',
                    !current && price == null && !split.loading && 'text-muted line-through',
                  )}
                >
                  {split.rooms === 1 ? '1 Zimmer' : `${split.rooms} Zimmer`}
                  <span className="font-mono">{split.loading && !current ? '…' : price == null ? '–' : formatEuro(price)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-lg font-semibold">{formatEuro(hotel.totalPrice)}</span>
            <span className="text-xs text-muted">
              {nights === 1 ? '1 Nacht' : `${nights} Nächte`} · {formatEuro(Math.round(hotel.totalPrice / Math.max(1, nights)))} / Nacht
              {google && ` · für ${travelers} ${travelers === 1 ? 'Person' : 'Personen'} laut Google`}
            </span>
            {market && (
              <span
                className={clsx('text-xs font-semibold', market.kind === 'higher' ? 'text-accent' : 'text-star')}
                title="Vom Hotel empfohlener öffentlicher Preis – ungefähr das, was Booking & Co. zeigen"
              >
                Booking & Co. ca. {formatEuro(hotel.marketPrice!)} ·{' '}
                {market.kind === 'higher' ? `hier ${formatEuro(market.diff)} günstiger` : `dort evtl. ${formatEuro(market.diff)} günstiger`}
              </span>
            )}
            {hotel.payAtProperty != null && (
              <span className="text-xs text-muted" title={hotel.payAtPropertyLabel ?? undefined}>
                zzgl. {formatEuro(hotel.payAtProperty)} vor Ort{hotel.payAtPropertyLabel ? ` (${hotel.payAtPropertyLabel})` : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExternalLinks bookingUrl={hotel.bookingUrl} googleUrl={hotel.googleUrl} bookingSource={hotel.bookingSource} />
            {saved ? (
              <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
                <Check size={15} strokeWidth={3} />
                Gemerkt
              </span>
            ) : (
              <button type="button" onClick={() => onSave(hotel)} disabled={saving} className={buttonClass('primary', 'sm')}>
                <Heart size={15} />
                Merken
              </button>
            )}
          </div>
        </div>
      </div>
    </CardFrame>
  )
}

interface UnavailableHotelCardProps {
  hotel: HotelListing
  distanceKm: number | null
  selected: boolean
  onSelect: () => void
  onCheckDates: () => void
}

/** Hotel ohne Angebot für den Zeitraum: rot umrandet und ausgegraut, mit „Andere Daten prüfen“. */
export function UnavailableHotelCard({ hotel, distanceKm, selected, onSelect, onCheckDates }: UnavailableHotelCardProps) {
  return (
    <CardFrame hotel={hotel} selected={selected} onSelect={onSelect} unavailable>
      <HotelPhoto url={hotel.photoUrl} muted />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <HotelHeading hotel={hotel} distanceKm={distanceKm} muted />
        <span className="w-fit rounded-md bg-danger/12 px-2 py-1 text-xs font-bold text-danger">Für deine Daten ausgebucht</span>
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
          <ExternalLinks bookingUrl={hotel.bookingUrl} googleUrl={hotel.googleUrl} bookingSource={hotel.bookingSource} />
          <button type="button" onClick={onCheckDates} className={buttonClass('primary', 'sm')}>
            <CalendarSearch size={15} />
            Andere Daten prüfen
          </button>
        </div>
      </div>
    </CardFrame>
  )
}

function CardFrame({
  hotel,
  selected,
  unavailable,
  onSelect,
  children,
}: {
  hotel: { hotelId: string }
  selected: boolean
  unavailable?: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <article
      data-hotel-id={hotel.hotelId}
      data-unavailable={unavailable || undefined}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 cursor-pointer overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-100 max-sm:flex-col',
        selected
          ? 'border-accent shadow-[0_0_0_3px_var(--accent)]'
          : unavailable
            ? 'border-danger/70 bg-surface-2/60 hover:border-danger'
            : 'border-line hover:border-muted/50',
      )}
    >
      {children}
    </article>
  )
}

function HotelPhoto({ url, muted }: { url: string | null; muted?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative h-40 shrink-0 bg-surface-3 sm:h-auto sm:w-44">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={clsx('absolute inset-0 size-full object-cover', muted && 'opacity-60 grayscale')}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-muted">
          <BedDouble size={28} strokeWidth={1.6} />
        </span>
      )}
    </div>
  )
}

function HotelHeading({ hotel, distanceKm, muted }: { hotel: HotelListing | HotelOffer; distanceKm: number | null; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className={clsx('text-base font-bold leading-snug', muted && 'text-muted')}>{hotel.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {hotel.stars != null && (
            <span className={clsx('flex items-center gap-0.5', muted ? 'text-muted' : 'text-star')} aria-label={`${hotel.stars} Sterne`}>
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
          <span
            className={clsx(
              'flex size-10 items-center justify-center rounded-xl font-mono text-sm font-semibold',
              muted ? 'bg-surface-3 text-muted' : 'bg-accent text-accent-ink',
            )}
          >
            {hotel.rating.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
        </div>
      )}
    </div>
  )
}

/** Booking.com (vorausgefüllt) und Google Hotels (vergleicht viele Anbieter). */
export function ExternalLinks({
  bookingUrl,
  googleUrl,
  bookingSource,
}: {
  bookingUrl: string
  googleUrl: string
  /** z. B. „Expedia“ – dann führt der Link direkt zum Hotel bei diesem Anbieter */
  bookingSource?: string | null
}) {
  const label = bookingSource ? shortSource(bookingSource) : 'Booking'
  return (
    <>
      {bookingUrl !== googleUrl && (
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={bookingSource ? `Direkt zum Hotel bei ${bookingSource}` : 'Booking.com-Suche mit Hotel, Daten und Personen'}
          className={buttonClass('secondary', 'sm')}
        >
          {label}
          <ExternalLink size={14} />
        </a>
      )}
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Google Hotels vergleicht viele Anbieter – Reisedaten und Personen sind übernommen"
        className={buttonClass('secondary', 'sm')}
      >
        Google
        <ExternalLink size={14} />
      </a>
    </>
  )
}

/** „Hotel Miradouro (Hotelseite)“ → „Hotelseite“, lange Namen kürzen, damit der Knopf klein bleibt. */
function shortSource(source: string): string {
  if (source.endsWith('(Hotelseite)')) return 'Hotelseite'
  return source.length > 18 ? `${source.slice(0, 17)}…` : source
}
