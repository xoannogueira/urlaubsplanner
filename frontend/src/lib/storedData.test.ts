import { describe, expect, it } from 'vitest'
import type { OffloadedData, StoredData } from '../api/data'
import { storedId, unusedExtras } from './storedData'

const now = Date.parse('2026-10-24T12:00:00Z')
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()
const stored = (key: string, lastUsed: string): StoredData => ({ kind: 'strecke', key, label: key, entries: 1, lastUsed })
const offloaded = (name: string, offloadedAt: string): OffloadedData => ({
  name,
  kind: 'strecke',
  label: name,
  entries: 1,
  bytes: 1,
  offloadedAt,
})

describe('unusedExtras', () => {
  it('zählt nur Ungenutztes, das nicht schon ausgewählt ist', () => {
    const s = [stored('STR-BCN', daysAgo(40)), stored('FRA-BCN', daysAgo(2)), stored('MUC-BCN', daysAgo(31))]
    const o = [offloaded('a.json.gz', daysAgo(45)), offloaded('b.json.gz', daysAgo(5))]
    const selected = new Set([storedId(s[0]), 'b.json.gz'])
    expect(unusedExtras(s, o, selected, now).map((x) => x.label)).toEqual(['MUC-BCN', 'a.json.gz'])
  })

  it('ist leer, wenn nichts seit 30 Tagen ungenutzt ist', () => {
    expect(unusedExtras([stored('STR-BCN', daysAgo(29))], [], new Set(), now)).toEqual([])
  })
})
