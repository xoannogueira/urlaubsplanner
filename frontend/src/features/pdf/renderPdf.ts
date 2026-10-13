import type { Trip } from '../../api/types'
import { buildTripPdf } from './tripPdf'

/**
 * Erzeugt die PDF im Browser. pdfmake und die Schrift (zusammen gut 2 MB) werden erst beim Klick geladen,
 * damit der Rest der App schnell bleibt.
 */
export async function renderTripPdf(trip: Trip, today: string): Promise<Blob> {
  const [pdfMake, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  // Je nach Bundler kommen die Module mit oder ohne „default“-Hülle an.
  const make = ('default' in pdfMake ? pdfMake.default : pdfMake) as typeof import('pdfmake/build/pdfmake')
  const vfs = ('default' in fonts ? fonts.default : fonts) as Parameters<typeof make.addVirtualFileSystem>[0]
  make.addVirtualFileSystem(vfs)
  make.addFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  })
  return make.createPdf(buildTripPdf(trip, { today })).getBlob()
}

/** Dateiname für den Browser-Download (außerhalb der Desktop-App). */
export const pdfFileName = (trip: Trip) => `Reiseplan ${trip.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Reise'}.pdf`
