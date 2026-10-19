import clsx from 'clsx'
import { ArrowRight, Plus, ReceiptText, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTripActions } from '../../api/trips'
import type { TripMember, TripParty } from '../../api/types'
import { useTripContext } from '../../components/layout/tripContext'
import { Button, IconButton } from '../../components/ui/Button'
import { formatEuro } from '../../lib/format'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { calculateSplit, removalImpact, type SplitItem } from '../../lib/split'

const newId = () => crypto.randomUUID()
const euro = (n: number) => formatEuro(n).replace(/,00(?=\s?€)/, '')
const exact = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

/**
 * Mitreisende eintragen und festhalten, wer was bezahlt hat und für wen. Daraus: Anteil pro Person
 * und „wer schuldet wem“ mit möglichst wenigen Überweisungen.
 */
export function CostSplitPage() {
  const { trip } = useTripContext()
  const { setParty } = useTripActions(trip.id)
  const party = trip.party
  const members = party.members
  const split = calculateSplit(trip)
  const save = (next: TripParty) => setParty.mutate(next)
  const [toRemove, setToRemove] = useState<TripMember | null>(null)
  const removeMember = (m: TripMember) => save({ ...party, members: members.filter((x) => x.id !== m.id) })
  // Hat die Person etwas gekauft oder ist sie nur bei einzelnen Posten dabei, erst nachfragen.
  const askRemove = (m: TripMember) => {
    const impact = removalImpact(split, m.id, members.length)
    if (impact.bought.length === 0 && impact.sharedIn.length === 0) removeMember(m)
    else setToRemove(m)
  }
  const impact = toRemove ? removalImpact(split, toRemove.id, members.length) : null

  const setShare = (item: SplitItem, change: { paidBy?: string | null; for?: string[] }) => {
    const forList = (list: string[]) => (list.length === members.length ? [] : list)
    if (item.source === 'option') {
      const current = party.optionShares.find((s) => s.optionId === item.id) ?? { optionId: item.id, paidBy: null, for: [] }
      const next = { ...current, ...change, for: forList(change.for ?? current.for) }
      save({ ...party, optionShares: [...party.optionShares.filter((s) => s.optionId !== item.id), next] })
    } else {
      save({
        ...party,
        expenses: party.expenses.map((e) => (e.id === item.id ? { ...e, ...change, for: forList(change.for ?? e.for) } : e)),
      })
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-10 pt-6 md:px-8">
      <MembersCard
        members={members}
        travelers={trip.travelers}
        onChange={(next) => save({ ...party, members: next })}
        onRemove={askRemove}
        pending={setParty.isPending}
      />
      <ConfirmDialog
        open={toRemove !== null}
        title={`${toRemove?.name ?? ''} entfernen?`}
        message={impact && toRemove ? removalMessage(toRemove.name, impact) : ''}
        confirmLabel="Trotzdem entfernen"
        onClose={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) removeMember(toRemove)
          setToRemove(null)
        }}
      />

      {members.length > 0 && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-[17px] font-extrabold">Wer hat was gekauft?</h2>
              <p className="text-[13px] text-muted">
                Ausgewählte und gebuchte Flüge, Hotels & Co. mit Preis stehen automatisch hier. Standard: für alle.
              </p>
            </div>
            {split.items.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Kosten – wähle Buchungen mit Preis aus oder trag unten eine Ausgabe ein.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {split.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    members={members}
                    onPaidBy={(paidBy) => setShare(item, { paidBy })}
                    onFor={(list) => setShare(item, { for: list })}
                    onDelete={
                      item.source === 'expense'
                        ? () => save({ ...party, expenses: party.expenses.filter((e) => e.id !== item.id) })
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
            <AddExpenseForm
              members={members}
              onAdd={(title, amount, paidBy) =>
                save({ ...party, expenses: [...party.expenses, { id: newId(), title, amount, paidBy, for: [], date: null }] })
              }
            />
          </section>

          <aside className="flex h-fit flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 xl:sticky xl:top-6">
            <h2 className="text-[17px] font-extrabold">Abrechnung</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-bold">Person</th>
                  <th className="pb-2 text-right font-bold">Anteil</th>
                  <th className="pb-2 text-right font-bold">Gekauft</th>
                  <th className="pb-2 text-right font-bold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {split.people.map((p) => (
                  <tr key={p.member.id} className="border-t border-line">
                    <td className="py-2 font-semibold">{p.member.name}</td>
                    <td className="py-2 text-right font-mono">{euro(p.share)}</td>
                    <td className="py-2 text-right font-mono">{euro(p.paid)}</td>
                    <td
                      className={clsx(
                        'py-2 text-right font-mono font-semibold',
                        p.balance > 0 ? 'text-accent' : p.balance < 0 ? 'text-star' : 'text-muted',
                      )}
                    >
                      {p.balance > 0 ? '+' : ''}
                      {euro(p.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">Wer schuldet wem</h3>
              {split.transfers.length === 0 ? (
                <p className="text-sm text-muted">
                  {split.unpaid > 0 && split.total === split.unpaid
                    ? 'Noch bei keinem Posten eingetragen, wer ihn gekauft hat.'
                    : 'Alles ausgeglichen.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {split.transfers.map((t) => (
                    <li key={`${t.from.id}-${t.to.id}`} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                      <span className="font-semibold">{t.from.name}</span>
                      <ArrowRight size={14} className="text-muted" aria-label="zahlt an" />
                      <span className="font-semibold">{t.to.name}</span>
                      <span className="ml-auto font-mono font-semibold">{exact(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {split.unpaid > 0 && (
                <p className="text-xs text-muted">
                  {euro(split.unpaid)} ohne Käufer – zählen zum Anteil, aber erst zum Ausgleich, wenn eingetragen ist, wer sie gekauft hat.
                </p>
              )}
            </div>
            <p className="border-t border-line pt-3 text-sm">
              Gesamt <span className="float-right font-mono font-semibold">{euro(split.total)}</span>
            </p>
          </aside>
        </div>
      )}
      {members.length > 0 && split.items.length > 0 && <CalculationCard split={split} />}
    </div>
  )
}

/** Rechenweg: wie Anteil, Saldo und Überweisungen zustande kommen – pro Person zum Aufklappen. */
function CalculationCard({ split }: { split: ReturnType<typeof calculateSplit> }) {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5" aria-labelledby="rechenweg">
      <h2 id="rechenweg" className="text-[17px] font-extrabold">
        So wird gerechnet
      </h2>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
        <li>
          <strong className="text-text">Anteil:</strong> Jeder Posten wird gleichmäßig auf die Personen verteilt, für die er ist (Standard:
          alle). Krumme Beträge werden auf den Cent genau verteilt – ein übriger Cent geht an die ersten in der Liste.
        </li>
        <li>
          <strong className="text-text">Saldo:</strong> Was jemand gekauft hat minus sein Anteil an den Posten, die schon gekauft sind. Plus
          = bekommt Geld zurück, minus = muss noch zahlen. Posten ohne Käufer zählen erst mit, wenn eingetragen ist, wer sie gekauft hat.
        </li>
        <li>
          <strong className="text-text">Wer schuldet wem:</strong> Wer am meisten schuldet, zahlt an den, der am meisten zurückbekommt – so
          lange, bis alles auf null steht. Das braucht höchstens eine Überweisung weniger, als es Personen gibt.
        </li>
      </ol>
      <ul className="flex flex-col gap-2">
        {split.people.map((p) => (
          <li key={p.member.id}>
            <details className="group rounded-xl bg-surface-2 px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                <span className="font-bold">{p.member.name}</span>
                <span className="text-muted">
                  Anteil {exact(p.share)} · gekauft {exact(p.paid)} · Saldo {p.balance > 0 ? '+' : ''}
                  {exact(p.balance)}
                </span>
                <span className="ml-auto text-xs font-semibold text-accent group-open:hidden">Rechenweg</span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 font-mono text-[13px]">
                <div>
                  {p.parts.map((part, i) => (
                    <div key={i} className={clsx('flex gap-3', !part.bought && 'text-muted')}>
                      <span className="min-w-0 flex-1 truncate font-sans">
                        {part.title}
                        {!part.bought && ' (noch ohne Käufer)'}
                      </span>
                      <span>
                        {exact(part.amount)} ÷ {part.people} = {exact(part.each)}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 flex gap-3 border-t border-line pt-1 font-semibold">
                    <span className="flex-1 font-sans">Anteil</span>
                    <span>{exact(p.share)}</span>
                  </div>
                </div>
                <div>
                  {p.purchases.length === 0 ? (
                    <div className="font-sans text-muted">Noch nichts gekauft.</div>
                  ) : (
                    p.purchases.map((x, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="min-w-0 flex-1 truncate font-sans">Gekauft: {x.title}</span>
                        <span>{exact(x.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-3 border-t border-line pt-1 font-semibold">
                  <span className="flex-1 font-sans">Saldo = gekauft − Anteil an Gekauftem</span>
                  <span>
                    {exact(p.paid)} − {exact(p.shareOfBought)} = {p.balance > 0 ? '+' : ''}
                    {exact(p.balance)}
                  </span>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

function removalMessage(name: string, impact: ReturnType<typeof removalImpact>): string {
  const parts: string[] = []
  if (impact.bought.length > 0)
    parts.push(
      `${name} hat gekauft: ${impact.bought.map((b) => `${b.title} (${euro(b.amount)})`).join(', ')}. Diese Posten stehen danach ohne Käufer da – trag dann ein, wer sie bezahlt hat.`,
    )
  if (impact.sharedIn.length > 0)
    parts.push(`${name} ist bei ${impact.sharedIn.join(', ')} dabei – diese Posten werden auf die anderen aufgeteilt.`)
  return parts.join(' ')
}

function MembersCard({
  members,
  travelers,
  onChange,
  onRemove,
  pending,
}: {
  members: TripMember[]
  travelers: number
  onChange: (members: TripMember[]) => void
  onRemove: (member: TripMember) => void
  pending: boolean
}) {
  const [name, setName] = useState('')
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onChange([...members, { id: newId(), name: name.trim() }])
    setName('')
  }
  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
          <Users size={18} />
          Mitreisende
        </h2>
        <p className="text-[13px] text-muted">
          {members.length === 0
            ? `Trag ein, wer mitkommt – dann rechnet die App aus, wer wem was schuldet. Die Personenzahl (gerade ${travelers}) richtet sich danach nach den Namen.`
            : 'Die Personenzahl der Reise folgt dieser Liste. Die Namen stehen auch in der PDF.'}
        </p>
      </div>
      {members.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-1 pr-1">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <input
                aria-label={`Name von ${m.name}`}
                defaultValue={m.name}
                maxLength={60}
                size={Math.max(m.name.length, 3)}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (next && next !== m.name) onChange(members.map((x) => (x.id === m.id ? { ...x, name: next } : x)))
                  else e.target.value = m.name
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="bg-transparent px-1 text-sm font-semibold outline-none focus:underline"
              />
              <button
                type="button"
                aria-label={`${m.name} entfernen`}
                title={`${m.name} entfernen`}
                onClick={() => onRemove(m)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <label htmlFor="member-name" className="sr-only">
          Name
        </label>
        <input
          id="member-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={members.length === 0 ? 'Dein Name' : 'Name, z. B. Lena'}
          className="h-10 min-w-[180px] flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent sm:max-w-xs"
        />
        <Button type="submit" size="sm" variant="primary" icon={<UserPlus size={16} />} className="h-10" disabled={!name.trim() || pending}>
          Hinzufügen
        </Button>
      </form>
    </section>
  )
}

function ItemRow({
  item,
  members,
  onPaidBy,
  onFor,
  onDelete,
}: {
  item: SplitItem
  members: TripMember[]
  onPaidBy: (id: string | null) => void
  onFor: (ids: string[]) => void
  onDelete?: () => void
}) {
  const everyone = item.for.length === members.length
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {item.source === 'expense' && <ReceiptText size={15} className="shrink-0 text-muted" aria-label="Eigene Ausgabe" />}
          <span className="min-w-0 break-words font-semibold">{item.title}</span>
        </span>
        <span className="font-mono font-semibold">{exact(item.amount)}</span>
        {onDelete && (
          <IconButton label={`${item.title} löschen`} className="size-8" onClick={onDelete}>
            <Trash2 size={14} />
          </IconButton>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted">Gekauft von</span>
          <select
            value={item.paidBy ?? ''}
            onChange={(e) => onPaidBy(e.target.value || null)}
            className={clsx(
              'h-8 rounded-lg border bg-surface-2 px-2 text-sm font-semibold outline-none focus:border-accent',
              item.paidBy ? 'border-line' : 'border-star/50 text-star',
            )}
          >
            <option value="">noch offen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Für wen: ${item.title}`}>
          <span className="text-muted">für</span>
          <Chip active={everyone} onClick={() => onFor(members.map((m) => m.id))}>
            alle
          </Chip>
          {members.length > 1 &&
            members.map((m) => {
              const on = !everyone && item.for.includes(m.id)
              return (
                <Chip
                  key={m.id}
                  active={on}
                  onClick={() => {
                    const base = everyone ? [] : item.for
                    const next = on ? base.filter((id) => id !== m.id) : [...base, m.id]
                    onFor(next.length === 0 ? members.map((x) => x.id) : next)
                  }}
                >
                  {m.name}
                </Chip>
              )
            })}
        </div>
      </div>
    </li>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'h-7 cursor-pointer rounded-full border px-2.5 text-xs font-bold transition-colors duration-100',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function AddExpenseForm({
  members,
  onAdd,
}: {
  members: TripMember[]
  onAdd: (title: string, amount: number, paidBy: string | null) => void
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(members[0]?.id ?? '')
  const value = Number(amount.replace(',', '.'))
  const valid = title.trim() !== '' && amount !== '' && Number.isFinite(value) && value >= 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onAdd(title.trim(), Math.round(value * 100) / 100, paidBy || null)
    setTitle('')
    setAmount('')
  }
  const control = 'h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent'
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-line p-3">
      <input
        aria-label="Ausgabe"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Weitere Ausgabe, z. B. Abendessen"
        className={clsx(control, 'min-w-[180px] flex-1')}
      />
      <input
        aria-label="Betrag in €"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        pattern="[0-9]+([.,][0-9]{1,2})?"
        placeholder="€"
        className={clsx(control, 'w-24')}
      />
      <select aria-label="Gekauft von" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={control}>
        <option value="">noch offen</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="primary" icon={<Plus size={16} />} className="h-10" disabled={!valid}>
        Hinzufügen
      </Button>
    </form>
  )
}
