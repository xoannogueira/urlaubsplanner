import clsx from 'clsx'
import { lazy, Suspense } from 'react'
import type { TripMapProps } from './types'

const TripMapImpl = lazy(() => import('./TripMapImpl'))

/** Karte mit Preis-Pins und Etappen. MapLibre wird erst geladen, wenn die Karte gebraucht wird. */
export function TripMap(props: TripMapProps) {
  return (
    <Suspense
      fallback={
        <div aria-hidden="true" className={clsx('animate-pulse rounded-[20px] border border-line bg-surface-2', props.className)} />
      }
    >
      <TripMapImpl {...props} />
    </Suspense>
  )
}
