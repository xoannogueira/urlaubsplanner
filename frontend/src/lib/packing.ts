import type { PackingItem, PackingList, Trip } from '../api/types'
import type { WeatherDay } from '../api/weather'
import { tripRange } from './dates'
import { isChosen, isRentalCar } from './options'
import { isRainy, weatherKind } from './weather'

export const packingCategories = ['Dokumente', 'Kleidung', 'Hygiene & Gesundheit', 'Technik', 'Sonstiges'] as const
export type PackingCategory = (typeof packingCategories)[number]

export interface PackingSuggestion {
  key: string
  text: string
  category: PackingCategory
  /** Warum vorgeschlagen, z. B. „bis 27 °C“ */
  reason?: string
}

/**
 * Vorschläge für die Packliste aus Reisedauer, Wetter, Anreise, Mietwagen und geplanten Aktivitäten.
 * Ohne Wetterdaten fehlen nur die wetterabhängigen Punkte.
 */
export function suggestPacking(trip: Trip, weather: WeatherDay[]): PackingSuggestion[] {
  const out: PackingSuggestion[] = []
  const add = (key: string, text: string, category: PackingCategory, reason?: string) => out.push({ key, text, category, reason })

  const range = tripRange(trip)
  const nights = range.start && range.end ? Math.max(0, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000)) : 0
  const chosen = trip.options.filter(isChosen)
  const flight = chosen.some((o) => o.kind === 'Flight')
  const rental = trip.options.some((o) => isRentalCar(o) && o.status !== 'Idea')
  const activities = trip.options.filter((o) => o.kind === 'Activity' && o.status !== 'Idea')
  const hasCategory = (label: string) => activities.some((a) => a.locationName === label)

  // Dokumente
  add('ausweis', 'Personalausweis oder Reisepass', 'Dokumente')
  add('versicherungskarte', 'Krankenversicherungskarte', 'Dokumente')
  add('karten', 'Bank- und Kreditkarte', 'Dokumente')
  add('bargeld', 'Etwas Bargeld', 'Dokumente')
  if (chosen.length > 0) add('buchungen', 'Buchungsbestätigungen (Reiseplan-PDF)', 'Dokumente')
  if (flight) add('bordkarten', 'Bordkarten / Online-Check-in', 'Dokumente', 'Flug')
  if (rental) {
    add('fuehrerschein', 'Führerschein', 'Dokumente', 'Mietwagen')
    add('kaution', 'Kreditkarte für die Kaution (auf den Namen des Fahrers)', 'Dokumente', 'Mietwagen')
  }

  // Kleidung – Wäsche für bis zu einer Woche, länger wird gewaschen
  const changes = Math.min(Math.max(nights + 1, 1), 8)
  add('unterwaesche', `Unterwäsche & Socken (${changes}×)`, 'Kleidung', nights > 0 ? `${nights + 1} Tage` : undefined)
  add('oberteile', `T-Shirts / Oberteile (${Math.min(Math.max(nights, 1), 7)}×)`, 'Kleidung')
  add('schlafsachen', 'Schlafsachen', 'Kleidung')
  add('schuhe', 'Bequeme Schuhe zum Laufen', 'Kleidung')

  if (weather.length > 0) {
    const max = Math.max(...weather.map((d) => d.tempMax))
    const min = Math.min(...weather.map((d) => d.tempMin))
    const rainy = weather.filter(isRainy).length
    const snow = weather.some((d) => weatherKind(d.code) === 'snow')
    if (max >= 24) {
      add('kurze-hosen', 'Kurze Hosen / leichte Kleidung', 'Kleidung', `bis ${Math.round(max)} °C`)
      add('sonnencreme', 'Sonnencreme', 'Hygiene & Gesundheit', `bis ${Math.round(max)} °C`)
      add('sonnenbrille', 'Sonnenbrille', 'Sonstiges', `bis ${Math.round(max)} °C`)
      add('kopfbedeckung', 'Kappe oder Hut', 'Kleidung', `bis ${Math.round(max)} °C`)
    }
    if (min <= 12) add('pullover', 'Pullover oder Fleece', 'Kleidung', `nachts ${Math.round(min)} °C`)
    if (min <= 6) add('jacke', 'Warme Jacke', 'Kleidung', `nachts ${Math.round(min)} °C`)
    if (min <= 1 || snow) {
      add('winter', 'Mütze, Schal und Handschuhe', 'Kleidung', snow ? 'Schnee möglich' : `nachts ${Math.round(min)} °C`)
      add('winterschuhe', 'Warme, wasserfeste Schuhe', 'Kleidung', snow ? 'Schnee möglich' : `nachts ${Math.round(min)} °C`)
    }
    if (rainy > 0) {
      const reason = rainy === 1 ? '1 Regentag' : `${rainy} Regentage`
      add('regenjacke', 'Regenjacke', 'Kleidung', reason)
      add('schirm', 'Kleiner Regenschirm', 'Sonstiges', reason)
    }
  }

  if (hasCategory('Strand')) {
    add('badesachen', 'Badesachen', 'Kleidung', 'Strand geplant')
    add('strandtuch', 'Strandtuch', 'Sonstiges', 'Strand geplant')
    if (!out.some((s) => s.key === 'sonnencreme')) add('sonnencreme', 'Sonnencreme', 'Hygiene & Gesundheit', 'Strand geplant')
  }
  if (hasCategory('Natur / Park')) {
    add('wanderschuhe', 'Feste Schuhe / Wanderschuhe', 'Kleidung', 'Natur & Parks geplant')
    add('trinkflasche', 'Trinkflasche', 'Sonstiges', 'Natur & Parks geplant')
  }
  if (hasCategory('Kirche / Kloster')) add('bedeckt', 'Kleidung, die Schultern und Knie bedeckt', 'Kleidung', 'Kirchen & Klöster geplant')

  // Hygiene & Gesundheit
  add('zahnbuerste', 'Zahnbürste & Zahnpasta', 'Hygiene & Gesundheit')
  add('duschzeug', 'Duschgel, Shampoo, Deo', 'Hygiene & Gesundheit')
  add('medikamente', 'Eigene Medikamente', 'Hygiene & Gesundheit')
  add('reiseapotheke', 'Reiseapotheke (Pflaster, Schmerzmittel)', 'Hygiene & Gesundheit')
  if (flight) add('fluessigkeiten', 'Beutel für Flüssigkeiten im Handgepäck (max. 100 ml)', 'Hygiene & Gesundheit', 'Flug')

  // Technik
  add('ladekabel', 'Handy & Ladekabel', 'Technik')
  add('powerbank', 'Powerbank', 'Technik')
  if (nights >= 3 || flight) add('kopfhoerer', 'Kopfhörer', 'Technik')
  add('adapter', 'Steckdosen-Adapter (falls nötig)', 'Technik')

  return out
}

/** Vorschläge, die weder schon auf der Liste stehen noch weggeklickt wurden. */
export function openSuggestions(list: PackingList, suggestions: PackingSuggestion[]): PackingSuggestion[] {
  const taken = new Set(list.items.map((i) => i.suggestionKey).filter(Boolean))
  const dismissed = new Set(list.dismissed)
  return suggestions.filter((s) => !taken.has(s.key) && !dismissed.has(s.key))
}

export const fromSuggestion = (s: PackingSuggestion, id: string): PackingItem => ({
  id,
  text: s.text,
  category: s.category,
  packed: false,
  suggestionKey: s.key,
})

/** Einträge nach Kategorie, in fester Reihenfolge; eigene Kategorien hinten. */
export function groupPacking(items: PackingItem[]): { category: string; items: PackingItem[] }[] {
  const order = (c: string) => {
    const i = (packingCategories as readonly string[]).indexOf(c)
    return i === -1 ? packingCategories.length : i
  }
  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'de'))
  return categories.map((category) => ({ category, items: items.filter((i) => i.category === category) }))
}

/** Vorlage übernehmen: nur Einträge, die noch nicht auf der Liste stehen (gleicher Text), ohne Haken. */
export function applyTemplate(
  list: PackingList,
  items: { text: string; category: string; suggestionKey: string | null }[],
  newId: () => string,
): { list: PackingList; added: number } {
  const have = new Set(list.items.map((i) => i.text.trim().toLowerCase()))
  const fresh = items.filter((i) => {
    const k = i.text.trim().toLowerCase()
    if (have.has(k)) return false
    have.add(k)
    return true
  })
  return {
    list: {
      ...list,
      items: [
        ...list.items,
        ...fresh.map((i) => ({ id: newId(), text: i.text, category: i.category, packed: false, suggestionKey: i.suggestionKey })),
      ],
    },
    added: fresh.length,
  }
}

/** Aktuelle Packliste als Vorlage: nur Text, Kategorie und Herkunft – keine Haken. */
export const templateItems = (list: PackingList) =>
  list.items.map((i) => ({ text: i.text, category: i.category, suggestionKey: i.suggestionKey }))
