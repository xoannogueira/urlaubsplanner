import clsx from 'clsx'
import type { ReactNode } from 'react'

/** Rahmen für ein Diagramm mit Titel und kurzer Erklärung. */
export function Card({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        <p className="text-[13px] text-muted">{note}</p>
      </div>
      {children}
    </section>
  )
}

/** Umschalter in einer Gruppe (role="radio"). */
export function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'h-9 cursor-pointer rounded-lg px-3 text-sm font-bold',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

/** „Als Tabelle“ – dieselben Werte zum Nachlesen (auch für Screenreader). */
export function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-muted">Als Tabelle</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="py-1 pr-3 font-semibold text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-3 font-mono tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
