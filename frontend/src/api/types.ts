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
  notes: string | null
}
