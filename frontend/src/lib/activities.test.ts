import { describe, expect, it } from 'vitest'
import type { ActivitySuggestion } from '../api/activities'
import { activityOptionInput, fameLabel, openingHoursDe, ticketsUrl } from './activities'

const activity = (patch: Partial<ActivitySuggestion>): ActivitySuggestion => ({
  id: 'node/1',
  name: 'Ort',
  category: 'Sight',
  latitude: 38.7,
  longitude: -9.2,
  distanceKm: 1,
  description: null,
  imageUrl: null,
  wikipediaUrl: null,
  website: null,
  openingHours: null,
  freeEntry: null,
  popularity: 0,
  wikidataId: null,
  ...patch,
})

describe('Anzeige', () => {
  it('übersetzt Öffnungszeiten', () => {
    expect(openingHoursDe('Tu-Su 10:00-18:00; Mo off')).toBe('Di–So 10:00–18:00 · Mo geschlossen')
    expect(openingHoursDe('Mo-Fr 09:00-17:00; PH closed')).toBe('Mo–Fr 09:00–17:00 · Feiertage geschlossen')
    expect(openingHoursDe('24/7')).toBe('rund um die Uhr')
    expect(openingHoursDe(null)).toBeNull()
  })

  it('beschriftet Bekanntheit und bietet Tickets nur wo sinnvoll', () => {
    expect(fameLabel(60)).toBe('Sehr bekannt')
    expect(fameLabel(3)).toBeNull()
    expect(ticketsUrl(activity({ name: 'Torre de Belém', category: 'Castle' }))).toBe(
      'https://www.getyourguide.de/s/?q=Torre%20de%20Bel%C3%A9m',
    )
    expect(ticketsUrl(activity({ category: 'Beach' }))).toBeNull()
  })
})

describe('Merken', () => {
  it('übernimmt Ort, Foto, Herkunft; Eintritt frei = 0 €', () => {
    const input = activityOptionInput(
      activity({
        id: 'node/4',
        name: 'Museu Berardo',
        category: 'Museum',
        description: 'Kunstmuseum',
        openingHours: 'Tu-Su 10:00-19:00',
        freeEntry: true,
        wikipediaUrl: 'https://de.wikipedia.org/wiki/Berardo',
        imageUrl: 'https://img/x.jpg',
      }),
      's1',
    )
    expect(input).toMatchObject({
      kind: 'Activity',
      title: 'Museu Berardo',
      stageId: 's1',
      price: 0,
      url: 'https://de.wikipedia.org/wiki/Berardo',
      locationName: 'Museum',
      provider: 'osm',
      externalId: 'node/4',
      imageUrl: 'https://img/x.jpg',
    })
    expect(input.notes).toBe('Kunstmuseum\nÖffnungszeiten: Di–So 10:00–19:00\nEintritt frei')
    expect(activityOptionInput(activity({}), null).url).toBe('https://www.google.com/maps/search/?api=1&query=38.7,-9.2')
  })
})
