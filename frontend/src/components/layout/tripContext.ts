import { useOutletContext } from 'react-router'
import type { Trip } from '../../api/types'

export interface TripContext {
  trip: Trip
}

/** Die geladene Reise für alle Unterseiten (Übersicht, Flüge, Hotels …). */
export const useTripContext = () => useOutletContext<TripContext>()
