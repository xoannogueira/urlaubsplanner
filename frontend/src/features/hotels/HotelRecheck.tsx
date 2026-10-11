import clsx from 'clsx'
import { CalendarSearch, CircleCheck, CircleX, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useHotelRecheck } from '../../api/hotels'
import { useTripActions } from '../../api/trips'
import type { Trip, TripOption } from '../../api/types'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro } from '../../lib/format'
import { defaultRooms, type AlternativeOffer } from '../../lib/hotels'
import { optionToInput } from '../../lib/options'
import { AlternativesDialog } from './AlternativesDialog'

/**
 * „Verfügbarkeit prüfen“ für ein gemerktes Hotel – z. B. wenn die Reise Monate im Voraus geplant wird.
 * Eine API-Abfrage; ist es ausgebucht, lassen sich Ausweichdaten prüfen und übernehmen.
 */
export function HotelRecheck({ trip, option }: { trip: Trip; option: TripOption }) {
  const recheck = useHotelRecheck()
  const actions = useTripActions(trip.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const stay = {
    checkin: option.startDate!,
    checkout: option.endDate!,
    adults: trip.travelers,
    rooms: defaultRooms(trip.travelers),
    // Google Hotels braucht einen Suchtext – der Hotelname passt am besten.
    place: option.title,
  }

  const check = () =>
    recheck.mutate(
      { ...stay, hotelIds: [option.externalId!] },
      {
        onSuccess: (result) => {
          const offer = result.hotels.find((h) => h.hotelId === option.externalId)
          // Gleicher Preis: nur den Prüfzeitpunkt aktualisieren.
          if (offer && offer.totalPrice === option.totalPrice) actions.confirmPrice.mutate({ id: option.id, price: offer.totalPrice })
        },
      },
    )

  const offer = recheck.data?.hotels.find((h) => h.hotelId === option.externalId)
  const diff = offer && option.totalPrice != null ? offer.totalPrice - option.totalPrice : null
  const priceTaken = offer != null && option.totalPrice === offer.totalPrice

  const takePrice = () => {
    if (!offer) return
    actions.updateOption.mutate({ id: option.id, input: { ...optionToInput(option), price: offer.totalPrice, pricePerPerson: false } })
  }

  const takeAlternative = (alt: AlternativeOffer) =>
    actions.updateOption
      .mutateAsync({
        id: option.id,
        input: {
          ...optionToInput(option),
          startDate: alt.checkin,
          endDate: alt.checkout,
          price: alt.offer.totalPrice,
          pricePerPerson: false,
          url: alt.offer.bookingUrl,
        },
      })
      // Neue Daten → altes Prüfergebnis gilt nicht mehr.
      .then(() => recheck.reset())

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[13px]">
      {recheck.isIdle ? (
        <button type="button" onClick={check} className={buttonClass('ghost', 'sm', '-mx-2 w-fit')}>
          <RefreshCw size={14} />
          Verfügbarkeit & Preis prüfen
        </button>
      ) : recheck.isPending ? (
        <span className="flex items-center gap-2 text-muted" aria-live="polite">
          <RefreshCw size={14} className="animate-spin" />
          Prüfe Verfügbarkeit …
        </span>
      ) : recheck.error ? (
        <span className="flex flex-wrap items-center gap-2 text-danger">
          {recheck.error instanceof ApiError ? recheck.error.message : 'Prüfung fehlgeschlagen.'}
          <button type="button" onClick={check} className="cursor-pointer font-bold underline">
            Nochmal
          </button>
        </span>
      ) : offer ? (
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <span className="flex items-center gap-1.5 font-semibold text-accent">
            <CircleCheck size={15} />
            Noch frei
            {diff === 0 || priceTaken ? (
              <span className="font-normal text-muted">· Preis unverändert</span>
            ) : (
              <span className={clsx('font-mono', diff != null && diff > 0 ? 'text-danger' : 'text-accent')}>
                · jetzt {formatEuro(offer.totalPrice)}
                {diff != null && ` (${diff > 0 ? '+' : '−'}${formatEuro(Math.abs(diff))})`}
              </span>
            )}
          </span>
          {!priceTaken && diff !== 0 && (
            <button type="button" onClick={takePrice} disabled={actions.updateOption.isPending} className={buttonClass('secondary', 'sm')}>
              Preis übernehmen
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <span className="flex items-center gap-1.5 font-semibold text-danger">
            <CircleX size={15} />
            Für diesen Zeitraum nicht mehr frei
          </span>
          <button type="button" onClick={() => setDialogOpen(true)} className={buttonClass('primary', 'sm')}>
            <CalendarSearch size={14} />
            Andere Daten prüfen
          </button>
        </div>
      )}

      <AlternativesDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        candidates={[{ hotelId: option.externalId!, name: option.title, unavailable: true }]}
        initialSelected={[option.externalId!]}
        autoStart
        stay={stay}
        pickLabel="Übernehmen"
        isPicked={(alt) => alt.checkin === option.startDate}
        onPick={takeAlternative}
        perHotel={option.provider === 'serpapi'}
      />
    </div>
  )
}
