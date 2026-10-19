const STORAGE_KEY = 'urlaubsplanner:etappen-erklaert'

/** Wurde die Erklärung schon weggeklickt? (nur in diesem Browser gemerkt) */
export function stageGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberStageGuideDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Ohne Speicher erscheint die Erklärung beim nächsten Mal wieder – nicht schlimm.
  }
}
