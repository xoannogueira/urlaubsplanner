import clsx from 'clsx'
import { Backpack, Check, ListChecks, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTripActions } from '../../api/trips'
import type { PackingItem, PackingList } from '../../api/types'
import { useTripWeather } from '../../api/weather'
import { useTripContext } from '../../components/layout/tripContext'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ProgressBar } from '../../components/ui/Feedback'
import { PackingTemplatesDialog } from './PackingTemplatesDialog'
import {
  applyTemplate,
  fromSuggestion,
  groupPacking,
  openSuggestions,
  packingCategories,
  suggestPacking,
  type PackingSuggestion,
} from '../../lib/packing'

const newId = () => crypto.randomUUID()

/**
 * Packliste: Die App schlägt passend zu Reisedauer, Wetter, Anreise, Mietwagen und Aktivitäten vor;
 * übernehmen, abhaken, eigene Punkte ergänzen und löschen. Weggeklickte Vorschläge kommen nicht wieder.
 */
export function PackingPage() {
  const { trip } = useTripContext()
  const { setPacking } = useTripActions(trip.id)
  const weather = useTripWeather(trip)
  const list = trip.packing
  const weatherDays = useMemo(() => [...weather.byDate.values()], [weather.byDate])
  const suggestions = useMemo(() => openSuggestions(list, suggestPacking(trip, weatherDays)), [list, trip, weatherDays])
  const groups = groupPacking(list.items)
  const packed = list.items.filter((i) => i.packed).length

  const save = (next: PackingList) => setPacking.mutate(next)
  const toggle = (item: PackingItem) =>
    save({ ...list, items: list.items.map((i) => (i.id === item.id ? { ...i, packed: !i.packed } : i)) })
  const remove = (item: PackingItem) =>
    save({
      items: list.items.filter((i) => i.id !== item.id),
      // Gelöschte Vorschläge sollen nicht gleich wieder vorgeschlagen werden.
      dismissed: item.suggestionKey ? [...list.dismissed, item.suggestionKey] : list.dismissed,
    })
  const take = (picked: PackingSuggestion[]) => save({ ...list, items: [...list.items, ...picked.map((s) => fromSuggestion(s, newId()))] })
  const dismiss = (s: PackingSuggestion) => save({ ...list, dismissed: [...list.dismissed, s.key] })
  const add = (text: string, category: string) =>
    save({ ...list, items: [...list.items, { id: newId(), text, category, packed: false, suggestionKey: null }] })
  const [templatesOpen, setTemplatesOpen] = useState(false)

  return (
    <div className="flex flex-col gap-5 px-4 pb-10 pt-6 md:px-8">
      <PackingTemplatesDialog
        open={templatesOpen}
        list={list}
        onClose={() => setTemplatesOpen(false)}
        onApply={(t) => save(applyTemplate(list, t.items, newId).list)}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" icon={<ListChecks size={16} />} onClick={() => setTemplatesOpen(true)}>
              Vorlagen
            </Button>
          </div>
          {list.items.length > 0 && (
            <section className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface p-5">
              <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
                <span className="text-[15px] font-bold">
                  {packed} von {list.items.length} gepackt
                </span>
                <ProgressBar value={packed} max={list.items.length} label="Packfortschritt" />
              </div>
              {packed > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => save({ ...list, items: list.items.map((i) => ({ ...i, packed: false })) })}
                >
                  Alle Haken entfernen
                </Button>
              )}
            </section>
          )}

          {list.items.length === 0 ? (
            <EmptyState
              icon={<Backpack size={22} />}
              title="Noch nichts auf der Packliste"
              text="Übernimm die Vorschläge – sie passen zu Reisedauer, Wetter, Anreise und deinen Aktivitäten – oder trag eigene Sachen ein."
              action={
                suggestions.length > 0 ? (
                  <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => take(suggestions)}>
                    Alle {suggestions.length} Vorschläge übernehmen
                  </Button>
                ) : undefined
              }
            />
          ) : (
            groups.map((group) => (
              <section key={group.category} className="flex flex-col gap-2" aria-labelledby={`pack-${group.category}`}>
                <h2 id={`pack-${group.category}`} className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">
                  {group.category}
                  <span className="ml-2 font-mono font-semibold normal-case tracking-normal">
                    {group.items.filter((i) => i.packed).length}/{group.items.length}
                  </span>
                </h2>
                <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.packed}
                          onChange={() => toggle(item)}
                          className="size-5 shrink-0 cursor-pointer"
                        />
                        <span className={clsx('min-w-0 break-words', item.packed && 'text-muted line-through')}>{item.text}</span>
                      </label>
                      <IconButton label={`${item.text} löschen`} className="size-8" onClick={() => remove(item)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          <AddItemForm onAdd={add} categories={[...new Set([...packingCategories, ...list.items.map((i) => i.category)])]} />
        </div>

        <aside className="flex h-fit flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 xl:sticky xl:top-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
                <Sparkles size={17} className="text-accent" />
                Vorschläge
              </h2>
              <p className="text-[13px] text-muted">
                Aus Reisedauer, Wetter, Anreise, Mietwagen und geplanten Aktivitäten
                {weather.loading ? ' – Wetter wird noch geladen …' : ''}.
              </p>
            </div>
            {suggestions.length > 1 && list.items.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => take(suggestions)}>
                Alle
              </Button>
            )}
          </div>
          {suggestions.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Check size={16} className="text-accent" />
              Alles übernommen oder aussortiert.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <li key={s.key} className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{s.text}</span>
                    <span className="text-xs text-muted">
                      {s.category}
                      {s.reason ? ` · ${s.reason}` : ''}
                    </span>
                  </span>
                  <IconButton label={`${s.text} übernehmen`} className="size-8" onClick={() => take([s])}>
                    <Plus size={15} />
                  </IconButton>
                  <IconButton label={`${s.text} nicht nötig`} className="size-8" onClick={() => dismiss(s)}>
                    <X size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {list.dismissed.length > 0 && (
            <button
              type="button"
              className="w-fit cursor-pointer text-xs font-semibold text-accent hover:underline"
              onClick={() => save({ ...list, dismissed: [] })}
            >
              Aussortierte Vorschläge ({list.dismissed.length}) wieder zeigen
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

function AddItemForm({ onAdd, categories }: { onAdd: (text: string, category: string) => void; categories: string[] }) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string>('Sonstiges')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim(), category)
    setText('')
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-line p-3">
      <label className="sr-only" htmlFor="pack-new">
        Eigener Eintrag
      </label>
      <input
        id="pack-new"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={120}
        placeholder="Eigenen Punkt hinzufügen, z. B. Kamera"
        className="h-10 min-w-[200px] flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
      />
      <label className="sr-only" htmlFor="pack-category">
        Kategorie
      </label>
      <select
        id="pack-category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="primary" icon={<Plus size={16} />} className="h-10" disabled={!text.trim()}>
        Hinzufügen
      </Button>
    </form>
  )
}
