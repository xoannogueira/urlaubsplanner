import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('animate-pulse rounded-2xl bg-surface-2', className)} />
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <h3 className="text-lg font-extrabold">{title}</h3>
      <p className="max-w-md text-[15px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[20px] border border-danger/40 bg-danger/10 p-6">
      <h3 className="font-extrabold text-danger">Das hat nicht geklappt</h3>
      <p className="text-[15px] text-text">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="cursor-pointer text-sm font-bold text-accent underline-offset-4 hover:underline">
          Erneut versuchen
        </button>
      )}
    </div>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full bg-surface-3"
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
    </div>
  )
}
