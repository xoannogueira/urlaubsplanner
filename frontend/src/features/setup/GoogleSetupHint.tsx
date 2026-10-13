import { KeyRound } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useSetup } from './setupContext'

/** Statt der Suche: Hinweis, dass der eigene SerpApi-Key fehlt – mit Knopf zum Tutorial. */
export function GoogleSetupHint({ what }: { what: string }) {
  const { openSetup } = useSetup()
  return (
    <section className="flex flex-col items-start gap-3 rounded-[20px] border border-dashed border-line p-6">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <KeyRound size={22} />
      </span>
      <h3 className="text-lg font-extrabold">{what} einrichten</h3>
      <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
        Die {what} holt echte Preise von Google über SerpApi. Dafür brauchst du einen eigenen, kostenlosen API-Key (250 Suchen im Monat für
        Flüge und Hotels zusammen). Das Einrichten dauert etwa zwei Minuten.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<KeyRound size={16} />} onClick={() => openSetup('getKey')}>
          Key holen und eintragen
        </Button>
        <Button onClick={() => openSetup('enterKey')}>Ich habe schon einen Key</Button>
      </div>
      <p className="text-sm text-muted">Bis dahin kannst du unter „Gespeichert“ Angebote weiterhin von Hand mit Link eintragen.</p>
    </section>
  )
}
