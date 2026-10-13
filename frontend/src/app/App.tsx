import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { TripLayout } from '../components/layout/TripLayout'
import { ChecklistPage } from '../features/checklist/ChecklistPage'
import { OptionsPage } from '../features/options/OptionsPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SetupProvider } from '../features/setup/SetupProvider'
import { TripsPage } from '../features/trips/TripsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SetupProvider>
          <Routes>
            <Route path="/" element={<TripsPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
            <Route path="/trips/:tripId" element={<TripLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="fluege" element={<OptionsPage key="Flight" kind="Flight" />} />
              <Route path="hotels" element={<OptionsPage key="Hotel" kind="Hotel" />} />
              <Route path="aktivitaeten" element={<OptionsPage key="Activity" kind="Activity" />} />
              <Route path="checkliste" element={<ChecklistPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SetupProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-extrabold">Seite nicht gefunden</h1>
      <Link to="/" className="font-bold text-accent">
        Zu deinen Reisen
      </Link>
    </div>
  )
}
