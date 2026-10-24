import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanupSearchDrafts, clearSearchDrafts, updateSearchDraft, useSearchDraft } from './useSearchDraft'

type Form = { from: string; date: string; radius: number; last: string | null }
const defaults: Form = { from: 'STR', date: '2026-12-10', radius: 150, last: null }
const opts = { basis: '2026-12-10', basisKeys: ['date'] as (keyof Form)[], quietKeys: ['last'] as (keyof Form)[] }

describe('useSearchDraft', () => {
  beforeEach(() => localStorage.clear())

  it('ohne Änderungen gelten die Standardwerte', () => {
    const { result } = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    expect(result.current.values).toEqual(defaults)
    expect(result.current.changed).toBe(false)
  })

  it('merkt sich Änderungen über einen Neuaufbau hinweg (Tab-Wechsel)', () => {
    const first = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    act(() => first.result.current.patch({ from: 'FRA', radius: 300 }))
    first.unmount()
    const again = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    expect(again.result.current.values).toMatchObject({ from: 'FRA', radius: 300, date: '2026-12-10' })
    expect(again.result.current.changed).toBe(true)
  })

  it('nicht geänderte Felder folgen neuen Standardwerten', () => {
    const first = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    act(() => first.result.current.set('from', 'FRA'))
    first.unmount()
    const again = renderHook(() => useSearchDraft('t1.flug', { ...defaults, radius: 200 }, opts))
    expect(again.result.current.values.radius).toBe(200)
  })

  it('neuer Reisezeitraum: Daten neu vorschlagen, Rest behalten', () => {
    const first = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    act(() => first.result.current.patch({ from: 'FRA', date: '2026-12-12' }))
    first.unmount()
    const moved = { ...defaults, date: '2027-01-05' }
    const again = renderHook(() => useSearchDraft('t1.flug', moved, { ...opts, basis: '2027-01-05' }))
    expect(again.result.current.values).toMatchObject({ from: 'FRA', date: '2027-01-05' })
  })

  it('Zurücksetzen und letzte Suche zählt nicht als Änderung', () => {
    const { result } = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    act(() => result.current.set('last', 'x'))
    expect(result.current.changed).toBe(false)
    act(() => result.current.set('from', 'FRA'))
    expect(result.current.changed).toBe(true)
    act(() => result.current.reset())
    expect(result.current.values).toEqual(defaults)
    expect(localStorage.length).toBe(0)
  })

  it('Entwürfe sind pro Maske getrennt und lassen sich pro Reise löschen', () => {
    const a = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    const b = renderHook(() => useSearchDraft('t2.flug', defaults, opts))
    act(() => a.result.current.set('from', 'FRA'))
    act(() => b.result.current.set('from', 'MUC'))
    clearSearchDrafts('t1')
    expect(localStorage.length).toBe(1)
    cleanupSearchDrafts(Date.now() + 100 * 86_400_000)
    expect(localStorage.length).toBe(0)
  })

  it('von außen vorbelegt: offene Maske übernimmt sofort, gilt auch bei anderer Grundlage', () => {
    const { result, unmount } = renderHook(() => useSearchDraft('t1.flug', defaults, opts))
    act(() => updateSearchDraft('t1.flug', { from: 'KIX', date: '2026-12-20' }))
    expect(result.current.values).toMatchObject({ from: 'KIX', date: '2026-12-20' })
    unmount()
    localStorage.clear()
    updateSearchDraft('t1.flug', { date: '2026-12-21' })
    const other = renderHook(() => useSearchDraft('t1.flug', defaults, { ...opts, basis: 'anders' }))
    expect(other.result.current.values.date).toBe('2026-12-21')
  })
})
