import { Bus, Plane, TrainFront } from 'lucide-react'
import { useAirportLookup } from '../api/airports'
import type { TripOption } from '../api/types'
import { formatDuration, parseSignature } from '../lib/flights'
import { estimateDuration, parseJourneyNotes, type JourneyLine } from '../lib/journeyNotes'

/**
 * Gemerkter Flug oder Bus-&-Bahn-Verbindung, gut lesbar: pro Strecke Datum, Ab- und Ankunft groß, Flughafen bzw. Ort,
 * Dauer, Umstiege und Flugnummer bzw. Linie. Liest die Notiz, die beim Merken geschrieben wurde.
 */
export function JourneyDetails({ option }: { option: TripOption }) {
  const { lines, steps, rest } = parseJourneyNotes(option.notes)
  const flight = option.kind === 'Flight'
  const signature = flight ? parseSignature(option.externalId) : null
  const codes = flight ? lines.flatMap((l) => [l.from, l.to]).filter((c) => /^[A-Z]{3}$/.test(c)) : []
  const airports = useAirportLookup(codes)
  const airport = (code: string) => airports.data?.find((a) => a.code === code)

  const dateOf = (i: number) => signature?.legs[i]?.date ?? (i === 0 ? option.startDate : option.endDate) ?? option.startDate
  const label = (i: number) =>
    !flight ? 'Bus & Bahn' : lines.length === 2 ? (i === 0 ? 'Hinflug' : 'Rückflug') : lines.length === 1 ? 'Flug' : `Flug ${i + 1}`

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => {
        const iso = dateOf(i)
        const from = airport(line.from)
        const to = airport(line.to)
        const estimated = line.durationMinutes == null && iso ? estimateDuration(line, iso, from, to) : null
        return (
          <section
            key={`${line.from}-${line.to}-${i}`}
            aria-label={`${label(i)} ${line.from} nach ${line.to}`}
            className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">{label(i)}</span>
              <span className="font-semibold">
                {line.date}
                {iso ? ` ${iso.slice(0, 4)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
              <Place time={line.departure} code={line.from} name={flight ? from?.city || from?.name : null} />
              <Middle
                line={line}
                flight={flight}
                duration={line.durationMinutes ?? estimated}
                estimated={line.durationMinutes == null && estimated != null}
              />
              <Place
                time={line.arrival}
                plusDays={line.plusDays}
                code={line.to}
                name={flight ? to?.city || to?.name : null}
                align="right"
              />
            </div>
            {line.services.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">
                  {flight ? (line.services.length > 1 ? 'Flüge' : 'Flug') : line.services.length > 1 ? 'Linien' : 'Linie'}
                </span>
                {line.services.map((s) => (
                  <span key={s} className="rounded-lg border border-line bg-surface px-2 py-0.5 font-mono text-[13px] font-semibold">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        )
      })}
      {steps.length > 1 && (
        <ol className="flex flex-col gap-1.5 rounded-xl border border-line p-3 text-[13px]" aria-label="Teilstrecken">
          {steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="font-mono font-semibold">
                {s.departure}–{s.arrival}
              </span>
              <span>
                <span className="font-semibold">{s.service}</span>
                <span className="text-muted">
                  {' '}
                  · {s.from} → {s.to}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {rest.length > 0 && <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">{rest.join('\n')}</p>}
    </div>
  )
}

function Place({
  time,
  plusDays = 0,
  code,
  name,
  align,
}: {
  time: string
  plusDays?: number
  code: string
  name?: string | null
  align?: 'right'
}) {
  return (
    <div className={align === 'right' ? 'flex min-w-0 flex-col items-end text-right' : 'flex min-w-0 flex-col'}>
      <span className="font-mono text-2xl font-bold tabular-nums leading-none">
        {time}
        {plusDays > 0 && (
          <sup className="ml-0.5 text-xs font-semibold text-star" title="Ankunft am nächsten Tag">
            +{plusDays}
          </sup>
        )}
      </span>
      <span className="mt-1 max-w-[16ch] truncate text-sm font-bold sm:max-w-[24ch]">{code}</span>
      {name && <span className="max-w-[16ch] truncate text-xs text-muted sm:max-w-[24ch]">{name}</span>}
    </div>
  )
}

function Middle({
  line,
  flight,
  duration,
  estimated,
}: {
  line: JourneyLine
  flight: boolean
  duration: number | null
  estimated: boolean
}) {
  const Icon = flight ? Plane : line.services.some((s) => /^Bus\b/.test(s)) && line.services.length === 1 ? Bus : TrainFront
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className="text-[13px] font-semibold">{duration != null ? `${estimated ? 'ca. ' : ''}${formatDuration(duration)}` : ' '}</span>
      <span className="flex w-full items-center gap-1.5 text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <Icon size={15} />
        <span className="h-px flex-1 bg-line" />
      </span>
      <span className={line.stops.toLowerCase() === 'direkt' ? 'text-xs font-semibold text-accent' : 'text-xs font-semibold text-star'}>
        {line.stops.charAt(0).toUpperCase() + line.stops.slice(1)}
      </span>
    </div>
  )
}
