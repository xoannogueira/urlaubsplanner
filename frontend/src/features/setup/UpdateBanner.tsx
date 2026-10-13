import { Download, Info, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppInfo, useRestartForUpdate, useUpdateStatus } from '../../api/app'
import { Button } from '../../components/ui/Button'

/**
 * Hinweis auf eine neue Version der Desktop-App. Sie wird im Hintergrund geladen und beim Schließen installiert –
 * oder sofort mit „Jetzt neu starten“.
 */
export function UpdateBanner() {
  const info = useAppInfo()
  const status = useUpdateStatus(info.data?.desktop ?? false)
  const restart = useRestartForUpdate()
  const [restarting, setRestarting] = useState(false)
  const data = status.data

  if (restarting && info.data) return <RestartOverlay oldVersion={info.data.version} />
  if (!data) return null

  if (data.state === 'Ready') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 border-b border-accent/40 bg-accent-soft px-4 py-3 text-sm md:px-8">
        <Download size={17} className="shrink-0 text-accent" />
        <span className="flex-1">
          <strong>Neue Version {data.available} ist da.</strong> Sie wird automatisch installiert, wenn du die App schließt.
        </span>
        <Button
          variant="primary"
          size="sm"
          icon={<RefreshCw size={15} />}
          disabled={restart.isPending}
          onClick={() => restart.mutate(undefined, { onSuccess: () => setRestarting(true) })}
        >
          Jetzt neu starten
        </Button>
      </div>
    )
  }

  if (data.state === 'Off' && data.hint) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-3 text-sm md:px-8">
        <Info size={17} className="shrink-0 text-muted" />
        <span className="flex-1">{data.hint}</span>
      </div>
    )
  }

  return null
}

/** Während die App das Update installiert und neu startet: warten, dann die Seite neu laden. */
function RestartOverlay({ oldVersion }: { oldVersion: string }) {
  const [giveUp, setGiveUp] = useState(false)

  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(async () => {
      if (Date.now() - started > 90_000) {
        setGiveUp(true)
        window.clearInterval(timer)
        return
      }
      try {
        const response = await fetch('/api/app/info')
        if (!response.ok) return
        const info = (await response.json()) as { version: string }
        if (info.version !== oldVersion) window.location.reload()
      } catch {
        // Server startet noch neu.
      }
    }, 1500)
    return () => window.clearInterval(timer)
  }, [oldVersion])

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-[20px] border border-line bg-surface p-8 text-center shadow-2xl">
        <RefreshCw size={28} className={giveUp ? 'text-muted' : 'animate-spin text-accent'} />
        <h2 className="text-lg font-extrabold">{giveUp ? 'Fast geschafft' : 'Update wird installiert …'}</h2>
        <p className="text-[15px] text-muted">
          {giveUp
            ? 'Bitte schließe dieses Fenster und öffne den Urlaubsplanner über das App-Icon neu.'
            : 'Die App startet gleich mit der neuen Version neu. Deine Reisen bleiben erhalten.'}
        </p>
      </div>
    </div>
  )
}
