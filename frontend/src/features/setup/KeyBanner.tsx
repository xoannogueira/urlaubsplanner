import { KeyRound, TriangleAlert } from 'lucide-react'
import { useSettings } from '../../api/app'
import { useFlightSearchStatus } from '../../api/flights'
import { Button } from '../../components/ui/Button'
import { useSetup } from './setupContext'
import { PriceDropBanner } from './PriceDropBanner'
import { UpdateBanner } from './UpdateBanner'

/** Ab so wenigen restlichen Google-Suchen warnen. */
export const LOW_QUOTA = 25

/** Hinweise oben auf jeder Seite: neue App-Version, gefallene Flugpreise, fehlender API-Key, wenig Suchen übrig. */
export function KeyBanner() {
  return (
    <>
      <UpdateBanner />
      <PriceDropBanner />
      <KeyHint />
    </>
  )
}

/** Ohne eigenen API-Key keine Flug-/Hotelsuche; wenig oder keine Suchen mehr übrig. */
function KeyHint() {
  const settings = useSettings()
  const status = useFlightSearchStatus()
  const { openSetup } = useSetup()
  const data = settings.data
  if (!data) return null

  const usesGoogle = data.flightsProvider === 'serpapi' || data.hotelsProvider === 'serpapi'
  if (usesGoogle && !data.serpApi.configured) {
    return (
      <Banner tone="warn">
        <span className="flex-1">
          <strong>Flug- und Hotelsuche sind noch nicht eingerichtet.</strong> Dafür brauchst du einen eigenen, kostenlosen API-Key (250
          Suchen im Monat).
        </span>
        <Button variant="primary" size="sm" icon={<KeyRound size={15} />} onClick={() => openSetup('welcome')}>
          Jetzt einrichten
        </Button>
      </Banner>
    )
  }

  const quota = status.data?.provider === 'serpapi' ? status.data.quota : null
  if (quota && quota.left <= 0) {
    return (
      <Banner tone="danger">
        <span className="flex-1">
          <strong>Alle Google-Suchen für diesen Monat sind verbraucht.</strong> Flug- und Hotelsuche gehen wieder, sobald das Kontingent zum
          Monatsbeginn neu startet. Gemerkte Flüge und Hotels bleiben erhalten.
        </span>
      </Banner>
    )
  }
  if (quota && quota.left <= LOW_QUOTA) {
    return (
      <Banner tone="warn">
        <span className="flex-1">
          <strong>Nur noch {quota.left} Google-Suchen</strong> für diesen Monat. Gleiche Suchen innerhalb einer Stunde kosten nichts –
          Rückflüge und weitere Hotels nur aufklappen, wenn du sie brauchst.
        </span>
      </Banner>
    )
  }
  return null
}

function Banner({ tone, children }: { tone: 'warn' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === 'danger'
          ? 'flex flex-wrap items-center gap-3 border-b border-danger/40 bg-danger/10 px-4 py-3 text-sm md:px-8'
          : 'flex flex-wrap items-center gap-3 border-b border-star/40 bg-star/10 px-4 py-3 text-sm md:px-8'
      }
    >
      <TriangleAlert size={17} className={tone === 'danger' ? 'shrink-0 text-danger' : 'shrink-0 text-star'} />
      {children}
    </div>
  )
}
