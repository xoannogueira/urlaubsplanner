import { describe, expect, it } from 'vitest'
import type { Stage, TripOption } from '../api/types'
import { optionPins, stageMarkers } from './mapData'

const option = (patch: Partial<TripOption>): TripOption => ({
  id: 'o1',
  kind: 'Hotel',
  status: 'Idea',
  stageId: null,
  title: 'Hotel Miradouro',
  url: null,
  price: null,
  pricePerPerson: false,
  totalPrice: null,
  startDate: null,
  endDate: null,
  locationName: null,
  latitude: 38.71,
  longitude: -9.13,
  notes: null,
  provider: 'manual',
  priceCheckedAt: null,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  ...patch,
})

const plain = (s: string) => s.replace(/\s/g, ' ')

describe('optionPins', () => {
  it('zeigt den Gesamtpreis im Pin', () => {
    const [pin] = optionPins([option({ totalPrice: 1136, status: 'Selected' })])
    expect(plain(pin.label)).toBe('1.136 €')
    expect(pin.tone).toBe('chosen')
  })

  it('zeigt ohne Preis einen gekürzten Titel', () => {
    const [pin] = optionPins([option({ title: 'Mosteiro dos Jerónimos in Belém' })])
    expect(pin.label).toBe('Mosteiro dos Jeró…')
    expect(pin.label.length).toBeLessThanOrEqual(18)
  })

  it('lässt Optionen ohne Koordinaten weg', () => {
    expect(optionPins([option({ latitude: null, longitude: null })])).toEqual([])
  })
})

describe('stageMarkers', () => {
  it('nummeriert nach Reihenfolge, auch wenn eine Etappe keinen Ort hat', () => {
    const stage = (id: string, lat: number | null): Stage => ({
      id,
      name: id,
      startDate: '2027-05-12',
      endDate: '2027-05-16',
      nights: 4,
      latitude: lat,
      longitude: lat === null ? null : -9,
    })
    const markers = stageMarkers([stage('A', 38), stage('B', null), stage('C', 41)])
    expect(markers.map((m) => [m.name, m.number])).toEqual([
      ['A', 1],
      ['C', 3],
    ])
  })
})
