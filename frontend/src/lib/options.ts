import type { OptionInput, OptionKind, OptionStatus, Trip, TripOption } from '../api/types'

export const kindLabels: Record<OptionKind, { singular: string; plural: string; short: string }> = {
  Flight: { singular: 'Flug', plural: 'Flüge', short: 'FLUG' },
  Hotel: { singular: 'Unterkunft', plural: 'Hotels', short: 'HOTEL' },
  Activity: { singular: 'Aktivität', plural: 'Aktivitäten', short: 'TOUR' },
  Transport: { singular: 'Transport', plural: 'Transport', short: 'FAHRT' },
  Other: { singular: 'Sonstiges', plural: 'Sonstiges', short: 'MEHR' },
}

export const statusOrder: OptionStatus[] = ['Idea', 'Favorite', 'Selected', 'Booked']

export const statusLabels: Record<OptionStatus, string> = {
  Idea: 'Idee',
  Favorite: 'Favorit',
  Selected: 'Ausgewählt',
  Booked: 'Gebucht',
}

export const isChosen = (o: TripOption) => o.status === 'Selected' || o.status === 'Booked'

/** Sortierung in Listen: Gebucht/Ausgewählt zuerst, dann Favoriten, dann nach Preis. */
export function sortOptions(options: TripOption[]): TripOption[] {
  const rank: Record<OptionStatus, number> = { Booked: 0, Selected: 1, Favorite: 2, Idea: 3 }
  return [...options].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.totalPrice ?? Number.POSITIVE_INFINITY) - (b.totalPrice ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title, 'de'),
  )
}

export interface ChecklistGroup {
  key: string
  name: string
  startDate: string | null
  endDate: string | null
  items: TripOption[]
}

/** Gruppiert die gewählten Optionen nach Etappe; Optionen ohne Etappe kommen nach vorn ("Ganze Reise"). */
export function checklistGroups(trip: Trip): ChecklistGroup[] {
  const chosen = trip.options.filter(isChosen)
  const kindRank: Record<OptionKind, number> = { Flight: 0, Transport: 1, Hotel: 2, Activity: 3, Other: 4 }
  const byKindThenDate = (a: TripOption, b: TripOption) =>
    kindRank[a.kind] - kindRank[b.kind] || (a.startDate ?? '').localeCompare(b.startDate ?? '')

  const groups: ChecklistGroup[] = []
  const general = chosen.filter((o) => !o.stageId || !trip.stages.some((s) => s.id === o.stageId))
  if (general.length > 0) {
    groups.push({ key: 'general', name: 'Ganze Reise', startDate: null, endDate: null, items: general.sort(byKindThenDate) })
  }
  for (const stage of trip.stages) {
    const items = chosen.filter((o) => o.stageId === stage.id).sort(byKindThenDate)
    if (items.length > 0) {
      groups.push({ key: stage.id, name: stage.name, startDate: stage.startDate, endDate: stage.endDate, items })
    }
  }
  return groups
}

export function sumTotals(options: TripOption[]): number {
  return options.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)
}

/** Gespeicherte Option zurück in Formulardaten, um einzelne Felder zu ändern. */
export function optionToInput(option: TripOption): OptionInput {
  return {
    kind: option.kind,
    title: option.title,
    status: option.status,
    stageId: option.stageId,
    url: option.url,
    price: option.price,
    pricePerPerson: option.pricePerPerson,
    startDate: option.startDate,
    endDate: option.endDate,
    locationName: option.locationName,
    latitude: option.latitude,
    longitude: option.longitude,
    notes: option.notes,
    imageUrl: option.imageUrl,
  }
}
