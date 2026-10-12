# Urlaubsplanner

Ein persönlicher Reiseplaner für mich und Freunde: mehrere Urlaube anlegen, pro Ort (Etappe) Flüge, Hotels und
Aktivitäten sammeln, Favoriten markieren, auswählen – und am Ende alles über eine Checkliste mit Buchungslinks
einzeln buchen.

## Stand: Phase 6 – Dashboard

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
- Backend-Tests (xUnit): Domain, Speicher, Ortssuche, Hotel- und Flugsuche (mit echter LiteAPI-Antwort), Flughäfen und API
- **Hotelsuche** (LiteAPI) pro Etappe: Fotos, Sterne, Bewertung, Zimmer & Verpflegung, Gesamtpreis – als Liste und als Preis-Pins auf der Karte,
  mit Filtern (stornierbar, Bewertung 8+, 4 Sterne+) und Sortierung (Preis, Bewertung, Entfernung). „Merken“ speichert das Hotel als Favorit
  inklusive Foto und vorausgefülltem Buchungslink
- **Ausgebuchte Hotels** per Schalter „Ausgebuchte zeigen“: rot umrandet in der Liste und gestrichelt auf der Karte
- **Andere Daten prüfen**: ausgewählte Hotels für dieselbe Anzahl Nächte, bis zu 3 Tage früher oder später –
  höchstens 6 LiteAPI-Abfragen, egal wie viele Hotels. Ausweichtermine lassen sich direkt merken
- **Gemerkte Hotels neu prüfen** (z. B. Monate später): noch frei? Preis gleich? Neuen Preis oder Ausweichtermin übernehmen
- **Zimmervarianten** pro Hotel (z. B. Doppelzimmer, Komfort, Suite) zum Auswählen – „Merken“ speichert das gewählte Zimmer
- **Aufteilungen vergleichen**: dieselbe Suche mit z. B. 1, 2 und 3 Zimmern (eine Abfrage pro Aufteilung), Preise direkt an jedem Hotel
- **Marktpreis** („Booking & Co. ca. …“, vom Hotel empfohlener öffentlicher Preis) und **Kosten vor Ort** (z. B. Kurtaxe), soweit LiteAPI sie liefert
- Links zu **Booking.com** (Daten, Personen und Zimmer vorausgefüllt) und **Google Hotels** (vergleicht viele Anbieter; Reisedaten
  vorausgefüllt über Googles inoffiziellen `ts`-Parameter, ebenso die Personenzahl).
  Hinweis: LiteAPI und Booking.com haben getrennte Kontingente – „frei“ in der App heißt nicht immer „frei auf Booking.com“
- **Flugsuche** (Google Flights über SerpApi, sonst LiteAPI) für die ganze Reise: **Hin & zurück**, **Gabelflug** (zurück von der letzten Etappe)
  oder **Nur Hinflug**. Ziel- und Rückflughäfen werden aus den Etappen vorgeschlagen (nächster großer Flughafen), der Heimatflughafen
  wird im Browser gemerkt
- **Flughäfen im Umkreis** (100–250 km) zum Antippen und mehrere Flughäfen pro Seite – jede Kombination ist eine Suche (max. 8)
- Flughafensuche nach Code, Stadt oder Ort (auch deutsche Namen wie „Lissabon“) – 3.244 Flughäfen aus [OurAirports](https://ourairports.com) (gemeinfrei)
- Ergebnisse mit Zeiten, Dauer, Umstiegen, Airline, **Tarifen** (z. B. Light / Standard / Flex) mit Gepäck, Umbuchung und Erstattung;
  Filter „Nur Direktflüge“ und „Mit Koffer“, Sortierung nach Preis, Flugzeit, Abflug
- **Karte mit Flugbögen**: alle Strecken dezent, der gewählte Flug hervorgehoben; gemerkte Flüge ebenfalls als Bögen
- **Andere Daten prüfen**: Preisleiste ±3 Tage (alle Flüge gemeinsam verschoben, gleiche Reisedauer, max. 6 Abfragen), Klick übernimmt die Daten
- **Gemerkte Flüge neu prüfen**: gibt es genau diese Flüge noch, was kostet der Tarif jetzt?
- **Aktivitäten-Vorschläge** pro Etappe – kostenlos, ohne API-Key: Sehenswürdigkeiten, Museen, Aussichtspunkte, Burgen & Schlösser,
  Kirchen & Klöster, Natur & Parks, Strände, Zoos und Freizeitparks aus **OpenStreetMap**, ergänzt um deutsche Beschreibung, Foto und
  Wikipedia-Link aus **Wikidata**. Bekannteste zuerst (Anzahl Wikipedia-Sprachversionen), Öffnungszeiten auf Deutsch, „Eintritt frei“,
  Filter nach Kategorie, Suche, Umkreis 2–50 km, Karte mit Pins. Links zu Wikipedia, Google Maps und Tickets/Führungen (GetYourGuide);
  „Merken“ speichert den Ort mit Foto als Favorit der Etappe
- **Dashboard** in der Übersicht: Gesamtkosten, **Countdown** bis zur Abreise, Reisedauer, Buchungsfortschritt;
  **Kosten nach Kategorie** (gestapelter Balken + Tabelle, „schon gebucht“ vs. offen) und **Kosten pro Etappe**
  (inkl. pro Nacht); **Zeitplan Tag für Tag** mit Flügen (inkl. Uhrzeit), Aktivitäten, Transport und der Übernachtung
  jeder Nacht – fehlende Hotels sind markiert; **Offene Punkte** mit Direktlink (kein Flug, Nächte ohne Hotel,
  Etappen ohne Aktivitäten, noch nicht gebucht, ohne Preis). Diagrammfarben: feste Farbe pro Kategorie, geprüft auf
  Farbenblindheit, Beträge stehen immer zusätzlich als Text daneben
- Buchen über **Kayak** (Strecken, Daten, Personen und Klasse vorausgefüllt, auch Gabelflüge) oder **Google Flights**

## Roadmap

| Phase | Inhalt |
| ----- | ------ |
| 1 ✅ | Grundgerüst: Reisen, Etappen, manuelle Optionen, Status, Checkliste |
| 2 ✅ | Karte (MapLibre) mit Preis-Pins, Ortssuche, Route, Backend-Tests |
| 3 ✅ | Hotelsuche (LiteAPI) mit Preis-Pins auf der Karte |
| 4 ✅ | Flugsuche (LiteAPI) – exakte Flughäfen oder Umkreis, Gabelflüge, Tarife, Flugbögen auf der Karte |
| 5 ✅ | Aktivitäten-Vorschläge (OpenStreetMap + Wikidata, ohne Key) |
| 6 ✅ | Dashboard mit Diagrammen, Zeitplan, Countdown und offenen Punkten |
| später | Accounts für Freunde, Kostenaufteilung, Preisalarm, Abstimmung, Export (.ics/PDF) |

## Technik

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, MapLibre GL |
| Backend | ASP.NET Core (.NET 10), Minimal APIs |
| Speicher | JSON-Datei, später PostgreSQL + PostGIS |
| Karten & Orte | OpenFreeMap (Kartenkacheln), Photon (Ortssuche) – beide kostenlos, ohne API-Key |
| Hotels | Google Hotels über SerpApi (gleiches Kontingent wie Flüge), alternativ LiteAPI |
| Flüge | Google Flights über SerpApi (250 Suchen/Monat kostenlos), alternativ LiteAPI |
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
- Weitere Einstellungen unter `LiteApi` in `appsettings.json`: `Currency` (EUR), `GuestNationality` (DE), `MaxHotels` (50), `MaxRatesPerHotel` (10).
- **Flüge** können ebenfalls über diesen Key laufen (siehe unten). Die Sandbox liefert dafür Testdaten; für echte Flugpreise muss
  LiteAPI Flüge für das Konto freischalten (Anfrage im Dashboard über *Request Assistance*).

### Flugsuche einrichten (Google Flights über SerpApi)

Echte Preise von Google Flights, kostenlos bis 250 Suchen pro Monat.

1. Kostenlosen Account auf <https://serpapi.com> anlegen und unter *Your Account → API Key* den Key kopieren.
2. Key im **Terminal auf dem MacBook** hinterlegen (landet in den User Secrets, **nie im Repo**):

   ```bash
   cd urlaubsplanner/backend/src/Urlaubsplanner.Api
   dotnet user-secrets set "SerpApi:ApiKey" "DEIN_KEY"
   ```

3. Backend neu starten. Sobald ein SerpApi-Key da ist, nutzt die Flugsuche Google Flights.

So läuft es und so viel kostet es:

- **Suchen:** Eine Suche liefert die Hinflüge mit dem günstigsten Gesamtpreis. Mehrere Flughäfen pro Seite (Umkreis) sind in derselben Suche enthalten.
- **Rückflug wählen:** Das Aufklappen kostet eine weitere Suche. Bei mehr als zwei Strecken kostet jede weitere Strecke eine Suche.
- **Andere Daten prüfen:** eine Suche pro Zeitraum, also bis zu 6.
- **Neu prüfen:** zwei Suchen bei Hin & zurück.
- **Cache:** Gleiche Suchen kommen eine Stunde lang aus dem Speicher und kosten nichts.
- **Restliche Suchen:** Die Flugsuche zeigt an, wie viele kostenlose Suchen noch übrig sind.
- **Mehr Ergebnisse:** `show_hidden` (auch „Weitere Flüge“) und `deep_search` (wie im Browser) sind an. Das kostet keine zusätzlichen Suchen, dauert aber ein paar Sekunden länger.
  Abschalten geht unter `SerpApi:ShowHidden` / `SerpApi:DeepSearch` in `appsettings.json`.
- **Was Google nicht liefert:** Gepäck und Tarifbedingungen. Die prüfst du beim Buchen über den Google- oder Kayak-Link.

**Hotels laufen mit demselben Key über Google Hotels:**

- **Direkte Links:** Der Buchungsknopf führt direkt zum Hotel beim gewählten Anbieter (z. B. „Expedia“ oder die Hotelseite). „Google“ öffnet
  die Seite des Hotels bei Google Hotels mit allen Preisen, nicht eine Trefferliste. Liefert Google für einen Anbieter keinen Link, führt der Knopf zur Google-Seite des Hotels.
- **Suchen:** Eine Suche nach „Hotels {Etappe}“ liefert ca. 20 Hotels mit Preisen mehrerer Anbieter (Booking.com, Expedia, Hotelseite …). Hotels außerhalb des Umkreises fallen weg.
- **Weitere Hotels laden:** kostet je eine Suche.
- **Ausgebuchte zeigen:** Die Hotels kommen aus derselben Suche und kosten nichts extra.
- **Neu prüfen:** eine Suche pro Hotel.
- **Andere Daten prüfen:** eine Suche pro Hotel und Zeitraum. Deshalb höchstens 2 Hotels, also bis zu 12 Suchen.
- **Was Google nicht kann:** Es gibt keine Zimmeraufteilung. Der Preis gilt für alle Personen laut Google.
- **Neu prüfen nur mit derselben Quelle:** Gemerkte Hotels lassen sich nur mit der Quelle neu prüfen, aus der sie stammen, weil die Hotel-IDs sich unterscheiden.

**Zurück zu LiteAPI:** In `appsettings.json` `Flights:Provider` bzw. `Hotels:Provider` auf `"liteapi"` setzen, oder den
SerpApi-Key entfernen (`dotnet user-secrets remove "SerpApi:ApiKey"`). Danach das Backend neu starten.

### Aktivitäten-Vorschläge

Funktionieren ohne Einrichtung. Daten: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende (ODbL) über die
Overpass API, Beschreibungen und Fotos von Wikidata / Wikimedia Commons. Beide Dienste werden ehrenamtlich betrieben – die App
cacht Ergebnisse deshalb einen Tag.

- Gesucht wird in einem Rechteck um die Etappe (schnell für den Server), danach wird auf den Kreis zugeschnitten.
- Ist ein Overpass-Server überlastet oder bricht ab, probiert die App automatisch den nächsten
  (overpass-api.de → overpass.private.coffee → maps.mail.ru). Weitere Server lassen sich unter `Activities:OverpassUrls`
  in `appsettings.json` ergänzen. Was schiefging, steht im Backend-Terminal („Overpass (…) antwortete mit …“).
- Angezeigt werden erst 10 Vorschläge, beim Scrollen ans Listenende kommen jeweils 10 weitere – ohne neue Abfrage bei OpenStreetMap.

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
| PATCH | `/api/trips/{id}/options/{optionId}/price` | Neu geprüften Preis bestätigen (setzt „geprüft am“) |
| GET | `/api/places?q=…&lat=…&lon=…` | Ortssuche (lat/lon optional: Treffer in der Nähe bevorzugen) |
| POST | `/api/hotels/search` | Hotelsuche: `latitude`, `longitude`, `checkin`, `checkout`, `adults`, optional `rooms`, `radiusMeters` – oder statt Ort `hotelIds`; optional `place` (Ortsname, für Google Hotels) |
| POST | `/api/hotels/nearby` | Alle Hotels im Umkreis, auch ausgebuchte (ohne Preis) |
| GET | `/api/activities?lat=…&lon=…&radiusMeters=…&offset=0&limit=10` | Aktivitäten-Vorschläge seitenweise (500 m – 50 km), optional `category`, `q`, `sort=Distance` |
| GET | `/api/airports?q=…` | Flughafensuche (Code, Stadt, Name; sonst über die Ortssuche in der Nähe) |
| GET | `/api/airports/near?lat=…&lon=…&radiusKm=…` | Flughäfen im Umkreis |
| GET | `/api/airports/lookup?codes=STR,LIS` | Flughäfen nach Code |
| GET | `/api/flights/status` | Key hinterlegt? Anbieter (`serpapi`/`liteapi`), schrittweise Suche, restliche Suchen |
| POST | `/api/flights/search` | Flugsuche: `legs` [{`origins`, `destinations`, `date`}], `adults`, optional `cabin` |
| POST | `/api/flights/continue` | Nächste Strecke (z. B. Rückflüge) zu einem Hinflug: `continuation` aus dem Suchergebnis |
| POST | `/api/flights/alternatives` | Günstigster Preis für ±1–3 Tage verschobene Daten: `legs` [{`origin`, `destination`, `date`}], `adults` |
| POST | `/api/flights/recheck` | Gemerkten Flug neu prüfen: `signature` (ExternalId der Option), `adults` |
| GET | `/api/hotels/status` | Key hinterlegt? Anbieter (`serpapi`/`liteapi`), seitenweise Ergebnisse, restliche Suchen |
| POST | `/api/hotels/more` | Weitere Hotels zu einer Suche: `nextPage` aus dem Suchergebnis (Google Hotels) |
| POST | `/api/hotels/alternatives` | Ausweichdaten: `hotelIds`, `checkin`, `checkout`, `adults`, optional `rooms`, `shiftDays` (Standard 3) |

Fehler kommen als Problem Details (RFC 9457), Eingabefehler mit dem betroffenen Feld, z. B.
`{"errors": {"url": ["Muss ein gültiger http- oder https-Link sein."]}}`.
