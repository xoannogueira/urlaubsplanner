/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.API_URL ?? 'http://localhost:5080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Im Dev-Modus leitet Vite alle /api-Aufrufe an das C#-Backend weiter (kein CORS nötig).
    proxy: { '/api': apiTarget },
  },
  build: {
    // Das gebaute Frontend landet direkt im wwwroot der API – so läuft alles als eine App.
    outDir: '../backend/src/Urlaubsplanner.Api/wwwroot',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
