import type { LatLng } from '../../api/types'

/** 'unavailable' = für den Zeitraum ausgebucht (rot gestrichelt). */
export type PinTone = 'idea' | 'favorite' | 'chosen' | 'booked' | 'unavailable'

/** Ein Preis-Pin, z. B. ein Hotel. */
export interface MapPin {
  id: string
  position: LatLng
  /** Text im Pin, meist der Preis ("1.136 €"). */
  label: string
  /** Für Screenreader und Tooltip, z. B. der Hotelname. */
  title: string
  tone: PinTone
}

/** Eine Etappe als nummerierter Punkt. */
export interface MapStage {
  id: string
  position: LatLng
  number: number
  name: string
}

export interface TripMapProps {
  pins: MapPin[]
  stages?: MapStage[]
  /** Etappen in Reihenfolge mit einer Linie verbinden. */
  showRoute?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  className?: string
  /** Beschriftung der Karte für Screenreader. */
  label: string
  /**
   * Worauf der Ausschnitt passt: 'all' = Pins und Etappen (Übersicht),
   * 'pins' = nur Pins, Etappen nur zur Orientierung (Hotels in einer Stadt bleiben gut lesbar).
   */
  fitTo?: 'all' | 'pins'
}

export const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const
