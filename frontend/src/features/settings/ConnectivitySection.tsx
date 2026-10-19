import { CircleCheck, CircleX, LoaderCircle, Wifi } from 'lucide-react'
import { useState } from 'react'
import { checkConnectivity, type ConnectivityResult } from '../../api/app'
import { Button } from '../../components/ui/Button'

/**
 * „Verbindung prüfen“: zeigt pro Dienst, ob die App ihn erreicht – und wenn nicht, warum (z. B. Antivirenprogramm).
 * Das Ergebnis lässt sich als Text kopieren und weitergeben.
 */
export function ConnectivitySection() {
  const [results, setResults] = useState<ConnectivityResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setResults(await checkConnectivity())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prüfung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }
  const failed = results?.filter((r) => !r.ok) ?? []
  // Der Antivirus-Tipp passt nur, wenn etwas blockiert oder ein Zertifikat abgelehnt wurde.
  const blocked = failed.some((r) => !r.kind || ['blockiert', 'zertifikat', 'zeit', 'sonstiges'].includes(r.kind))
  const encryption = failed.some((r) => r.kind === 'verschluesselung')
  const report = results
    ?.map(
      (r) =>
        `${r.ok ? 'OK' : 'FEHLER'} – ${r.name} (${r.url})${r.problem ? `: ${r.problem}` : ''}${r.note ? ` – ${r.note}` : ''}${
          r.detail ? ` [${r.detail}]` : ''
        }`,
    )
    .join('\n')

  return (
    <section id="verbindung" className="flex scroll-mt-6 flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold">Verbindung prüfen</h2>
        <p className="text-sm text-muted">
          Findet die Suche nichts oder meldet Fehler? Hier siehst du, ob die App die Dienste erreicht. Häufige Ursache unter Windows: ein
          Antivirenprogramm wie Avast oder eine Firewall blockiert die App.
        </p>
      </div>
      <Button
        className="w-fit"
        icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <Wifi size={16} />}
        onClick={() => void run()}
        disabled={busy}
      >
        {busy ? 'Prüfe …' : 'Verbindung prüfen'}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {results && (
        <>
          <ul className="flex flex-col divide-y divide-line rounded-xl bg-surface-2">
            {results.map((r) => (
              <li key={r.name} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                {r.ok ? (
                  <CircleCheck size={17} className="mt-0.5 shrink-0 text-accent" aria-label="erreichbar" />
                ) : (
                  <CircleX size={17} className="mt-0.5 shrink-0 text-danger" aria-label="nicht erreichbar" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{r.name}</span>
                  {r.problem && <span className="text-danger">{r.problem}</span>}
                  {r.note && <span className="text-muted">{r.note}</span>}
                  {r.detail && <span className="font-mono text-xs break-words text-muted">{r.detail}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">{r.ok ? `${r.milliseconds} ms` : r.url}</span>
              </li>
            ))}
          </ul>
          {failed.length === 0 && (
            <p className="text-sm text-muted">Alles erreichbar. Liegt das Problem woanders, schick die Fehlermeldung aus der Suche.</p>
          )}
          {encryption && (
            <div className="flex flex-col gap-2 rounded-xl border border-star/40 bg-star/10 px-4 py-3 text-sm">
              <strong>Verschlüsselung passt nicht:</strong>
              <span>
                Das liegt meist an einem älteren Betriebssystem (z. B. Windows 10), nicht an Antivirus oder Firewall. Hilft: Windows bzw.
                macOS aktualisieren. Und schick das Ergebnis an Xoan.
              </span>
            </div>
          )}
          {blocked && (
            <div className="flex flex-col gap-2 rounded-xl border border-star/40 bg-star/10 px-4 py-3 text-sm">
              <strong>So behebst du es meist:</strong>
              <ol className="list-decimal pl-5">
                <li>
                  Im Antivirenprogramm (z. B. Avast: Menü → Einstellungen → Ausnahmen) den Urlaubsplanner-Programmordner als Ausnahme
                  hinzufügen.
                </li>
                <li>Erscheint eine Firewall-Frage, „Zulassen“ wählen – oder die App in der Firewall freigeben.</li>
                <li>App schließen, neu öffnen und hier noch einmal prüfen.</li>
              </ol>
            </div>
          )}
          <Button
            size="sm"
            className="w-fit"
            onClick={() => {
              navigator.clipboard
                ?.writeText(report ?? '')
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }}
          >
            {copied ? 'Kopiert' : 'Ergebnis kopieren'}
          </Button>
        </>
      )}
    </section>
  )
}
