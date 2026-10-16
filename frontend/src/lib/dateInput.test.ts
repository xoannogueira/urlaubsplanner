import { describe, expect, it } from 'vitest'
import { isoToGerman, maskGermanDate, parseGermanDate, parseTime } from './dateInput'

describe('Datum tippen', () => {
  it('versteht deutsche Schreibweisen', () => {
    expect(parseGermanDate('19.02.2027')).toBe('2027-02-19')
    expect(parseGermanDate('19.2.27')).toBe('2027-02-19')
    expect(parseGermanDate('19022027')).toBe('2027-02-19')
    expect(parseGermanDate('1.3.2027')).toBe('2027-03-01')
    expect(parseGermanDate('19.02.', 2027)).toBe('2027-02-19')
    expect(parseGermanDate('19.02.')).toBeNull()
  })

  it('lehnt unmögliche Daten ab', () => {
    expect(parseGermanDate('31.02.2027')).toBeNull()
    expect(parseGermanDate('12.13.2027')).toBeNull()
    expect(parseGermanDate('02/19/2027')).toBeNull()
    expect(parseGermanDate('')).toBeNull()
  })

  it('setzt beim Tippen die Punkte', () => {
    expect(maskGermanDate('1', '19')).toBe('19.')
    expect(maskGermanDate('19.', '19.0')).toBe('19.0')
    expect(maskGermanDate('19.0', '19.02')).toBe('19.02.')
    expect(maskGermanDate('19.02.202', '19.02.2027')).toBe('19.02.2027')
    expect(maskGermanDate('', '19022027')).toBe('19.02.2027')
    expect(maskGermanDate('19.', '19')).toBe('19') // Löschen
    expect(isoToGerman('2027-02-19')).toBe('19.02.2027')
  })

  it('Uhrzeit im 24-Stunden-Format', () => {
    expect(parseTime('8')).toBe('08:00')
    expect(parseTime('8:5')).toBe('08:05')
    expect(parseTime('0830')).toBe('08:30')
    expect(parseTime('8.30')).toBe('08:30')
    expect(parseTime('20 Uhr')).toBe('20:00')
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('8:00 AM')).toBeNull()
  })
})
