import { createContext, useContext } from 'react'

export interface SetupContextValue {
  /** Tutorial öffnen, optional direkt beim Schritt „Key eintragen“. */
  openSetup: (step?: SetupStep) => void
}

export type SetupStep = 'welcome' | 'getKey' | 'enterKey' | 'done'

export const SetupContext = createContext<SetupContextValue>({ openSetup: () => undefined })

export const useSetup = () => useContext(SetupContext)

const DISMISSED_KEY = 'urlaubsplanner.setupDismissed'

/** Ob das Tutorial schon einmal weggeklickt wurde (dann nicht wieder von selbst öffnen). */
export function setupDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberSetupDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Ohne Speicher erscheint das Tutorial eben beim nächsten Start wieder.
  }
}
