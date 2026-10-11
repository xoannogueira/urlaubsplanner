import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import clsx from 'clsx'
import * as maplibregl from 'maplibre-gl'
import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { arcPath, boundsOf } from '../../lib/geo'
import { useThemeValue } from '../../lib/theme'
import { MAP_STYLES, type MapAirport, type MapPin, type MapStage, type PinTone, type TripMapProps } from './types'

maplibregl.setWorkerUrl(workerUrl)

const ROUTE_SOURCE = 'trip-route'
const ARC_SOURCE = 'flight-arcs'

const toneClass: Record<PinTone, string> = {
  idea: 'border-line bg-surface text-text',
  favorite: 'border-star bg-surface text-star',
  chosen: 'border-accent bg-surface text-accent',
  booked: 'border-accent bg-accent-soft text-accent',
  unavailable: 'border-dashed border-danger bg-surface-2 text-muted',
}

const selectedClass = 'border-accent bg-accent text-accent-ink scale-110'

function pinClass(tone: PinTone, selected: boolean) {
  return clsx(
    'flex h-[30px] cursor-pointer items-center whitespace-nowrap rounded-full border px-2.5 font-mono text-[13px] font-semibold shadow-[0_4px_14px_rgb(0_0_0/0.28)] transition-[scale,background-color] duration-100 hover:scale-110',
    selected ? selectedClass : toneClass[tone],
  )
}

const airportClass =
  'rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-text shadow-[0_3px_10px_rgb(0_0_0/0.25)]'

const stageClass =
  'flex size-8 items-center justify-center rounded-full border-2 border-surface bg-accent font-mono text-sm font-bold text-accent-ink shadow-[0_4px_14px_rgb(0_0_0/0.3)]'

interface PinEntry {
  marker: Marker
  button: HTMLButtonElement
  pin: MapPin
}

/**
 * Die eigentliche Karte. Wird über TripMap per lazy() nachgeladen, damit MapLibre (~1 MB)
 * nur geladen wird, wenn wirklich eine Karte zu sehen ist.
 *
 * Pins sind HTML-Elemente: Bei bis zu ein paar hundert Punkten ist das flüssig und
 * lässt sich mit denselben Tailwind-Klassen stylen wie der Rest der App.
 */
export default function TripMapImpl({
  pins,
  arcs = [],
  airports = [],
  stages = [],
  showRoute,
  selectedId,
  onSelect,
  className,
  label,
  fitTo = 'all',
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pinEntries = useRef(new Map<string, PinEntry>())
  const stageMarkers = useRef<Marker[]>([])
  const airportMarkers = useRef<Marker[]>([])
  const fittedKey = useRef<string | null>(null)
  const onSelectRef = useRef(onSelect)
  const theme = useThemeValue()
  const [styleFailed, setStyleFailed] = useState(false)
  // Zählt hoch, wenn die Karte von unsichtbar (0 px) zu sichtbar wechselt – z. B. Umschalten Liste → Karte am Handy.
  const [shownCount, setShownCount] = useState(0)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Karte einmal anlegen.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLES[document.documentElement.classList.contains('dark') ? 'dark' : 'light'],
      center: [10, 45],
      zoom: 3,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('click', () => onSelectRef.current?.(null))
    map.on('error', (e) => {
      // Kacheln/Stil nicht erreichbar: Pins funktionieren trotzdem, wir zeigen nur einen Hinweis.
      if (!map.isStyleLoaded()) setStyleFailed(true)
      console.warn('Karte:', e.error?.message)
    })
    map.on('style.load', () => setStyleFailed(false))

    let hidden = container.clientWidth === 0 || container.clientHeight === 0
    const resize = new ResizeObserver(() => {
      map.resize()
      const nowHidden = container.clientWidth === 0 || container.clientHeight === 0
      if (hidden && !nowHidden) {
        fittedKey.current = null // war versteckt → Ausschnitt mit echter Größe neu berechnen
        setShownCount((n) => n + 1)
      }
      hidden = nowHidden
    })
    resize.observe(container)
    mapRef.current = map
    const entries = pinEntries.current

    return () => {
      resize.disconnect()
      entries.clear()
      stageMarkers.current = []
      airportMarkers.current = []
      fittedKey.current = null // neue Karte → Ausschnitt neu berechnen
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Dark/Light: nur den Stil tauschen, Marker bleiben stehen.
  useEffect(() => {
    mapRef.current?.setStyle(MAP_STYLES[theme], { diff: false })
  }, [theme])

  // Preis-Pins abgleichen: neue anlegen, alte entfernen, bestehende aktualisieren.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const entries = pinEntries.current
    const ids = new Set(pins.map((p) => p.id))

    for (const [id, entry] of entries) {
      if (!ids.has(id)) {
        entry.marker.remove()
        entries.delete(id)
      }
    }

    for (const pin of pins) {
      let entry = entries.get(pin.id)
      if (!entry) {
        const button = document.createElement('button')
        button.type = 'button'
        button.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectRef.current?.(pin.id)
        })
        const marker = new maplibregl.Marker({ element: wrap(button), anchor: 'center' }).setLngLat(lngLat(pin)).addTo(map)
        entry = { marker, button, pin }
        entries.set(pin.id, entry)
      }
      entry.pin = pin
      entry.marker.setLngLat(lngLat(pin))
      entry.button.textContent = pin.label
      entry.button.title = pin.title
      entry.button.setAttribute('aria-label', `${pin.title}, ${pin.label}`)
    }
  }, [pins])

  // Auswahl hervorheben und den gewählten Pin nach vorne holen.
  useEffect(() => {
    const map = mapRef.current
    for (const [id, entry] of pinEntries.current) {
      const selected = id === selectedId
      entry.button.setAttribute('class', pinClass(entry.pin.tone, selected))
      entry.button.setAttribute('aria-pressed', String(selected))
      entry.marker
        .getElement()
        .style.setProperty('z-index', selected ? '10' : entry.pin.tone === 'unavailable' ? '0' : entry.pin.tone === 'idea' ? '1' : '2')
      if (selected && map && !map.getBounds().contains(entry.marker.getLngLat())) {
        map.easeTo({ center: entry.marker.getLngLat(), duration: 400 })
      }
    }
  }, [selectedId, pins])

  // Etappen als nummerierte Punkte.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const marker of stageMarkers.current) marker.remove()
    stageMarkers.current = stages.map((stage) => {
      const el = document.createElement('div')
      el.className = stageClass
      el.textContent = String(stage.number)
      el.title = stage.name
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `Etappe ${stage.number}: ${stage.name}`)
      const marker = new maplibregl.Marker({ element: wrap(el), anchor: 'center' }).setLngLat(lngLat(stage)).addTo(map)
      marker.getElement().style.setProperty('z-index', '0') // Etappen liegen immer unter den Preis-Pins
      return marker
    })
  }, [stages])

  // Flughäfen als Code-Schilder.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const marker of airportMarkers.current) marker.remove()
    airportMarkers.current = airports.map((airport) => {
      const el = document.createElement('div')
      el.className = airportClass
      el.textContent = airport.code
      el.title = airport.title
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `Flughafen ${airport.title}`)
      const marker = new maplibregl.Marker({ element: wrap(el), anchor: 'center' }).setLngLat(lngLat(airport)).addTo(map)
      marker.getElement().style.setProperty('z-index', '3')
      return marker
    })
  }, [airports])

  // Flugbögen – wie die Route nach jedem Stilwechsel neu anlegen.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const features: Feature[] = arcs.map((arc) => ({
      type: 'Feature',
      properties: { active: arc.emphasis === 'active' },
      geometry: { type: 'LineString', coordinates: arcPath(arc.from, arc.to) },
    }))
    // Aktive Bögen zuletzt zeichnen, damit sie oben liegen.
    features.sort((a, b) => Number(a.properties?.active) - Number(b.properties?.active))

    const draw = () => {
      const data = { type: 'FeatureCollection' as const, features }
      const source = map.getSource<GeoJSONSource>(ARC_SOURCE)
      if (source) {
        source.setData(data)
        return
      }
      const css = getComputedStyle(document.documentElement)
      map.addSource(ARC_SOURCE, { type: 'geojson', data })
      map.addLayer({
        id: ARC_SOURCE,
        type: 'line',
        source: ARC_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['get', 'active'],
            css.getPropertyValue('--accent').trim() || '#2dd4bf',
            css.getPropertyValue('--muted').trim() || '#8aa0b8',
          ],
          'line-width': ['case', ['get', 'active'], 3, 1.5],
          'line-opacity': ['case', ['get', 'active'], 1, 0.45],
        },
      })
    }

    if (map.isStyleLoaded()) draw()
    map.on('style.load', draw)
    return () => {
      map.off('style.load', draw)
    }
  }, [arcs, theme])

  // Route zwischen den Etappen – muss nach jedem Stilwechsel neu angelegt werden.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const coordinates = showRoute ? stages.map((s) => [s.position.longitude, s.position.latitude]) : []

    const draw = () => {
      const data: Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
      const source = map.getSource<GeoJSONSource>(ROUTE_SOURCE)
      if (source) {
        source.setData(data)
        return
      }
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data })
      map.addLayer({
        id: ROUTE_SOURCE,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2dd4bf',
          'line-width': 3,
          'line-dasharray': [1, 2],
        },
      })
    }

    if (map.isStyleLoaded()) draw()
    map.on('style.load', draw)
    return () => {
      map.off('style.load', draw)
    }
  }, [stages, showRoute, theme])

  // Ausschnitt anpassen, wenn sich die Menge der Punkte ändert (nicht bei jeder Auswahl).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const pinPoints = [...pins.map((p) => p.position), ...airports.map((a) => a.position), ...arcs.flatMap((a) => [a.from, a.to])]
    const points = fitTo === 'pins' && pinPoints.length > 0 ? pinPoints : [...pinPoints, ...stages.map((s) => s.position)]
    const key = points.map((p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join('|')
    if (key === fittedKey.current) return
    const bounds = boundsOf(points)
    const container = map.getContainer()
    if (!bounds || container.clientWidth === 0 || container.clientHeight === 0) return
    const first = fittedKey.current === null
    fittedKey.current = key
    // Pins sind mittig verankert und können breit sein (Preise, Namen) – seitlich mehr Rand, aber nie mehr als ein Fünftel.
    const side = Math.min(110, Math.round(container.clientWidth * 0.2))
    map.fitBounds(bounds, { padding: { top: 56, bottom: 56, left: side, right: side }, maxZoom: 14, duration: first ? 0 : 500 })
  }, [pins, airports, arcs, stages, fitTo, shownCount])

  return (
    <div className={clsx('relative overflow-hidden rounded-[20px] border border-line bg-surface-2', className)}>
      {/* MapLibre setzt auf diesem Element selbst position: relative – daher volle Größe statt absolute. */}
      <div ref={containerRef} role="region" aria-label={label} className="h-full w-full" />
      {styleFailed && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-muted shadow">
          Kartenhintergrund nicht geladen – Pins funktionieren trotzdem.
        </p>
      )}
    </div>
  )
}

/** MapLibre setzt auf dem Marker-Element selbst `transform`; deshalb steckt der Pin in einem Wrapper. */
function wrap(child: HTMLElement): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.appendChild(child)
  return wrapper
}

function lngLat(item: MapPin | MapStage | MapAirport): [number, number] {
  return [item.position.longitude, item.position.latitude]
}
