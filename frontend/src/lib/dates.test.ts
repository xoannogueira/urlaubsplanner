import { describe, expect, it } from 'vitest'
import type { Stage } from '../api/types'
import { addDays, newStageDefaults, rangeFor, rangeHint, tripRange } from './dates'

const stage = (startDate: string, endDate: string) =>
  ({ id: startDate, name: 'x', startDate, endDate, nights: 1, latitude: null, longitude: null }) as Stage

describe('Reisezeitraum', () => {
  it('nimmt die Daten der Reise, sonst die Etappen', () => {
    expect(tripRange({ startDate: '2027-02-19', endDate: '2027-02-28', stages: [] })).toEqual({ start: '2027-02-19', end: '2027-02-28' })
    expect(
      tripRange({ startDate: null, endDate: null, stages: [stage('2027-02-21', '2027-02-28'), stage('2027-02-19', '2027-02-21')] }),
    ).toEqual({
      start: '2027-02-19',
      end: '2027-02-28',
    })
    expect(tripRange({ startDate: null, endDate: null, stages: [] })).toEqual({ start: null, end: null })
  })

  it('schlägt für eine neue Etappe den Rest der Reise vor', () => {
    const trip = { startDate: '2027-02-19', endDate: '2027-02-28', stages: [] as Stage[] }
    expect(newStageDefaults(trip)).toEqual({ start: '2027-02-19', end: '2027-02-28' })
    expect(newStageDefaults({ ...trip, stages: [stage('2027-02-19', '2027-02-21')] })).toEqual({ start: '2027-02-21', end: '2027-02-28' })
    expect(newStageDefaults({ ...trip, stages: [stage('2027-02-19', '2027-02-28')] })).toEqual({ start: '2027-02-28', end: '' })
    expect(newStageDefaults({ startDate: null, endDate: null, stages: [] })).toEqual({ start: '', end: '' })
  })

  it('Einträge einer Etappe bleiben in der Etappe', () => {
    const trip = { startDate: '2027-02-19', endDate: '2027-02-28', stages: [] as Stage[] }
    expect(rangeFor(trip, stage('2027-02-21', '2027-02-24'))).toEqual({ start: '2027-02-21', end: '2027-02-24' })
    expect(rangeFor(trip, null)).toEqual({ start: '2027-02-19', end: '2027-02-28' })
  })

  it('Hilfen', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(rangeHint({ start: '2027-02-19', end: '2027-02-28' })).toBe('Reise: 19.–28. Februar 2027')
    expect(rangeHint({ start: null, end: null })).toBeUndefined()
  })
})
