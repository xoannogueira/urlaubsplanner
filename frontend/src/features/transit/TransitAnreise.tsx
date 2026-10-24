import clsx from 'clsx'
import { useSearchDraft } from '../../hooks/useSearchDraft'
import type { Airport } from '../../api/airports'
import { useTripActions } from '../../api/trips'
import type { Trip } from '../../api/types'
import { toLatLng } from '../../lib/geo'
import type { TransitPoint } from '../../lib/transit'
import { TransitSearch } from './TransitSearch'

/**
 * Anreise mit Bus & Bahn statt Flug: Hinfahrt von zu Hause zur ersten Etappe, Rückfahrt von der letzten.
 * Startpunkt ist die Stadt des Heimatflughafens (änderbar, z. B. auf „Stuttgart Hbf“).
 */
export function TransitAnreise({ trip, home }: { trip: Trip; home: Airport[] }) {
  const directionDraft = useSearchDraft(`${trip.id}.bahn`, { direction: 'hin' as 'hin' | 'rueck' })
  const direction = directionDraft.values.direction
  const setDirection = (v: 'hin' | 'rueck') => directionDraft.set('direction', v)
  const stages = [...trip.stages].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const first = stages[0]
  const last = stages[stages.length - 1]
  const actions = useTripActions(trip.id)
  const preset = trip.searchSettings
  // Startpunkt: gemerkter Ort (z. B. „Stuttgart Hbf“), sonst die Stadt des Heimatflughafens.
  const homePoint: TransitPoint | null = preset?.transitHome
    ? { name: preset.transitHome.name, location: { latitude: preset.transitHome.latitude, longitude: preset.transitHome.longitude } }
    : home[0]
      ? { name: home[0].city || home[0].name, location: { latitude: home[0].latitude, longitude: home[0].longitude } }
      : null
  const remember = (from: TransitPoint | null, hour: number) =>
    actions.setSearchSettings.mutateAsync({
      transitHour: hour,
      transitHome: from ? { name: from.name, latitude: from.location.latitude, longitude: from.location.longitude } : null,
    })
  const stagePoint = (s: (typeof stages)[number] | undefined): TransitPoint | null => {
    const at = s ? toLatLng(s) : null
    return s && at ? { name: s.name, location: at } : null
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Richtung" className="flex w-fit rounded-xl bg-surface-2 p-1">
        <Tab active={direction === 'hin'} onClick={() => setDirection('hin')}>
          Hinfahrt
        </Tab>
        <Tab active={direction === 'rueck'} onClick={() => setDirection('rueck')}>
          Rückfahrt
        </Tab>
      </div>
      {direction === 'hin' ? (
        <TransitSearch
          key="hin"
          draftKey={`${trip.id}.bahn.hin`}
          trip={trip}
          scope="anreise"
          stageId={first?.id ?? null}
          defaults={{
            from: homePoint,
            to: stagePoint(first),
            date: first?.startDate ?? trip.startDate ?? '',
            hour: preset?.transitHour ?? 8,
            minute: 0,
            arriveBy: false,
          }}
          // Gemerkter Startpunkt: gleich suchen (kostenlos)
          autoSearch={!!preset?.transitHome && !!stagePoint(first)}
          onRemember={remember}
        />
      ) : (
        <TransitSearch
          key="rueck"
          draftKey={`${trip.id}.bahn.rueck`}
          trip={trip}
          scope="anreise"
          stageId={last?.id ?? null}
          defaults={{
            from: stagePoint(last),
            to: homePoint,
            date: last?.endDate ?? trip.endDate ?? '',
            hour: 10,
            minute: 0,
            arriveBy: false,
          }}
        />
      )}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'h-9 cursor-pointer rounded-lg px-4 text-sm font-bold transition-colors duration-100',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
