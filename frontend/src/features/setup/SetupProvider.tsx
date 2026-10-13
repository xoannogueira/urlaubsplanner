import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppInfo, useSettings } from '../../api/app'
import { SetupContext, rememberSetupDismissed, setupDismissed, type SetupStep } from './setupContext'
import { SetupWizard } from './SetupWizard'

/**
 * Stellt das Tutorial überall bereit und öffnet es beim ersten Start von selbst, solange kein API-Key da ist.
 * In der Desktop-App meldet sich das Fenster außerdem regelmäßig beim Server – wird es geschlossen, beendet sich die App.
 */
export function SetupProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const info = useAppInfo()
  const [manualOpen, setManualOpen] = useState(false)
  const [step, setStep] = useState<SetupStep>('welcome')
  // Von selbst nur beim ersten Start ohne Key – und offen lassen, bis man es schließt (auch nach dem Speichern).
  const [auto, setAuto] = useState<'pending' | 'open' | 'done'>(() => (setupDismissed() ? 'done' : 'pending'))
  if (auto === 'pending' && settings.data) setAuto(settings.data.serpApi.configured ? 'done' : 'open')
  const configured = settings.data?.serpApi.configured ?? false

  useDesktopLifeline(info.data?.desktop ?? false)

  const value = useMemo(
    () => ({
      openSetup: (start: SetupStep = 'welcome') => {
        setStep(start)
        setManualOpen(true)
      },
    }),
    [],
  )

  return (
    <SetupContext.Provider value={value}>
      {children}
      <SetupWizard
        open={manualOpen || auto === 'open'}
        initialStep={manualOpen ? step : 'welcome'}
        configured={configured}
        onClose={() => {
          setManualOpen(false)
          setAuto('done')
          rememberSetupDismissed()
        }}
      />
    </SetupContext.Provider>
  )
}

/**
 * Lebenszeichen an die Desktop-App: alle 20 s und beim Zurückkehren ins Fenster. Beim Schließen (oder Neuladen)
 * meldet sich das Fenster ab; kommt danach kein Lebenszeichen mehr, beendet sich die App nach ein paar Sekunden.
 */
function useDesktopLifeline(desktop: boolean) {
  useEffect(() => {
    if (!desktop) return
    const beat = () => void fetch('/api/app/heartbeat', { method: 'POST' }).catch(() => undefined)
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    const onHide = () => navigator.sendBeacon('/api/app/closing')
    beat()
    const timer = window.setInterval(beat, 20_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onHide)
    }
  }, [desktop])
}
