import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type Size, type Variant } from './buttonStyles'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function Button({ variant, size, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
}

/** Runder Icon-Button mit Pflicht-Beschriftung für Screenreader. */
export function IconButton({ label, active, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-100',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:bg-surface-3 hover:text-text',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
