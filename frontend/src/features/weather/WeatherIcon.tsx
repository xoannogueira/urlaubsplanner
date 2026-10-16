import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react'
import { weatherKind, weatherLabel, type WeatherKind } from '../../lib/weather'

const icons: Record<WeatherKind, typeof Sun> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

const tone: Record<WeatherKind, string> = {
  clear: 'text-star',
  partly: 'text-star',
  cloudy: 'text-muted',
  fog: 'text-muted',
  drizzle: 'text-accent',
  rain: 'text-accent',
  snow: 'text-text',
  storm: 'text-danger',
}

/** Wettersymbol mit Beschriftung für Screenreader. */
export function WeatherIcon({ code, size = 16, className }: { code: number; size?: number; className?: string }) {
  const kind = weatherKind(code)
  const Icon = icons[kind]
  return <Icon size={size} className={`${tone[kind]} shrink-0 ${className ?? ''}`} aria-label={weatherLabel(code)} role="img" />
}
