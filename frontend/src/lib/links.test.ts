import { describe, expect, it } from 'vitest'
import { externalUrl } from './links'

describe('externalUrl', () => {
  const origin = 'http://127.0.0.1:51770'

  it('erkennt Links nach außen', () => {
    expect(externalUrl('https://www.booking.com/hotel/pt/x.html?a=1', origin)).toBe('https://www.booking.com/hotel/pt/x.html?a=1')
  })

  it('lässt Links innerhalb der App und andere Schemata in Ruhe', () => {
    expect(externalUrl('/reisen/1/hotels', origin)).toBeNull()
    expect(externalUrl('http://127.0.0.1:51770/reisen', origin)).toBeNull()
    expect(externalUrl('mailto:anna@example.com', origin)).toBeNull()
    expect(externalUrl('javascript:alert(1)', origin)).toBeNull()
  })
})
