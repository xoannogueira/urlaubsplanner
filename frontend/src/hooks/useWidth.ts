import { useEffect, useRef, useState } from 'react'

/** Breite des Containers in Pixeln – Diagramme zeichnen in echter Größe, damit die Schrift nicht mitwächst. */
export function useWidth(fallback = 520) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}
