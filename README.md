# Urlaubsplanner

Ein persönlicher Reiseplaner für mich und Freunde: mehrere Urlaube anlegen, pro Ort (Etappe) Flüge, Hotels und
Aktivitäten sammeln, Favoriten markieren, auswählen – und am Ende alles über eine Checkliste mit Buchungslinks
einzeln buchen.

## Stand: Phase 3 – Hotelsuche

- Mehrere Reisen anlegen, bearbeiten, löschen
- Etappen (Ort + Zeitraum) pro Reise, z. B. Lissabon → Porto → Algarve
- Flüge, Hotels und Aktivitäten **manuell mit Link** speichern (Booking, Airbnb, Skyscanner …)
- Status pro Option: **Idee → Favorit → Ausgewählt → Gebucht**
- Preise gesamt oder pro Person (wird mit der Personenzahl hochgerechnet)
- Übersicht mit Gesamtkosten, Kosten pro Person, Reisedauer, Buchungsfortschritt
- Lücken-Warnung: Nächte ohne Hotel, Tage ohne Etappe
- Checkliste: alles Ausgewählte mit Buchungsbutton, abhaken = gebucht
- Dark Mode (Standard) und Light Mode, funktioniert auch am Handy
- **Ortssuche** beim Tippen für Etappen, Hotels und Aktivitäten (Photon / OpenStreetMap), Treffer nahe der Etappe zuerst
- **Karte** (MapLibre + OpenFreeMap) mit Preis-Pins wie bei Airbnb: Pin anklicken → Eintrag in der Liste, Eintrag anklicken → Pin
- Übersicht mit **Route** zwischen den Etappen und Entfernungen („274 km bis Porto“)
- Backend-Tests (xUnit): Domain, Speicher, Ortssuche, Hotelsuche und API
- **Hotelsuche** (LiteAPI) pro Etappe: Fotos, Sterne, Bewertung, Zimmer & Verpflegung, Gesamtpreis – als Liste und als Preis-Pins auf der Karte,
  mit Filtern (stornierbar, Bewertung 8+, 4 Sterne+) und Sortierung (Preis, Bewertung, Entfernung). „Merken“ speichert das Hotel als Favorit
  inklusive Foto und vorausgefülltem Buchungslink

## Roadmap

| Phase | Inhalt |
| ----- | ------ |
| 1 ✅ | Grundgerüst: Reisen, Etappen, manuelle Optionen, Status, Checkliste |
| 2 ✅ | Karte (MapLibre) mit Preis-Pins, Ortssuche, Route, Backend-Tests |
| 3 ✅ | Hotelsuche (LiteAPI) mit Preis-Pins auf der Karte |
| 4 | Flugsuche (Ignav) – exakte Flughäfen oder Umkreissuche, Fallback-Links zu Google Flights/Skyscanner |
| 5 | Aktivitäten-Vorschläge (OpenTripMap, Wikivoyage) |
| 6 | Dashboard mit Diagrammen und Zeitplan |
| später | Accounts für Freunde, Kostenaufteilung, Preisalarm, Abstimmung, Export (.ics/PDF) |

## Technik

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, MapLibre GL |
| Backend | ASP.NET Core (.NET 10), Minimal APIs |
| Speicher | JSON-Datei, später PostgreSQL + PostGIS |
| Karten & Orte | OpenFreeMap (Kartenkacheln), Photon (Ortssuche) – beide kostenlos, ohne API-Key |
| Hotels | LiteAPI (Sandbox-Key kostenlos) |
| Qualität | xUnit, Vitest, oxlint, Prettier, `dotnet format`, GitHub Actions |

### Warum es flüssig bleibt

- Jede Änderung antwortet mit der kompletten Reise → das Frontend braucht keinen zweiten Request.
- Status, Favoriten, Personenzahl und Löschen werden **optimistisch** angezeigt (sofort, Rollback bei Fehler).
- Alle Reisen liegen im Backend zusätzlich im Speicher, Lesen ist damit praktisch sofort.
- Schriften liegen lokal im Bundle (kein Google-Fonts-Request), Antworten werden komprimiert.
- Die Kartenbibliothek (~1 MB) wird erst geladen, wenn eine Karte zu sehen ist.
- Ortssuche wartet, bis du kurz aufhörst zu tippen, und merkt sich Ergebnisse (im Browser und einen Tag im Backend).

## Projektstruktur

```
urlaubsplanner/
├── backend/
│   ├── Urlaubsplanner.slnx
│   └── src/
│       ├── Urlaubsplanner.Domain/          Fachlogik: Reise, Etappe, Option, Kostenberechnung
│       ├── Urlaubsplanner.Infrastructure/  Speicher (JSON-Datei), Ortssuche (Photon)
│       └── Urlaubsplanner.Api/             HTTP-Endpunkte, Fehlerbehandlung, liefert das Frontend aus
│   └── tests/Urlaubsplanner.Tests/         xUnit-Tests
├── frontend/
│   └── src/
│       ├── api/          Typen + Hooks für das Backend
│       ├── app/          Routing
│       ├── components/   Layout, UI-Bausteine, Karte (map/), Ortssuche-Feld
│       ├── features/     Seiten: Reisen, Übersicht, Optionen (Flüge/Hotels/Aktivitäten), Checkliste
│       ├── lib/          Formatierung, Theme, Hilfsfunktionen
│       └── styles/       Farbsystem (CSS-Variablen für Dark/Light)
└── .github/workflows/ci.yml
```

## Lokal starten (macOS)

Alle Befehle laufen im **Terminal auf dem MacBook**.

### Einmalig installieren

1. **.NET 10 SDK**: <https://dotnet.microsoft.com/download/dotnet/10.0> (macOS-Installer, Apple Silicon = Arm64)
2. **Node.js 24 LTS** (bringt npm 11 mit): <https://nodejs.org> oder `brew install node@24`

Prüfen:

```bash
dotnet --version   # 10.x
node --version     # v24.x
npm --version      # 11.x
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
npm ci             # installiert exakt die Versionen aus package-lock.json (ändert sie nie)
npm run dev
```

Dann <http://localhost:5173> öffnen. Vite leitet alle `/api`-Aufrufe an das Backend (Port 5080) weiter.

### Als eine App laufen lassen

```bash
cd urlaubsplanner/frontend && npm run build      # schreibt nach backend/src/Urlaubsplanner.Api/wwwroot
cd ../backend/src/Urlaubsplanner.Api && dotnet run
```

Dann <http://localhost:5080> öffnen.

### Hotelsuche einrichten (LiteAPI)

1. Kostenlosen Account auf <https://www.liteapi.travel> anlegen, im Dashboard unter *Developer → API Keys* den Sandbox-Key (`sand_…`) kopieren.
2. Key im **Terminal auf dem MacBook** hinterlegen – er landet in den .NET User Secrets (`~/.microsoft/usersecrets/`), **nie im Repo**:

   ```bash
   cd urlaubsplanner/backend/src/Urlaubsplanner.Api
   dotnet user-secrets set "LiteApi:ApiKey" "sand_…"
   ```

3. Backend neu starten. Unter *Hotels → Hotels suchen* ist die Suche jetzt aktiv.

Hinweise:

- Mit einem Sandbox-Key zeigt die App „Sandbox – Preise evtl. Testdaten“. Echte Preise gibt es mit dem Produktiv-Key (Kreditkarte im LiteAPI-Dashboard).
- Gesucht wird pro Etappe rund um ihren Ort (Umkreis 1–10 km), mit deren Daten und der Personenzahl der Reise. Ergebnisse werden 15 Minuten gecacht.
- Der Buchungslink ist eine vorausgefüllte Booking.com-Suche. Wer eine LiteAPI-White-Label-Seite einrichtet, trägt deren Domain in
  `appsettings.json` unter `LiteApi:WhitelabelDomain` ein – dann führen die Links direkt zum Hotel auf dieser Seite.
- Weitere Einstellungen unter `LiteApi` in `appsettings.json`: `Currency` (EUR), `GuestNationality` (DE), `MaxHotels` (50).

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
dotnet build && dotnet test && dotnet format --verify-no-changes
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
| GET | `/api/places?q=…&lat=…&lon=…` | Ortssuche (lat/lon optional: Treffer in der Nähe bevorzugen) |
| GET | `/api/hotels/status` | Ist ein LiteAPI-Key hinterlegt? |
| POST | `/api/hotels/search` | Hotelsuche: `latitude`, `longitude`, `checkin`, `checkout`, `adults`, optional `rooms`, `radiusMeters` |

Fehler kommen als Problem Details (RFC 9457), Eingabefehler mit dem betroffenen Feld, z. B.
`{"errors": {"url": ["Muss ein gültiger http- oder https-Link sein."]}}`.
