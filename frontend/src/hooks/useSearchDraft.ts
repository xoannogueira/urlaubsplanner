import { useEffect, useState } from 'react'

const PREFIX = 'urlaubsplanner.suche.'
const EVENT = 'urlaubsplanner-suche'
/** Entwürfe, die so lange nicht angefasst wurden, räumt die App weg. */
const MAX_AGE_DAYS = 90

interface Stored {
  /** null = von außen vorbelegt (z. B. aus dem Preiskalender) – gilt für jede Grundlage */
  basis: string | null
  overrides: Record<string, unknown>
  savedAt: number
}

function read(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (!parsed || typeof parsed.overrides !== 'object' || parsed.overrides === null) return null
    return { basis: parsed.basis === undefined ? '' : parsed.basis, overrides: parsed.overrides, savedAt: parsed.savedAt ?? 0 }
  } catch {
    return null
  }
}

function write(key: string, stored: Stored | null) {
  try {
    if (stored === null || Object.keys(stored.overrides).length === 0) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(stored))
  } catch {
    // Ohne Speicher gilt der Entwurf nur, solange die Ansicht offen ist.
  }
}

/**
 * Eine Suchmaske von außen vorbelegen (z. B. „In der Flugsuche öffnen“ aus dem Preiskalender). Offene Masken
 * übernehmen die Werte sofort.
 */
export function updateSearchDraft(key: string, patch: Record<string, unknown>) {
  const stored = read(key)
  write(key, { basis: stored?.basis ?? null, overrides: { ...(stored?.overrides ?? {}), ...patch }, savedAt: Date.now() })
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
  } catch {
    // ohne Fenster (Tests) egal
  }
}

/** Alte Entwürfe löschen (einmal beim Start reicht). */
export function cleanupSearchDrafts(now: number = Date.now()) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      const stored = read(k.slice(PREFIX.length))
      if (!stored || now - stored.savedAt > MAX_AGE_DAYS * 86_400_000) localStorage.removeItem(k)
    }
  } catch {
    // egal
  }
}

/** Alle Entwürfe einer Reise löschen (z. B. wenn die Reise gelöscht wird). */
export function clearSearchDrafts(tripId: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(`${PREFIX}${tripId}.`)) localStorage.removeItem(k)
    }
  } catch {
    // egal
  }
}

export interface SearchDraftOptions<T> {
  /**
   * Wovon die Standardwerte abhängen, z. B. der Reisezeitraum. Ändert er sich, gelten für <c>basisKeys</c> wieder die
   * Standardwerte (neue Daten vorschlagen), alles andere bleibt.
   */
  basis?: string
  basisKeys?: (keyof T)[]
  /** Felder, die nicht als „eigene Änderung“ zählen (z. B. die letzte Suche). */
  quietKeys?: (keyof T)[]
}

export interface SearchDraft<T> {
  values: T
  set: <K extends keyof T>(key: K, value: T[K]) => void
  patch: (patch: Partial<T>) => void
  /** Zurück auf die Standardwerte – eigene Änderungen und letzte Suche weg. */
  reset: () => void
  /** Gibt es eigene Änderungen gegenüber den Standardwerten? */
  changed: boolean
}

/**
 * Suchmaske mit Standardwerten, die sich eigene Änderungen merkt – pro Reise und Maske im Browser. Gespeichert wird
 * nur, was man selbst geändert hat: Alles andere folgt weiter den Standardwerten (z. B. neuen Daten der Reise).
 * So bleiben Eingaben beim Wechsel zwischen Tabs und nach einem Neustart erhalten.
 */
export function useSearchDraft<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  options: SearchDraftOptions<T> = {},
): SearchDraft<T> {
  const basis = options.basis ?? ''
  const load = (): Stored => {
    const stored = read(key)
    if (!stored) return { basis, overrides: {}, savedAt: 0 }
    if (stored.basis === basis) return stored
    if (stored.basis === null) return { ...stored, basis }
    // Grundlage geändert: betroffene Felder wieder vorschlagen, Rest behalten.
    const overrides = { ...stored.overrides }
    for (const k of options.basisKeys ?? []) delete overrides[k as string]
    return { basis, overrides, savedAt: stored.savedAt }
  }
  const [state, setState] = useState(() => ({ key, basis, stored: load() }))
  // Andere Maske (z. B. andere Etappe) ohne Neuaufbau: Entwurf neu lesen.
  let current = state
  if (state.key !== key || state.basis !== basis) {
    current = { key, basis, stored: load() }
    setState(current)
  }

  // Von außen vorbelegt (updateSearchDraft): neu lesen.
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== key) return
      setState((s) => ({ ...s, stored: load() }))
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  })

  const update = (change: (overrides: Record<string, unknown>) => Record<string, unknown>) =>
    setState((s) => {
      const stored = { basis: s.basis, overrides: change(s.stored.overrides), savedAt: Date.now() }
      write(s.key, stored)
      return { ...s, stored }
    })

  const overrides = current.stored.overrides
  const quiet = new Set((options.quietKeys ?? []) as string[])
  return {
    values: { ...defaults, ...(overrides as Partial<T>) },
    set: (k, v) => update((o) => ({ ...o, [k]: v })),
    patch: (p) => update((o) => ({ ...o, ...p })),
    reset: () =>
      update(() => {
        return {}
      }),
    changed: Object.keys(overrides).some((k) => !quiet.has(k)),
  }
}

/**
 * Letzte Suche nach dem Zurückkommen gleich wieder zeigen – aber nur, wenn ihr Ergebnis noch frisch im Speicher liegt.
 * Sonst würde das Öffnen der Seite still eine (evtl. kostenpflichtige) Suche auslösen; dann lieber „wiederholen“ anbieten.
 */
export function isFreshResult(state: { dataUpdatedAt: number; data?: unknown } | undefined, staleMs: number, now: number = Date.now()) {
  return !!state && state.data !== undefined && now - state.dataUpdatedAt < staleMs
}
