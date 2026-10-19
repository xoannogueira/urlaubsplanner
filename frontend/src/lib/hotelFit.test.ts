import { describe, expect, it } from 'vitest'
import type { Trip, TripOption } from '../api/types'
import { sampleTrip } from '../features/pdf/sampleTrip'
import { hotelMismatches, newMismatchMessage } from './hotelFit'

const stage = { ...sampleTrip.stages[0], id: 's1', name: 'Lissabon', startDate: '2027-05-12', endDate: '2027-05-16' }
const hotel = (startDate: string, endDate: string, status: TripOption['status'] = 'Booked'): TripOption => ({
  ...sampleTrip.options[0],
  id: 'h1',
  kind: 'Hotel',
  title: 'Casa Lisboa',
  stageId: 's1',
  status,
  startDate,
  endDate,
})
const trip = (s: typeof stage, options: TripOption[]): Trip => ({
  ...sampleTrip,
  startDate: s.startDate,
  endDate: s.endDate,
  stages: [s],
  options,
})

describe('Hotels und Reisezeitraum', () => {
  it('findet gebuchte Hotels außerhalb ihrer Etappe', () => {
    expect(hotelMismatches(trip(stage, [hotel('2027-05-12', '2027-05-16')]))).toEqual([])
    const moved = { ...stage, startDate: '2027-05-13', endDate: '2027-05-17' }
    expect(hotelMismatches(trip(moved, [hotel('2027-05-12', '2027-05-16')]))).toHaveLength(1)
    // Favoriten zählen nicht – die sind noch nicht festgelegt
    expect(hotelMismatches(trip(moved, [hotel('2027-05-12', '2027-05-16', 'Favorite')]))).toEqual([])
  })

  it('meldet nur neu entstandene Abweichungen', () => {
    const before = trip(stage, [hotel('2027-05-12', '2027-05-16')])
    const after = trip({ ...stage, startDate: '2027-05-13' }, [hotel('2027-05-12', '2027-05-16')])
    expect(newMismatchMessage(before, after)).toMatch(/^Achtung: Casa Lisboa .* passt nicht mehr zu Lissabon/)
    expect(newMismatchMessage(after, after)).toBeNull()
  })
})
