import clsx from 'clsx'
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, HardDrive, Hotel, Map, Plane, TriangleAlert, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAppInfo, useInstallation, type SaveKeyResult } from '../../api/app'
import { Button } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { Dialog } from '../../components/ui/Dialog'
import { DockRow } from '../settings/InstallationSection'
import { KeyForm } from './KeyForm'
import { SearchCosts } from './SearchCosts'
import type { SetupStep } from './setupContext'

const steps: { id: SetupStep; label: string }[] = [
  { id: 'welcome', label: 'Willkommen' },
  { id: 'getKey', label: 'Key holen' },
  { id: 'enterKey', label: 'Key eintragen' },
  { id: 'done', label: 'Fertig' },
]

export const SIGN_UP_URL = 'https://serpapi.com/users/sign_up'
export const KEY_URL = 'https://serpapi.com/manage-api-key'

interface SetupWizardProps {
  open: boolean
  initialStep: SetupStep
  /** Schon ein Key da? Dann steht im ersten Schritt „Key ändern“ statt „Einrichten“. */
  configured: boolean
  onClose: () => void
}

/** Erster Start: was die App kann, kostenlosen SerpApi-Key holen, eintragen, was Suchen kosten. */
export function SetupWizard({ open, initialStep, configured, onClose }: SetupWizardProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Urlaubsplanner einrichten" width="lg">
      {open && <WizardBody initialStep={initialStep} configured={configured} onClose={onClose} />}
    </Dialog>
  )
}

function WizardBody({ initialStep, configured, onClose }: Omit<SetupWizardProps, 'open'>) {
  const [step, setStep] = useState<SetupStep>(initialStep)
  const [saved, setSaved] = useState<SaveKeyResult | null>(null)
  const index = steps.findIndex((s) => s.id === step)
  const go = (offset: number) => setStep(steps[Math.min(steps.length - 1, Math.max(0, index + offset))].id)

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-1.5" aria-label="Schritte">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === step ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
              s.id === step ? 'bg-accent text-accent-ink' : i < index ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted',
            )}
          >
            <span className="font-mono">{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {step === 'welcome' && <Welcome />}
      {step === 'getKey' && <GetKey />}
      {step === 'enterKey' && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed">
            Kopiere den Key aus deinem SerpApi-Konto (
            <a
              href={KEY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline-offset-4 hover:underline"
            >
              Your Account → API Key
            </a>
            ) und füge ihn hier ein. Die App prüft ihn sofort – das kostet keine Suche.
          </p>
          <KeyForm
            onSaved={(result) => {
              setSaved(result)
              setStep('done')
            }}
          />
          <Warning>
            Das ist <strong>dein persönlicher</strong> Key. Gib ihn nicht weiter – wer ihn hat, verbraucht deine Suchen.
          </Warning>
        </div>
      )}
      {step === 'done' && <Done saved={saved} configured={configured} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {step === 'done' ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-sm font-semibold text-muted underline-offset-4 hover:text-text hover:underline"
          >
            {configured ? 'Schließen' : 'Später einrichten'}
          </button>
        )}
        <div className="flex gap-2">
          {index > 0 && step !== 'done' && (
            <Button icon={<ArrowLeft size={16} />} onClick={() => go(-1)}>
              Zurück
            </Button>
          )}
          {step === 'welcome' && (
            <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => go(1)}>
              {configured ? 'Key ändern' : "Los geht's"}
            </Button>
          )}
          {step === 'getKey' && (
            <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => go(1)}>
              Ich habe meinen Key
            </Button>
          )}
          {step === 'done' && (
            <Button variant="primary" onClick={onClose}>
              Reise planen
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Welcome() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed">
        Mit dem Urlaubsplanner planst du Reisen an einem Ort: Etappen, Flüge, Hotels und Aktivitäten – mit echten Preisen und allem auf der
        Karte.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        <Feature icon={<Plane size={16} />} title="Flüge" text="Preise von Google Flights, auch Gabelflüge" />
        <Feature icon={<Hotel size={16} />} title="Hotels" text="Preise von Booking, Expedia & Co. über Google Hotels" />
        <Feature icon={<Map size={16} />} title="Aktivitäten" text="Sehenswürdigkeiten rund um jede Etappe – kostenlos" />
        <Feature icon={<HardDrive size={16} />} title="Deine Daten" text="Bleiben auf diesem Computer, kein Konto nötig" />
      </ul>
      <Warning>
        Für <strong>Flug- und Hotelpreise</strong> brauchst du einen eigenen, kostenlosen API-Key von SerpApi. Das dauert etwa zwei Minuten
        – ohne Key funktioniert alles außer der Flug- und Hotelsuche.
      </Warning>
    </div>
  )
}

function GetKey() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        <Step n={1} title="Kostenloses Konto bei SerpApi anlegen">
          <p>SerpApi liefert der App die Preise von Google Flights und Google Hotels. Wähle beim Anmelden den kostenlosen Plan („Free“).</p>
          <a href={SIGN_UP_URL} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm', 'mt-1 w-fit')}>
            <UserPlus size={15} />
            serpapi.com öffnen
            <ExternalLink size={13} />
          </a>
        </Step>
        <Step n={2} title="Anmeldung bestätigen">
          <p>Bestätige deine E-Mail-Adresse (und was SerpApi sonst noch abfragt).</p>
        </Step>
        <Step n={3} title="Key kopieren">
          <p>
            Im SerpApi-Konto unter{' '}
            <a
              href={KEY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline-offset-4 hover:underline"
            >
              Your Account → API Key
            </a>{' '}
            steht dein Key (eine lange Folge aus Buchstaben und Zahlen). Kopiere ihn.
          </p>
        </Step>
      </ol>
      <Warning>
        <strong>Jeder braucht seinen eigenen Key.</strong> Pro Key gibt es 250 kostenlose Suchen im Monat – für Flüge und Hotels zusammen.
        Wenn ihr euch einen Key teilt, teilt ihr euch auch die 250 Suchen.
      </Warning>
    </div>
  )
}

function Done({ saved, configured }: { saved: SaveKeyResult | null; configured: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {(saved || configured) && (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-accent">
          <CircleCheck size={18} />
          Key gespeichert
          {saved && saved.quota.perMonth > 0 && (
            <span className="font-normal text-muted">
              · noch {saved.quota.left} von {saved.quota.perMonth} Suchen diesen Monat
            </span>
          )}
        </p>
      )}
      <p className="text-[15px] leading-relaxed">
        So sparst du Suchen: Gleiche Suchen kommen eine Stunde lang aus dem Speicher und kosten nichts. Die restlichen Suchen siehst du
        immer neben dem Suchen-Knopf.
      </p>
      <SearchCosts />
      <p className="text-xs text-muted">
        Den Key kannst du jederzeit unter „Einstellungen“ ändern. Das Kontingent startet jeden Monat neu.
      </p>
      <DockHint />
    </div>
  )
}

/** Mac: am Ende des Tutorials anbieten, die App ins Dock zu legen. */
function DockHint() {
  const info = useAppInfo()
  const installation = useInstallation(info.data?.desktop ?? false)
  if (installation.data?.platform !== 'mac' || installation.data.inDock) return null
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <p className="text-[15px] font-semibold">Tipp: Leg den Urlaubsplanner ins Dock</p>
      <DockRow installation={installation.data} />
    </div>
  )
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3 rounded-xl bg-surface-2 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <span className="flex flex-col">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs text-muted">{text}</span>
      </span>
    </li>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-accent-ink">
        {n}
      </span>
      <div className="flex flex-col gap-1 text-[15px] leading-relaxed">
        <span className="font-bold">{title}</span>
        <div className="flex flex-col gap-1 text-muted">{children}</div>
      </div>
    </li>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-xl border border-star/40 bg-star/10 px-3.5 py-3 text-sm leading-relaxed">
      <TriangleAlert size={17} className="mt-0.5 shrink-0 text-star" />
      <span>{children}</span>
    </p>
  )
}
