import { describe, expect, it } from 'vitest'
import type { TripOption } from '../api/types'
import { isPrivateStay, parsePrivateStay, privateStayInput } from './privateStay'

describe('Unterkunft bei Verwandten/Freunden', () => {
  it('wird als kostenloses Hotel gespeichert und wieder gelesen', () => {
    const input = privateStayInput({
      host: 'Tante Maria',
      address: 'Rua Augusta 10, Lissabon',
      latitude: 38.71,
      longitude: -9.14,
      stageId: 's1',
      startDate: '',
      endDate: '',
      status: 'Booked',
      note: 'Schlüssel beim Nachbarn',
    })
    expect(input).toMatchObject({ kind: 'Hotel', title: 'Bei Tante Maria', price: 0, provider: 'private', startDate: null, url: null })

    const option = { ...input, id: 'o', totalPrice: 0, externalId: null, priceCheckedAt: null, createdAt: '', updatedAt: '' } as TripOption
    expect(isPrivateStay(option)).toBe(true)
    expect(parsePrivateStay(option)).toMatchObject({
      host: 'Tante Maria',
      address: 'Rua Augusta 10, Lissabon',
      note: 'Schlüssel beim Nachbarn',
    })
  })
})
