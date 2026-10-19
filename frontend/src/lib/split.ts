import type { Trip, TripMember } from '../api/types'
import { isChosen } from './options'

export interface SplitItem {
  /** Option-ID oder Ausgaben-ID */
  id: string
  source: 'option' | 'expense'
  title: string
  amount: number
  paidBy: string | null
  /** Für wen – immer ausgefüllt (leer gespeichert = alle) */
  for: string[]
}

/** Ein Posten im Rechenweg einer Person: „Casa Lagos: 840 € ÷ 3 = 280 €“ */
export interface SharePart {
  title: string
  amount: number
  people: number
  each: number
  /** schon gekauft (zählt für den Ausgleich) */
  bought: boolean
}

export interface PersonBalance {
  member: TripMember
  /** Rechenweg: Anteile an den einzelnen Posten */
  parts: SharePart[]
  /** Rechenweg: was die Person gekauft hat */
  purchases: { title: string; amount: number }[]
  /** Anteil nur an den schon gekauften Posten (Grundlage für den Saldo) */
  shareOfBought: number
  /** Anteil an allen Kosten */
  share: number
  /** selbst bezahlt */
  paid: number
  /** + bekommt Geld zurück, − muss noch zahlen (nur bezahlte Posten) */
  balance: number
}

export interface Transfer {
  from: TripMember
  to: TripMember
  amount: number
}

export interface Split {
  items: SplitItem[]
  people: PersonBalance[]
  transfers: Transfer[]
  total: number
  /** Posten, bei denen noch niemand als Zahler eingetragen ist */
  unpaid: number
}

const cents = (n: number) => Math.round(n * 100) / 100

/** Alle Posten: ausgewählte/gebuchte Buchungen mit Preis plus eigene Ausgaben. */
export function splitItems(trip: Trip): SplitItem[] {
  const all = trip.party.members.map((m) => m.id)
  const forOf = (list: string[]) => (list.length > 0 ? list : all)
  const options = trip.options
    .filter((o) => isChosen(o) && (o.totalPrice ?? 0) > 0)
    .map((o): SplitItem => {
      const share = trip.party.optionShares.find((s) => s.optionId === o.id)
      return {
        id: o.id,
        source: 'option',
        title: o.title,
        amount: o.totalPrice!,
        paidBy: share?.paidBy ?? null,
        for: forOf(share?.for ?? []),
      }
    })
  const expenses = trip.party.expenses.map((e): SplitItem => ({
    id: e.id,
    source: 'expense',
    title: e.title,
    amount: e.amount,
    paidBy: e.paidBy,
    for: forOf(e.for),
  }))
  return [...options, ...expenses]
}

/**
 * Wer hat wie viel bezahlt, wer trägt wie viel – und mit möglichst wenigen Überweisungen ausgleichen.
 * Gerechnet wird in ganzen Cent; Rest-Cent gehen reihum an die ersten Beteiligten, damit alles aufgeht.
 */
export function calculateSplit(trip: Trip): Split {
  const members = trip.party.members
  const items = splitItems(trip)
  const zero = () => new Map(members.map((m) => [m.id, 0]))
  const share = zero()
  const paid = zero()
  const owedForPaid = zero()
  const parts = new Map(members.map((m) => [m.id, [] as SharePart[]]))
  const purchases = new Map(members.map((m) => [m.id, [] as { title: string; amount: number }[]]))
  let unpaid = 0
  for (const item of items) {
    const people = members.map((m) => m.id).filter((id) => item.for.includes(id))
    if (people.length === 0) continue
    const total = Math.round(item.amount * 100)
    const base = Math.floor(total / people.length)
    const bought = !!item.paidBy && paid.has(item.paidBy)
    people.forEach((id, index) => {
      const each = base + (index < total - base * people.length ? 1 : 0)
      share.set(id, share.get(id)! + each)
      if (bought) owedForPaid.set(id, owedForPaid.get(id)! + each)
      parts.get(id)!.push({ title: item.title, amount: total / 100, people: people.length, each: each / 100, bought })
    })
    if (bought) {
      paid.set(item.paidBy!, paid.get(item.paidBy!)! + total)
      purchases.get(item.paidBy!)!.push({ title: item.title, amount: total / 100 })
    } else unpaid += total
  }

  const people = members.map((member) => ({
    member,
    parts: parts.get(member.id)!,
    purchases: purchases.get(member.id)!,
    shareOfBought: owedForPaid.get(member.id)! / 100,
    share: share.get(member.id)! / 100,
    paid: paid.get(member.id)! / 100,
    balance: (paid.get(member.id)! - owedForPaid.get(member.id)!) / 100,
  }))

  // Ausgleich in Cent: wer am meisten schuldet, zahlt an den, der am meisten bekommt.
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ member: p.member, rest: Math.round(-p.balance * 100) }))
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ member: p.member, rest: Math.round(p.balance * 100) }))
  debtors.sort((a, b) => b.rest - a.rest)
  creditors.sort((a, b) => b.rest - a.rest)
  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].rest, creditors[j].rest)
    if (amount > 0) transfers.push({ from: debtors[i].member, to: creditors[j].member, amount: amount / 100 })
    debtors[i].rest -= amount
    creditors[j].rest -= amount
    if (debtors[i].rest === 0) i++
    if (creditors[j].rest === 0) j++
  }

  return { items, people, transfers, total: cents(items.reduce((s, x) => s + x.amount, 0)), unpaid: unpaid / 100 }
}

/** Was beim Entfernen einer Person passiert: ihre Käufe verlieren den Käufer, ausgewählte Anteile fallen weg. */
export interface RemovalImpact {
  bought: { title: string; amount: number }[]
  /** Posten nur für einige (nicht alle), bei denen die Person dabei ist */
  sharedIn: string[]
}

export function removalImpact(split: Split, memberId: string, memberCount: number): RemovalImpact {
  return {
    bought: split.items.filter((i) => i.paidBy === memberId).map((i) => ({ title: i.title, amount: i.amount })),
    sharedIn: split.items.filter((i) => i.for.length < memberCount && i.for.includes(memberId)).map((i) => i.title),
  }
}
