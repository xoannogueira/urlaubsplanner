import { CalendarRange, Lightbulb, MapPin, Pencil, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { rememberStageGuideDismissed } from '../../lib/stageGuide'

/** Kurze Erklärung: Was ist eine Etappe, wozu dient sie, was kann man ändern. Erscheint beim ersten Mal, danach über „?“. */
export function StageGuide({ onClose }: { onClose: () => void }) {
  const close = () => {
    rememberStageGuideDismissed()
    onClose()
  }
  return (
    <section
      aria-labelledby="etappen-hilfe"
      className="relative flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4"
    >
      <IconButton label="Erklärung schließen" className="absolute right-2 top-2 size-8" onClick={close}>
        <X size={14} />
      </IconButton>
      <h3 id="etappen-hilfe" className="flex items-center gap-2 pr-10 font-extrabold">
        <Lightbulb size={17} className="text-accent" />
        So funktionieren Etappen
      </h3>
      <ul className="flex flex-col gap-2.5 text-sm">
        <Point icon={<MapPin size={15} />} title="Eine Etappe = ein Ort, an dem du übernachtest">
          z. B. Lissabon vom 12. bis 16. Mai. Tagesausflüge brauchen keine eigene Etappe – die planst du als Aktivität.
        </Point>
        <Point icon={<Lightbulb size={15} />} title="Wozu?">
          Hotels und Aktivitäten gehören zu einer Etappe. Hotelsuche, Vorschläge und Wetter nutzen ihren Ort, und Nächte ohne Hotel tauchen
          unter „Offene Punkte“ auf.
        </Point>
        <Point icon={<CalendarRange size={15} />} title="Zeitraum">
          Etappen liegen im Reisezeitraum oben in der Kopfzeile. Legst du eine Etappe außerhalb an, wird der Reisezeitraum verlängert.
          Änderst du den Reisezeitraum, wandern erste und letzte Etappe mit.
        </Point>
        <Point icon={<Pencil size={15} />} title="Ändern">
          Mit dem Stift änderst du Ort, Daten und Beschreibung. Löschst du eine Etappe, bleiben gespeicherte Hotels & Co. erhalten und
          gelten dann für die ganze Reise.
        </Point>
      </ul>
      <Button size="sm" variant="primary" className="w-fit" onClick={close}>
        Verstanden
      </Button>
    </section>
  )
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <span>
        <strong>{title}.</strong> <span className="text-muted">{children}</span>
      </span>
    </li>
  )
}
