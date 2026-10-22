/** Kleine Helfer für die selbst gezeichneten Diagramme. */

export const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`

/** Säule mit runden Ecken oben, unten gerade (am Boden verankert). */
export function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

/** 3–5 runde Achsenwerte. */
export function niceTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min)
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const stepSize = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const start = Math.floor(min / stepSize) * stepSize
  const ticks: number[] = []
  for (let t = start; t <= max + stepSize * 0.999; t += stepSize) ticks.push(Math.round(t))
  return ticks
}
