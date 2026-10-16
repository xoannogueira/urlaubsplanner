import { CloudOff } from 'lucide-react'
import type { Trip } from '../../api/types'
import type { WeatherDay } from '../../api/weather'
import { useTripWeather } from '../../api/weather'
import { Skeleton } from '../../components/ui/Feedback'
import { formatShortDate } from '../../lib/format'
import { formatTemp, sourceLabel, summarizeWeather, summaryCode, summaryLine, weatherLine } from '../../lib/weather'
import { WeatherIcon } from './WeatherIcon'

/**
 * Wetter pro Etappe: echte Vorhersage, sobald die Tage in den nächsten 16 Tagen liegen – sonst typisches Wetter
 * (Durchschnitt der letzten Jahre am selben Kalendertag). Kostenlos über Open-Meteo.
 */
export function WeatherCard({ trip }: { trip: Trip }) {
  const weather = useTripWeather(trip)
  const stages = [...trip.stages].sort((a, b) => a.startDate.localeCompare(b.startDate))

  if (!weather.hasPlaces) {
    return <p className="text-sm text-muted">Sobald eine Etappe einen Ort hat, steht hier das Wetter.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage) => {
        if (stage.latitude === null || stage.longitude === null) return null
        const days = weather.byStage.get(stage.id)
        const summary = days ? summarizeWeather(days) : null
        return (
          <div key={stage.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-[15px] font-extrabold">{stage.name}</h3>
              {summary && <span className="text-xs text-muted">{sourceLabel(summary)}</span>}
            </div>
            {summary && days ? (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <WeatherIcon code={summaryCode(summary)} size={18} />
                  {summaryLine(summary)}
                </p>
                <DayStrip days={days} />
              </>
            ) : weather.loading ? (
              <Skeleton className="h-20" />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <CloudOff size={16} />
                Wetter gerade nicht abrufbar.
              </p>
            )}
          </div>
        )
      })}
      <p className="text-xs text-muted">
        Wetterdaten von{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
          Open-Meteo.com
        </a>{' '}
        (CC BY 4.0). „Typisch“ = Durchschnitt der letzten Jahre; die echte Vorhersage kommt etwa 2 Wochen vorher.
      </p>
    </div>
  )
}

function DayStrip({ days }: { days: WeatherDay[] }) {
  return (
    <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Wetter pro Tag">
      {days.map((d) => {
        const [weekday, date] = formatShortDate(d.date).split(' ')
        return (
          <li
            key={d.date}
            title={`${formatShortDate(d.date)}: ${weatherLine(d)}${d.source === 'Climate' ? ' (typisch)' : ''}`}
            className="flex min-w-[58px] flex-col items-center gap-1 rounded-xl bg-surface-2 px-2 py-2"
          >
            <span className="text-center text-[11px] leading-tight text-muted">
              <span className="font-bold uppercase">{weekday.replace(',', '')}</span> {date}
            </span>
            <WeatherIcon code={d.code} size={18} />
            <span className="font-mono text-xs font-semibold">{formatTemp(d.tempMax)}</span>
            <span className="font-mono text-[11px] text-muted">{formatTemp(d.tempMin)}</span>
            {d.rainChance !== null && d.rainChance >= 30 && <span className="text-[10px] font-semibold text-accent">{d.rainChance} %</span>}
          </li>
        )
      })}
    </ul>
  )
}
