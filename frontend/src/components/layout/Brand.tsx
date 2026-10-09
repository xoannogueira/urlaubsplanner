import { Moon, Plane, Sun } from 'lucide-react'
import { Link } from 'react-router'
import { useTheme } from '../../lib/theme'
import { Button } from '../ui/Button'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2 text-text no-underline">
      <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-accent text-accent-ink">
        <Plane size={18} strokeWidth={2.2} />
      </span>
      <span className="text-[17px] font-extrabold tracking-tight max-md:sr-only">Urlaubsplanner</span>
    </Link>
  )
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const toLight = theme === 'dark'
  return (
    <Button
      onClick={toggle}
      aria-label={toLight ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
      icon={toLight ? <Sun size={16} /> : <Moon size={16} />}
      className="h-10"
    >
      {toLight ? 'Hell' : 'Dunkel'}
    </Button>
  )
}
