import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

function readTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Beobachtet die Klasse auf <html>, damit alle Komponenten (z. B. die Karte) den Wechsel mitbekommen. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useThemeValue(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => 'dark')
}

/** Dark ist Standard. Die Wahl wird im Browser gemerkt (siehe Skript in index.html). */
export function useTheme() {
  const theme = useThemeValue()

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0A1424' : '#F2F6F9')
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Privates Fenster o. Ä.: dann eben nur für diese Sitzung.
    }
  }, [])

  const toggle = useCallback(() => setTheme(readTheme() === 'dark' ? 'light' : 'dark'), [setTheme])

  return { theme, setTheme, toggle }
}
