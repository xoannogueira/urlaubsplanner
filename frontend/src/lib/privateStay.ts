import type { OptionInput, OptionStatus, TripOption } from '../api/types'

/** Unterkunft bei Verwandten oder Freunden: ein Hotel-Eintrag ohne Kosten, erkennbar am Anbieter. */
export const PRIVATE_STAY = 'private'

export const isPrivateStay = (o: Pick<TripOption, 'kind' | 'provider'>) => o.kind === 'Hotel' && o.provider === PRIVATE_STAY

export interface PrivateStayDetails {
  host: string
  address: string
  latitude: number | null
  longitude: number | null
  stageId: string | null
  /** leer = ganze Etappe */
  startDate: string
  endDate: string
  status: OptionStatus
  note: string
}

export function privateStayInput(d: PrivateStayDetails): OptionInput {
  return {
    kind: 'Hotel',
    title: d.host.trim() ? `Bei ${d.host.trim()}` : 'Privat untergebracht',
    status: d.status,
    stageId: d.stageId,
    url: null,
    price: 0,
    pricePerPerson: false,
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    locationName: d.address.trim() || null,
    latitude: d.latitude,
    longitude: d.longitude,
    notes: d.note.trim() || null,
    imageUrl: null,
    provider: PRIVATE_STAY,
  }
}

export function parsePrivateStay(o: TripOption): PrivateStayDetails {
  return {
    host: o.title.replace(/^Bei\s+/, '') === 'Privat untergebracht' ? '' : o.title.replace(/^Bei\s+/, ''),
    address: o.locationName ?? '',
    latitude: o.latitude,
    longitude: o.longitude,
    stageId: o.stageId,
    startDate: o.startDate ?? '',
    endDate: o.endDate ?? '',
    status: o.status,
    note: o.notes ?? '',
  }
}
