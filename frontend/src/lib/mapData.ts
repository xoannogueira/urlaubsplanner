import type { OptionStatus, Stage, TripOption } from '../api/types'
import type { MapPin, MapStage, PinTone } from '../components/map/types'
import { formatEuro } from './format'
import { toLatLng } from './geo'

const tones: Record<OptionStatus, PinTone> = {
  Idea: 'idea',
  Favorite: 'favorite',
  Selected: 'chosen',
  Booked: 'booked',
}

/** Optionen mit Koordinaten werden zu Pins; der Pin zeigt den Preis, sonst einen kurzen Titel. */
export function optionPins(options: TripOption[]): MapPin[] {
  return options.flatMap((option) => {
    const position = toLatLng(option)
    if (!position) return []
    const label = option.totalPrice != null ? formatEuro(option.totalPrice) : shorten(option.title, 18)
    return [{ id: option.id, position, label, title: option.title, tone: tones[option.status] }]
  })
}

export function stageMarkers(stages: Stage[]): MapStage[] {
  return stages.flatMap((stage, index) => {
    const position = toLatLng(stage)
    return position ? [{ id: stage.id, position, number: index + 1, name: stage.name }] : []
  })
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
