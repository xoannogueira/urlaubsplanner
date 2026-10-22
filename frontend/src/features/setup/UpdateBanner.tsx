import { CircleCheck, Download, Info, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppInfo, useCheckForUpdate, useRestartForUpdate, useUpdateStatus } from '../../api/app'
import { Button } from '../../components/ui/Button'

// „Aktuell“ nur einmal pro App-Start kurz zeigen, nicht bei jedem Seitenwechsel.
let upToDateShown = false

/**
 * Stand der Updates beim Start: „Suche nach Updates …“, „wird geladen … 40 %“, kurz „neueste Version“ oder ein Fehler
 * mit „Nochmal versuchen“. Hinweis auf eine neue Version der Desktop-App. Sie wird im Hintergrund geladen und beim Schließen installiert –
 * oder sofort mit „Jetzt neu starten“.
 */
export function UpdateBanner() {
  const info = useAppInfo()
  const status = useUpdateStatus(info.data?.desktop ?? false)
  const restart = useRestartForUpdate()
  const check = useCheckForUpdate()
  const [restarting, setRestarting] = useState(false)
  const data = status.data
  const [showUpToDate, setShowUpToDate] = useState(false)

  useEffect(() => {
    if (data?.state !== 'UpToDate' || upToDateShown) return
    upToDateShown = true
    queueMicrotask(() => setShowUpToDate(true))
    const timer = window.setTimeout(() => setShowUpToDate(false), 6_000)
    return () => window.clearTimeout(timer)
  }, [data?.state])

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

  if (data.state === 'Checking') {
    return (
      <div role="status" className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-2 text-[13px] text-muted md:px-8">
        <LoaderCircle size={15} className="animate-spin" />
        Suche nach Updates …
      </div>
    )
  }

  if (data.state === 'Downloading') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-[13px] md:px-8">
        <Download size={15} className="text-accent" />
        <span>
          Neue Version <strong>{data.available}</strong> wird geladen … {data.progress ?? 0} %
        </span>
        <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <span className="block h-full bg-accent transition-[width]" style={{ width: `${data.progress ?? 0}%` }} />
        </span>
      </div>
    )
  }

  if (data.state === 'UpToDate' && showUpToDate) {
    return (
      <div role="status" className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-2 text-[13px] text-muted md:px-8">
        <CircleCheck size={15} className="text-accent" />
        Du hast die neueste Version ({data.current}).
      </div>
    )
  }

  if (data.state === 'Failed') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5 text-sm md:px-8">
        <TriangleAlert size={16} className="shrink-0 text-star" />
        <span className="flex-1">{data.hint ?? 'Die Suche nach Updates hat nicht geklappt.'}</span>
        <Button size="sm" icon={<RefreshCw size={14} />} disabled={check.isPending} onClick={() => check.mutate()}>
          Nochmal versuchen
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
