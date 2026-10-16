// Spiegelt die Verträge des C#-Backends (backend/src/Urlaubsplanner.Api/Contracts).
// Datumswerte sind ISO-Strings "YYYY-MM-DD", Zeitstempel ISO 8601.

export type OptionKind = 'Flight' | 'Hotel' | 'Activity' | 'Transport' | 'Other'

export type OptionStatus = 'Idea' | 'Favorite' | 'Selected' | 'Booked'

export interface Stage {
  id: string
  name: string
  startDate: string
  endDate: string
  nights: number
  latitude: number | null
  longitude: number | null
  /** Freie Beschreibung, z. B. was man dort vorhat */
  description?: string | null
}

export interface TripOption {
  id: string
  kind: OptionKind
  status: OptionStatus
  stageId: string | null
  title: string
  url: string | null
  price: number | null
  pricePerPerson: boolean
  totalPrice: number | null
  startDate: string | null
  endDate: string | null
  locationName: string | null
  latitude: number | null
  longitude: number | null
  notes: string | null
  provider: string
  externalId: string | null
  imageUrl: string | null
  priceCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Trip {
  id: string
  name: string
  travelers: number
  startDate: string | null
  endDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  stages: Stage[]
  options: TripOption[]
  packing: PackingList
  party: TripParty
}

export interface PackingItem {
  id: string
  text: string
  category: string
  packed: boolean
  /** gesetzt, wenn der Eintrag aus einem Vorschlag stammt */
  suggestionKey: string | null
}

export interface PackingList {
  items: PackingItem[]
  /** weggeklickte Vorschläge */
  dismissed: string[]
}

export interface TripMember {
  id: string
  name: string
}

export interface Expense {
  id: string
  title: string
  amount: number
  /** null = noch nicht bezahlt */
  paidBy: string | null
  /** leer = für alle */
  for: string[]
  date: string | null
}

export interface OptionShare {
  optionId: string
  paidBy: string | null
  for: string[]
}

export interface TripParty {
  members: TripMember[]
  expenses: Expense[]
  optionShares: OptionShare[]
}

export interface TripListItem {
  id: string
  name: string
  travelers: number
  startDate: string | null
  endDate: string | null
  stageNames: string[]
  totalCost: number
  costPerPerson: number
  chosenCount: number
  bookedCount: number
  favoriteCount: number
  updatedAt: string
}

export interface TripGap {
  kind: 'MissingHotel' | 'BetweenStages'
  stageId: string | null
  stageName: string | null
  from: string
  to: string
}

export interface TripSummary {
  travelers: number
  startDate: string | null
  endDate: string | null
  days: number | null
  nights: number
  stageCount: number
  totalCost: number
  costPerPerson: number
  bookedCost: number
  openCost: number
  chosenCount: number
  bookedCount: number
  missingPriceCount: number
  costByKind: { kind: OptionKind; total: number; count: number }[]
  costByStage: { stageId: string | null; name: string; total: number }[]
  gaps: TripGap[]
}

export interface TripInput {
  name: string
  travelers: number
  startDate: string | null
  endDate: string | null
  notes: string | null
}

export interface StageInput {
  name: string
  startDate: string
  endDate: string
  latitude: number | null
  longitude: number | null
  description?: string | null
}

export interface OptionInput {
  kind: OptionKind
  title: string
  status: OptionStatus
  stageId: string | null
  url: string | null
  price: number | null
  pricePerPerson: boolean
  startDate: string | null
  endDate: string | null
  locationName: string | null
  latitude: number | null
  longitude: number | null
  notes: string | null
  imageUrl?: string | null
  /** Nur beim Anlegen: Herkunft, z. B. 'liteapi', und die ID beim Anbieter. */
  provider?: string
  externalId?: string | null
}

/** Ergebnis der Ortssuche (GET /api/places). */
export interface Place {
  name: string
  label: string
  latitude: number
  longitude: number
  type: string | null
}

export interface LatLng {
  latitude: number
  longitude: number
}
