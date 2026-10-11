import type { ActivityCategory, ActivitySuggestion } from '../api/activities'
import type { OptionInput } from '../api/types'

export const categoryLabels: Record<ActivityCategory, { plural: string; singular: string }> = {
  Sight: { plural: 'Sehenswürdigkeiten', singular: 'Sehenswürdigkeit' },
  Museum: { plural: 'Museen', singular: 'Museum' },
  Viewpoint: { plural: 'Aussichtspunkte', singular: 'Aussichtspunkt' },
  Castle: { plural: 'Burgen & Schlösser', singular: 'Burg / Schloss' },
  Religious: { plural: 'Kirchen & Klöster', singular: 'Kirche / Kloster' },
  Nature: { plural: 'Natur & Parks', singular: 'Natur / Park' },
  Beach: { plural: 'Strände', singular: 'Strand' },
  Zoo: { plural: 'Zoos & Aquarien', singular: 'Zoo / Aquarium' },
  ThemePark: { plural: 'Freizeitparks', singular: 'Freizeitpark' },
}

const days: Record<string, string> = { Mo: 'Mo', Tu: 'Di', We: 'Mi', Th: 'Do', Fr: 'Fr', Sa: 'Sa', Su: 'So' }

/** "Tu-Su 10:00-18:00; Mo off" → "Di–So 10:00–18:00 · Mo geschlossen" */
export function openingHoursDe(raw: string | null): string | null {
  if (!raw) return null
  if (raw.trim() === '24/7') return 'rund um die Uhr'
  return raw
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => days[d])
    .replace(/\bPH\b/g, 'Feiertage')
    .replace(/\boff\b|\bclosed\b/g, 'geschlossen')
    .replace(/(\d)-(\d)/g, '$1–$2')
    .replace(/([A-Z][a-z])-([A-Z][a-z])/g, '$1–$2')
    .split(/\s*;\s*/)
    .filter(Boolean)
    .join(' · ')
}

/** „Sehr bekannt“ ab vielen Wikipedia-Sprachversionen – hilft beim Überfliegen. */
export function fameLabel(popularity: number): string | null {
  if (popularity >= 40) return 'Sehr bekannt'
  if (popularity >= 15) return 'Bekannt'
  return null
}

export const googleMapsUrl = (a: ActivitySuggestion) => `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`

/** Touren & Tickets – nur für Orte, wo es meist Eintritt oder Führungen gibt. */
export function ticketsUrl(a: ActivitySuggestion): string | null {
  const ticketed: ActivityCategory[] = ['Sight', 'Museum', 'Castle', 'Religious', 'Zoo', 'ThemePark']
  return ticketed.includes(a.category) ? `https://www.getyourguide.de/s/?q=${encodeURIComponent(a.name)}` : null
}

/** Daten fürs Merken als Favorit. Eintritt frei → Preis 0 €, sonst offen. */
export function activityOptionInput(a: ActivitySuggestion, stageId: string | null): OptionInput {
  const hours = openingHoursDe(a.openingHours)
  return {
    kind: 'Activity',
    title: a.name,
    status: 'Favorite',
    stageId,
    url: a.wikipediaUrl ?? a.website ?? googleMapsUrl(a),
    price: a.freeEntry ? 0 : null,
    pricePerPerson: true,
    startDate: null,
    endDate: null,
    locationName: categoryLabels[a.category].singular,
    latitude: a.latitude,
    longitude: a.longitude,
    notes: [
      a.description,
      hours ? `Öffnungszeiten: ${hours}` : null,
      a.freeEntry ? 'Eintritt frei' : null,
      a.website && a.website !== a.wikipediaUrl ? a.website : null,
    ]
      .filter(Boolean)
      .join('\n'),
    imageUrl: a.imageUrl,
    provider: 'osm',
    externalId: a.id,
  }
}
