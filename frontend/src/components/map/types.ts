import type { StyleSpecification } from 'maplibre-gl'
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

/** Ein Flug als Bogen zwischen zwei Flughäfen. */
export interface MapArc {
  id: string
  from: LatLng
  to: LatLng
  /** 'active' = hervorgehoben (gewählter Flug), 'muted' = nur zur Orientierung. */
  emphasis: 'active' | 'muted'
}

/** Ein Flughafen als kleines Code-Schild (z. B. „LIS“). */
export interface MapAirport {
  code: string
  position: LatLng
  title: string
}

export interface TripMapProps {
  pins: MapPin[]
  arcs?: MapArc[]
  airports?: MapAirport[]
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

/**
 * Ersatzkarte, wenn OpenFreeMap nicht lädt (Ausfall, Werbeblocker, Firmennetz): Rasterkacheln von CARTO –
 * kostenlos für nicht-kommerzielle Nutzung, mit Quellenangabe.
 */
export function fallbackStyle(theme: 'dark' | 'light'): StyleSpecification {
  const variant = theme === 'dark' ? 'dark_all' : 'light_all'
  return {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`),
        tileSize: 256,
        maxzoom: 20,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
  }
}
