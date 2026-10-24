import { ArrowLeft, BookOpen, CircleCheck, ExternalLink, FolderOpen, KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppInfo, useCheckForUpdate, useRemoveSerpApiKey, useSettings, useUpdateStatus } from '../../api/app'
import { useFlightSearchStatus } from '../../api/flights'
import { Logo, ThemeToggle } from '../../components/layout/Brand'
import { Button } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ErrorState, ProgressBar, Skeleton } from '../../components/ui/Feedback'
import { KeyForm } from '../setup/KeyForm'
import { KeyBanner } from '../setup/KeyBanner'
import { SearchCosts } from '../setup/SearchCosts'
import { useSetup } from '../setup/setupContext'
import { InstallationSection } from './InstallationSection'
import { ConnectivitySection } from './ConnectivitySection'
import { SearchDefaultsSection } from './SearchDefaultsSection'
import { StoredDataSection } from './StoredDataSection'
import { KEY_URL, SIGN_UP_URL, Warning } from '../setup/SetupWizard'

/** API-Key, verbleibende Suchen, was Suchen kosten und wo die Daten liegen. */
export function SettingsPage() {
  const settings = useSettings()
  const info = useAppInfo()
  const update = useUpdateStatus(info.data?.desktop ?? false)
  const check = useCheckForUpdate()
  const status = useFlightSearchStatus()
  const remove = useRemoveSerpApiKey()
  const { openSetup } = useSetup()
  const [changing, setChanging] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const data = settings.data
  const quota = status.data?.provider === 'serpapi' ? status.data.quota : null

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-5 md:px-8">
        <Logo />
        <ThemeToggle />
      </header>
      <KeyBanner />

      <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-10 md:px-8">
        <div className="flex flex-col gap-2">
          <Link to="/" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
            <ArrowLeft size={15} />
            Zu deinen Reisen
          </Link>
          <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">Einstellungen</h1>
        </div>

        {settings.isPending ? (
          <Skeleton className="h-64" />
        ) : settings.error || !data ? (
          <ErrorState message={settings.error?.message ?? 'Einstellungen nicht verfügbar.'} onRetry={() => void settings.refetch()} />
        ) : (
          <>
            <Section
              title="Flug- und Hotelsuche"
              description="Preise kommen von Google Flights und Google Hotels über SerpApi. Jeder braucht dafür seinen eigenen, kostenlosen Key."
            >
              {data.serpApi.configured ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold">
                    <CircleCheck size={18} className="text-accent" />
                    Key eingerichtet
                    <span className="font-mono text-sm font-normal text-muted">{data.serpApi.hint}</span>
                  </span>
                  {data.serpApi.fromApp && (
                    <div className="flex gap-2">
                      <Button size="sm" icon={<KeyRound size={15} />} onClick={() => setChanging((c) => !c)}>
                        Key ändern
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => setConfirmRemove(true)}>
                        Entfernen
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Warning>
                  Noch kein Key eingetragen – ohne Key funktionieren Flug- und Hotelsuche nicht. Alles andere geht trotzdem.
                </Warning>
              )}
              {!data.serpApi.fromApp && data.serpApi.configured && (
                <p className="text-xs text-muted">
                  Dieser Key kommt aus den User Secrets bzw. der Umgebung und lässt sich nur dort ändern.
                </p>
              )}
              {(!data.serpApi.configured || changing) && <KeyForm onSaved={() => setChanging(false)} />}

              {quota && (
                <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold">Google-Suchen diesen Monat</span>
                    <span className="font-mono font-semibold">
                      noch {quota.left}
                      {quota.perMonth > 0 && <span className="font-sans font-normal text-muted"> von {quota.perMonth}</span>}
                    </span>
                  </div>
                  {quota.perMonth > 0 && (
                    <ProgressBar value={quota.left} max={quota.perMonth} label="Verbleibende Google-Suchen in diesem Monat" />
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button icon={<BookOpen size={16} />} onClick={() => openSetup('welcome')}>
                  Tutorial öffnen
                </Button>
                <a href={SIGN_UP_URL} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                  Konto bei SerpApi anlegen
                  <ExternalLink size={14} />
                </a>
                <a href={KEY_URL} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
                  Meinen Key bei SerpApi ansehen
                  <ExternalLink size={14} />
                </a>
              </div>
            </Section>

            <Section
              title="Was kostet wie viele Suchen?"
              description="250 Suchen pro Monat, für Flüge und Hotels zusammen. Das Kontingent startet jeden Monat neu."
            >
              <SearchCosts />
            </Section>

            <Section
              title="Deine Daten"
              description="Reisen und Einstellungen liegen nur auf diesem Computer – es gibt kein Konto und keine Cloud."
            >
              <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <FolderOpen size={16} className="mt-0.5 shrink-0 text-muted" />
                <span className="font-mono text-[13px] break-all">{data.dataDirectory}</span>
              </p>
              <p className="text-xs text-muted">
                Zum Sichern oder Umziehen auf einen anderen Computer diesen Ordner kopieren (bei geschlossener App).
                {info.data && ` · Version ${info.data.version}`}
                {update.data && ` · ${updateText(update.data.state, update.data.available, update.data.progress)}`}
              </p>
              {update.data && (update.data.state === 'UpToDate' || update.data.state === 'Failed') && (
                <Button
                  size="sm"
                  className="w-fit"
                  icon={<RefreshCw size={14} />}
                  disabled={check.isPending}
                  onClick={() => check.mutate()}
                >
                  Jetzt nach Updates suchen
                </Button>
              )}
            </Section>

            <Section
              title="Vorgaben für neue Reisen"
              description="Jede neue Reise übernimmt diese Einstellungen für die Suchen. Pro Reise änderst du sie direkt in der Suche mit „Als Standard merken“."
            >
              <SearchDefaultsSection />
            </Section>

            <Section
              title="Gespeicherte Preisdaten"
              description="Preisarchiv und Preiskalender. Was du seit 30 Tagen nicht benutzt hast, kannst du auslagern: Es wird komprimiert im Datenordner abgelegt und lässt sich jederzeit zurückholen. Nicht mehr Gebrauchtes hakst du an und löschst es endgültig."
            >
              <StoredDataSection />
            </Section>

            <ConnectivitySection />
            {info.data?.desktop && <InstallationSection />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Key entfernen?"
        message="Danach funktionieren Flug- und Hotelsuche erst wieder, wenn du einen Key einträgst. Deine Reisen bleiben erhalten."
        confirmLabel="Entfernen"
        onConfirm={() => remove.mutate(undefined, { onSettled: () => setConfirmRemove(false) })}
        onClose={() => setConfirmRemove(false)}
        pending={remove.isPending}
      />
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </section>
  )
}

function updateText(state: string, available: string | null, progress: number | null): string {
  switch (state) {
    case 'Checking':
      return 'Suche nach Updates …'
    case 'Downloading':
      return `Lade Version ${available} (${progress ?? 0} %)`
    case 'Ready':
      return `Version ${available} wird beim Schließen installiert`
    case 'UpToDate':
      return 'Aktuell'
    case 'Failed':
      return 'Update-Suche fehlgeschlagen'
    default:
      return 'Automatische Updates aus'
  }
}
