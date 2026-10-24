import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import './styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { cleanupSearchDrafts } from './hooks/useSearchDraft'

// Suchentwürfe, die lange nicht angefasst wurden, wegräumen.
cleanupSearchDrafts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
