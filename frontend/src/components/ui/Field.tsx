import clsx from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const controlClass =
  'h-11 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[15px] font-medium text-text placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none aria-invalid:border-danger'

interface FieldShellProps {
  label: string
  error?: string[]
  hint?: string
  className?: string
  children: (ids: { id: string; describedBy?: string }) => ReactNode
}

/** Label über dem Feld, Fehler/Hinweis darunter – per id verknüpft, damit Screenreader alles vorlesen. */
function FieldShell({ label, error, hint, className, children }: FieldShellProps) {
  const id = useId()
  const messageId = `${id}-msg`
  const hasMessage = Boolean(error?.length || hint)
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-bold text-muted">
        {label}
      </label>
      {children({ id, describedBy: hasMessage ? messageId : undefined })}
      {error?.length ? (
        <span id={messageId} className="text-[13px] font-medium text-danger" role="alert">
          {error.join(' ')}
        </span>
      ) : hint ? (
        <span id={messageId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & Omit<FieldShellProps, 'children'>

export function InputField({ label, error, hint, className, ...rest }: InputFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={className}>
      {(ids) => (
        <input
          id={ids.id}
          aria-describedby={ids.describedBy}
          className={controlClass}
          aria-invalid={error?.length ? true : undefined}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & Omit<FieldShellProps, 'children'> & { children: ReactNode }

export function SelectField({ label, error, hint, className, children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={className}>
      {(ids) => (
        <select
          id={ids.id}
          aria-describedby={ids.describedBy}
          className={controlClass}
          aria-invalid={error?.length ? true : undefined}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldShellProps, 'children'>

export function TextAreaField({ label, error, hint, className, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={className}>
      {(ids) => (
        <textarea
          id={ids.id}
          aria-describedby={ids.describedBy}
          className={clsx(controlClass, 'h-auto min-h-24 py-2.5')}
          aria-invalid={error?.length ? true : undefined}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">
      {message}
    </p>
  )
}
