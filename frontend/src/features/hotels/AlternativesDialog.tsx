import clsx from 'clsx'
import { CalendarX2, Check, ExternalLink, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { useHotelAlternatives, type HotelAlternativesParams } from '../../api/hotels'
import { Button } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { Dialog } from '../../components/ui/Dialog'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { formatEuro, formatShortDate, nightsLabel } from '../../lib/format'
import { alternativesByHotel, shiftLabel, type AlternativeOffer } from '../../lib/hotels'

export const MAX_SHIFT_DAYS = 3
const MAX_HOTELS = 20

export interface AlternativeCandidate {
  hotelId: string
  name: string
  /** Für den Wunschzeitraum ausgebucht. */
  unavailable: boolean
}

interface AlternativesDialogProps {
  open: boolean
  onClose: () => void
  candidates: AlternativeCandidate[]
  /** Vorausgewählt, z. B. das Hotel, bei dem auf „Andere Daten prüfen“ geklickt wurde. */
  initialSelected: string[]
  /** Direkt prüfen ohne Auswahlschritt (z. B. für ein gemerktes Hotel). */
  autoStart?: boolean
  stay: Omit<HotelAlternativesParams, 'hotelIds' | 'shiftDays'>
  /** Beschriftung der Aktion pro Zeitraum, z. B. „Merken“ oder „Übernehmen“. */
  pickLabel: string
  isPicked: (alternative: AlternativeOffer) => boolean
  onPick: (alternative: AlternativeOffer) => Promise<unknown>
}

/**
 * Prüft ausgewählte Hotels für dieselbe Anzahl Nächte, bis zu 3 Tage früher oder später.
 * Kostet eine LiteAPI-Abfrage pro Zeitraum (höchstens 6) – egal wie viele Hotels ausgewählt sind.
 */
export function AlternativesDialog(props: AlternativesDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Andere Daten prüfen"
      description={`Gleiche Anzahl Nächte, Anreise bis zu ${MAX_SHIFT_DAYS} Tage früher oder später.`}
      width="lg"
    >
      {/* Neu aufbauen bei jedem Öffnen, damit Auswahl und Ergebnis frisch sind. */}
      {props.open && <DialogBody {...props} />}
    </Dialog>
  )
}

function DialogBody({ candidates, initialSelected, autoStart, stay, pickLabel, isPicked, onPick, onClose }: AlternativesDialogProps) {
  const [selected, setSelected] = useState<string[]>(() => initialSelected.slice(0, MAX_HOTELS))
  // Bei autoStart gleich im Ergebnis-Schritt starten, ohne Auswahl aufzublitzen.
  const [checkedIds, setCheckedIds] = useState<string[] | null>(() => (autoStart ? initialSelected.slice(0, MAX_HOTELS) : null))
  const alternatives = useHotelAlternatives()
  const { mutate } = alternatives
  const started = useRef(false)

  const run = (ids: string[]) => {
    setCheckedIds(ids)
    mutate({ ...stay, hotelIds: ids, shiftDays: MAX_SHIFT_DAYS })
  }

  useEffect(() => {
    if (autoStart && !started.current && initialSelected.length > 0) {
      started.current = true
      mutate({ ...stay, hotelIds: initialSelected.slice(0, MAX_HOTELS), shiftDays: MAX_SHIFT_DAYS })
    }
  }, [autoStart, initialSelected, mutate, stay])

  if (checkedIds === null) {
    return <SelectStep candidates={candidates} selected={selected} onChange={setSelected} onCancel={onClose} onRun={() => run(selected)} />
  }

  return (
    <ResultStep
      candidates={candidates}
      hotelIds={checkedIds}
      state={alternatives}
      pickLabel={pickLabel}
      isPicked={isPicked}
      onPick={onPick}
      onBack={autoStart ? undefined : () => setCheckedIds(null)}
      onRetry={() => run(checkedIds)}
      onClose={onClose}
    />
  )
}

function SelectStep({
  candidates,
  selected,
  onChange,
  onCancel,
  onRun,
}: {
  candidates: AlternativeCandidate[]
  selected: string[]
  onChange: (ids: string[]) => void
  onCancel: () => void
  onRun: () => void
}) {
  const unavailableIds = candidates.filter((c) => c.unavailable).map((c) => c.hotelId)
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < MAX_HOTELS ? [...selected, id] : selected)

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">
        Wähle die Hotels, die dich interessieren. Geprüft werden bis zu {MAX_SHIFT_DAYS * 2} Zeiträume – das sind höchstens{' '}
        {MAX_SHIFT_DAYS * 2} API-Abfragen, egal wie viele Hotels du auswählst (max. {MAX_HOTELS}).
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">{selected.length} ausgewählt</span>
        <span className="flex-1" />
        {unavailableIds.length > 0 && (
          <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => onChange(unavailableIds.slice(0, MAX_HOTELS))}>
            Alle ausgebuchten
          </button>
        )}
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => onChange([])} disabled={selected.length === 0}>
          Keine
        </button>
      </div>
      <ul className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto" aria-label="Hotels">
        {candidates.map((c) => {
          const checked = selected.includes(c.hotelId)
          const full = !checked && selected.length >= MAX_HOTELS
          return (
            <li key={c.hotelId}>
              <label
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[15px]',
                  checked ? 'border-accent bg-accent-soft' : c.unavailable ? 'border-danger/60' : 'border-line',
                  full && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full}
                  onChange={() => toggle(c.hotelId)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                <span className={clsx('shrink-0 text-xs font-bold', c.unavailable ? 'text-danger' : 'text-muted')}>
                  {c.unavailable ? 'ausgebucht' : 'frei'}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={onRun} disabled={selected.length === 0}>
          {selected.length === 1 ? '1 Hotel prüfen' : `${selected.length} Hotels prüfen`}
        </Button>
      </div>
    </div>
  )
}

function ResultStep({
  candidates,
  hotelIds,
  state,
  pickLabel,
  isPicked,
  onPick,
  onBack,
  onRetry,
  onClose,
}: {
  candidates: AlternativeCandidate[]
  hotelIds: string[]
  state: ReturnType<typeof useHotelAlternatives>
  pickLabel: string
  isPicked: (alternative: AlternativeOffer) => boolean
  onPick: (alternative: AlternativeOffer) => Promise<unknown>
  onBack?: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const grouped = useMemo(() => (state.data ? alternativesByHotel(state.data, hotelIds) : null), [state.data, hotelIds])
  const names = useMemo(() => new Map(candidates.map((c) => [c.hotelId, c.name])), [candidates])
  const failed = state.data?.windows.filter((w) => w.failed).length ?? 0

  return (
    <div className="flex flex-col gap-4">
      {state.isPending || state.isIdle ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <p className="text-sm text-muted">
            Prüfe {hotelIds.length === 1 ? '1 Hotel' : `${hotelIds.length} Hotels`} für andere Zeiträume …
          </p>
          {hotelIds.slice(0, 3).map((id) => (
            <Skeleton key={id} className="h-24" />
          ))}
        </div>
      ) : state.error ? (
        <ErrorState message={state.error instanceof ApiError ? state.error.message : 'Prüfung fehlgeschlagen.'} onRetry={onRetry} />
      ) : grouped ? (
        <>
          {failed > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-star/50 px-3 py-2 text-sm text-star">
              <TriangleAlert size={15} />
              {failed === 1 ? '1 Zeitraum konnte' : `${failed} Zeiträume konnten`} nicht geprüft werden.
            </p>
          )}
          <div className="flex flex-col gap-5">
            {hotelIds.map((id) => (
              <HotelAlternatives
                key={id}
                name={grouped.get(id)?.[0]?.offer.name ?? names.get(id) ?? id}
                alternatives={grouped.get(id) ?? []}
                pickLabel={pickLabel}
                isPicked={isPicked}
                onPick={onPick}
              />
            ))}
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {onBack && (
          <Button variant="secondary" onClick={onBack} disabled={state.isPending}>
            Andere Hotels wählen
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      </div>
    </div>
  )
}

function HotelAlternatives({
  name,
  alternatives,
  pickLabel,
  isPicked,
  onPick,
}: {
  name: string
  alternatives: AlternativeOffer[]
  pickLabel: string
  isPicked: (alternative: AlternativeOffer) => boolean
  onPick: (alternative: AlternativeOffer) => Promise<unknown>
}) {
  const cheapest = alternatives.length > 0 ? Math.min(...alternatives.map((a) => a.offer.totalPrice)) : null

  return (
    <section className="flex flex-col gap-2" aria-label={name}>
      <h3 className="font-bold">{name}</h3>
      {alternatives.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-danger/60 px-3 py-2.5 text-sm text-muted">
          <CalendarX2 size={16} className="text-danger" />
          Auch {MAX_SHIFT_DAYS} Tage früher oder später nichts frei.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {alternatives.map((alt) => (
            <AlternativeChip
              key={alt.checkin}
              alternative={alt}
              cheapest={alt.offer.totalPrice === cheapest}
              pickLabel={pickLabel}
              picked={isPicked(alt)}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AlternativeChip({
  alternative,
  cheapest,
  pickLabel,
  picked,
  onPick,
}: {
  alternative: AlternativeOffer
  cheapest: boolean
  pickLabel: string
  picked: boolean
  onPick: (alternative: AlternativeOffer) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const { offer } = alternative

  return (
    <li
      className={clsx(
        'flex flex-col gap-2 rounded-xl border p-3',
        cheapest ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface-2/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-bold">
            {formatShortDate(alternative.checkin)} – {formatShortDate(alternative.checkout)}
          </span>
          <span className="text-xs text-muted">
            {nightsLabel(alternative.nights)} · {shiftLabel(alternative.shiftDays)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono font-semibold">{formatEuro(offer.totalPrice)}</span>
          {cheapest && <span className="text-[11px] font-bold uppercase tracking-wide text-accent">Günstigster</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <a href={offer.bookingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
          Booking
          <ExternalLink size={13} />
        </a>
        {picked ? (
          <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
            <Check size={14} strokeWidth={3} />
            {pickLabel === 'Merken' ? 'Gemerkt' : 'Übernommen'}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onPick(alternative).finally(() => setBusy(false))
            }}
            className={buttonClass('primary', 'sm')}
          >
            {pickLabel}
          </button>
        )}
      </div>
    </li>
  )
}
