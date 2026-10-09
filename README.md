# Urlaubsplanner

Ein persönlicher Reiseplaner für mich und Freunde: mehrere Urlaube anlegen, pro Ort (Etappe) Flüge, Hotels und
Aktivitäten sammeln, Favoriten markieren, auswählen – und am Ende alles über eine Checkliste mit Buchungslinks
einzeln buchen.

## Stand: Phase 1 – Grundgerüst

- Mehrere Reisen anlegen, bearbeiten, löschen
- Etappen (Ort + Zeitraum) pro Reise, z. B. Lissabon → Porto → Algarve
- Flüge, Hotels und Aktivitäten **manuell mit Link** speichern (Booking, Airbnb, Skyscanner …)
- Status pro Option: **Idee → Favorit → Ausgewählt → Gebucht**
- Preise gesamt oder pro Person (wird mit der Personenzahl hochgerechnet)
- Übersicht mit Gesamtkosten, Kosten pro Person, Reisedauer, Buchungsfortschritt
- Lücken-Warnung: Nächte ohne Hotel, Tage ohne Etappe
- Checkliste: alles Ausgewählte mit Buchungsbutton, abhaken = gebucht
- Dark Mode (Standard) und Light Mode, funktioniert auch am Handy

## Roadmap

| Phase | Inhalt |
| ----- | ------ |
| 1 ✅ | Grundgerüst: Reisen, Etappen, manuelle Optionen, Status, Checkliste |
| 2 | Karte (MapLibre) mit allen gespeicherten Optionen |
| 3 | Hotelsuche (LiteAPI) mit Preis-Pins auf der Karte |
| 4 | Flugsuche (Ignav) – exakte Flughäfen oder Umkreissuche, Fallback-Links zu Google Flights/Skyscanner |
| 5 | Aktivitäten-Vorschläge (OpenTripMap, Wikivoyage) |
| 6 | Dashboard mit Diagrammen und Zeitplan |
| später | Accounts für Freunde, Kostenaufteilung, Preisalarm, Abstimmung, Export (.ics/PDF) |

## Technik

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Backend | ASP.NET Core (.NET 10), Minimal APIs |
| Speicher | JSON-Datei (Phase 1), später PostgreSQL + PostGIS |
| Qualität | Vitest, oxlint, Prettier, `dotnet format`, GitHub Actions |

### Warum es flüssig bleibt

- Jede Änderung antwortet mit der kompletten Reise → das Frontend braucht keinen zweiten Request.
- Status, Favoriten, Personenzahl und Löschen werden **optimistisch** angezeigt (sofort, Rollback bei Fehler).
- Alle Reisen liegen im Backend zusätzlich im Speicher, Lesen ist damit praktisch sofort.
- Schriften liegen lokal im Bundle (kein Google-Fonts-Request), Antworten werden komprimiert.

## Projektstruktur

```
urlaubsplanner/
├── backend/
│   ├── Urlaubsplanner.slnx
│   └── src/
│       ├── Urlaubsplanner.Domain/          Fachlogik: Reise, Etappe, Option, Kostenberechnung
│       ├── Urlaubsplanner.Infrastructure/  Speicher (JSON-Datei, später PostgreSQL)
│       └── Urlaubsplanner.Api/             HTTP-Endpunkte, Fehlerbehandlung, liefert das Frontend aus
├── frontend/
│   └── src/
│       ├── api/          Typen + Hooks für das Backend
│       ├── app/          Routing
│       ├── components/   Layout und UI-Bausteine (Button, Dialog, Felder …)
│       ├── features/     Seiten: Reisen, Übersicht, Optionen (Flüge/Hotels/Aktivitäten), Checkliste
│       ├── lib/          Formatierung, Theme, Hilfsfunktionen
│       └── styles/       Farbsystem (CSS-Variablen für Dark/Light)
└── .github/workflows/ci.yml
```

## Lokal starten (macOS)

Alle Befehle laufen im **Terminal auf dem MacBook**.

### Einmalig installieren

1. **.NET 10 SDK**: <https://dotnet.microsoft.com/download/dotnet/10.0> (macOS-Installer, Apple Silicon = Arm64)
2. **Node.js 22 LTS**: <https://nodejs.org> oder `brew install node@22`

Prüfen:

```bash
dotnet --version   # 10.x
node --version     # v22.x
```

### Entwickeln (zwei Terminal-Fenster)

Terminal 1 – Backend:

```bash
cd urlaubsplanner/backend/src/Urlaubsplanner.Api
dotnet run
```

Terminal 2 – Frontend:

```bash
cd urlaubsplanner/frontend
npm install        # nur beim ersten Mal oder nach Änderungen an package.json
npm run dev
```

Dann <http://localhost:5173> öffnen. Vite leitet alle `/api`-Aufrufe an das Backend (Port 5080) weiter.

### Als eine App laufen lassen

```bash
cd urlaubsplanner/frontend && npm run build      # schreibt nach backend/src/Urlaubsplanner.Api/wwwroot
cd ../backend/src/Urlaubsplanner.Api && dotnet run
```

Dann <http://localhost:5080> öffnen.

### Daten

Die Reisen liegen in `backend/src/Urlaubsplanner.Api/data/trips.json` (nicht im Repo). Pfad änderbar in
`appsettings.json` unter `Storage:FilePath`. Zum Sichern einfach die Datei kopieren.

## Checks

```bash
# Frontend
cd frontend
npm run lint && npm test && npm run build

# Backend
cd backend
dotnet build && dotnet format --verify-no-changes
```

Dieselben Checks laufen bei jedem Push in GitHub Actions.

## API (Kurzüberblick)

| Methode | Pfad | Zweck |
| ------- | ---- | ----- |
| GET | `/api/trips` | Alle Reisen mit Kennzahlen |
| POST | `/api/trips` | Reise anlegen |
| GET / PUT / DELETE | `/api/trips/{id}` | Reise lesen, ändern, löschen |
| GET | `/api/trips/{id}/summary` | Kosten, Dauer, Lücken |
| POST | `/api/trips/{id}/stages` | Etappe anlegen |
| PUT / DELETE | `/api/trips/{id}/stages/{stageId}` | Etappe ändern, löschen |
| POST | `/api/trips/{id}/options` | Flug/Hotel/Aktivität speichern |
| PUT / DELETE | `/api/trips/{id}/options/{optionId}` | Option ändern, löschen |
| PATCH | `/api/trips/{id}/options/{optionId}/status` | Status setzen |

Fehler kommen als Problem Details (RFC 9457), Eingabefehler mit dem betroffenen Feld, z. B.
`{"errors": {"url": ["Muss ein gültiger http- oder https-Link sein."]}}`.
