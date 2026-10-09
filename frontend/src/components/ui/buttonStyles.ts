import clsx from 'clsx'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 font-bold',
  secondary: 'bg-surface text-text border border-line hover:bg-surface-3 font-semibold',
  ghost: 'bg-transparent text-muted hover:bg-surface-3 hover:text-text font-semibold',
  danger: 'bg-transparent text-danger border border-line hover:bg-surface-3 font-semibold',
  destructive: 'bg-danger text-danger-ink hover:brightness-110 font-bold',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-[10px] gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
}

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className?: string) =>
  clsx(
    'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-[background-color,filter,border-color] duration-100 disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
