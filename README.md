# Urlaubsplanner

Ein persönlicher Reiseplaner für mich und Freunde: mehrere Urlaube anlegen, pro Ort (Etappe) Flüge, Hotels und
Aktivitäten sammeln, Favoriten markieren, auswählen – und am Ende alles über eine Checkliste mit Buchungslinks
einzeln buchen.

## Herunterladen

Installieren, App-Icon anklicken, fertig. Die App aktualisiert sich danach von selbst.

| System | Download |
| ------ | -------- |
| **Mac** (Apple-Chip und Intel) | [Urlaubsplanner-Mac.dmg](https://github.com/xoannogueira/urlaubsplanner/releases/latest/download/Urlaubsplanner-Mac.dmg) – öffnen und die App in „Programme“ ziehen |
| **Windows** 10/11 | [Urlaubsplanner-Setup.exe](https://github.com/xoannogueira/urlaubsplanner/releases/latest/download/Urlaubsplanner-Setup.exe) – Installer mit Desktop-Verknüpfung |

Schritt für Schritt erklärt: [Anleitung](packaging/ANLEITUNG.md). Ohne Installation gibt es die App auch als Zip
([Mac](https://github.com/xoannogueira/urlaubsplanner/releases/latest/download/Urlaubsplanner-Mac.zip),
[Windows](https://github.com/xoannogueira/urlaubsplanner/releases/latest/download/Urlaubsplanner-Windows.zip)).

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
  „Merken“ speichert den Ort mit Foto als Favorit der Etappe. Vorschläge werden im Hintergrund vorgeladen, sobald eine Etappe
  einen Ort hat, und 30 Tage im Datenordner gespeichert (`aktivitaeten/`). Mit ausgewähltem Hotel gibt es pro Aktivität
  „Route vom Hotel“ (Google Maps, zu Fuß bis 1,5 km, sonst Bus & Bahn)
- **Dashboard** in der Übersicht: Gesamtkosten, **Countdown** bis zur Abreise, Reisedauer, Buchungsfortschritt;
  **Kosten nach Kategorie** (gestapelter Balken + Tabelle, „schon gebucht“ vs. offen) und **Kosten pro Etappe**
  (inkl. pro Nacht); **Zeitplan Tag für Tag** mit Flügen (inkl. Uhrzeit), Aktivitäten, Transport und der Übernachtung
  jeder Nacht – fehlende Hotels sind markiert; **Offene Punkte** mit Direktlink (kein Flug, Nächte ohne Hotel,
  Etappen ohne Aktivitäten, noch nicht gebucht, ohne Preis). Diagrammfarben: feste Farbe pro Kategorie, geprüft auf
  Farbenblindheit, Beträge stehen immer zusätzlich als Text daneben
- **Reiseplan als PDF** (Tab „PDF“): Überblick, Flüge mit Zeiten und Flugnummern, Unterkünfte mit Check-in/-out, gemerkte
  Aktivitäten, Tag-für-Tag-Plan und Kosten. Erzeugt im Browser ([pdfmake](https://pdfmake.github.io), erst beim Klick geladen);
  die Desktop-App speichert sie im Downloads-Ordner (eine Datei pro Reise, neue Fassung ersetzt die alte) und öffnet sie
- Buchen über **Kayak** (Strecken, Daten, Personen und Klasse vorausgefüllt, auch Gabelflüge) oder **Google Flights**
- **Flug-Bewertung „Beste Wahl“**: Preis plus Zeitaufwand (lange Umstiege zählen überproportional), umschaltbar
  „Günstig zuerst / Ausgewogen / Schnell zuerst“; Zeitfenster-Filter für Abflug und Ankunft je Strecke
- **Anreise mit Bus & Bahn** statt Flug (Umschalter im Tab „Anreise“): Hin- und Rückfahrt von zu Hause zur ersten bzw. ab der
  letzten Etappe, mit Umstiegen, Gleisen und Fußwegen; Links zu bahn.de und Google Maps (Preise gibt es dort)
- **Wetter pro Etappe** in der Übersicht, im Tagesplan und im PDF: echte Vorhersage für die nächsten 16 Tage, sonst
  typisches Wetter (Durchschnitt der letzten 5 Jahre am selben Kalendertag). Kostenlos über [Open-Meteo](https://open-meteo.com) (CC BY 4.0)
- **Packliste** (eigener Tab): Vorschläge aus Reisedauer, Wetter, Anreise, Mietwagen und geplanten Aktivitäten (z. B. Badesachen bei
  Strand, Regenjacke bei Regentagen) – übernehmen, abhaken, eigene Punkte ergänzen, löschen; weggeklickte Vorschläge kommen nicht wieder
- **Mietwagen** (im Tab „Transfers“): Abholung und Rückgabe mit Ort und Uhrzeit (vorausgefüllt aus der Reise), Links zu
  Vergleichsportalen, Preis von Hand; erscheint im Tagesplan, in den Kosten und in der PDF
- **Mitreisende & Kosten**: Namen eintragen (die Personenzahl folgt ihnen), pro Buchung und eigener Ausgabe festhalten, wer bezahlt hat
  und für wen – daraus Anteil pro Person und „wer schuldet wem“ mit möglichst wenigen Überweisungen (auf den Cent genau)
- **Transfers** (eigener Tab): Vorschläge Flughafen → Unterkunft, Etappe → Etappe und Unterkunft → Flughafen, automatisch mit
  passender Uhrzeit gesucht; beliebige weitere Strecken frei suchbar. Gemerkte Verbindungen erscheinen im Tagesplan und im PDF.
  Fahrplandaten: [Transitous](https://transitous.org) (kostenlos, ohne Key, Community-Projekt)

## Roadmap

| Phase | Inhalt |
| ----- | ------ |
| 1 ✅ | Grundgerüst: Reisen, Etappen, manuelle Optionen, Status, Checkliste |
| 2 ✅ | Karte (MapLibre) mit Preis-Pins, Ortssuche, Route, Backend-Tests |
| 3 ✅ | Hotelsuche (LiteAPI) mit Preis-Pins auf der Karte |
| 4 ✅ | Flugsuche (LiteAPI) – exakte Flughäfen oder Umkreis, Gabelflüge, Tarife, Flugbögen auf der Karte |
| 5 ✅ | Aktivitäten-Vorschläge (OpenStreetMap + Wikidata, ohne Key) |
| 6 ✅ | Dashboard mit Diagrammen, Zeitplan, Countdown und offenen Punkten |
| 7 ✅ | Desktop-App mit Installer und Auto-Update, PDF-Reiseplan, Flug-Bewertung, Bus & Bahn, Transfers |
| 8 ✅ | Wetter, Packliste, Mietwagen, Mitreisende & Kostenaufteilung (alles auch in der PDF) |
| später | Preisalarm, Export (.ics), Accounts für Freunde |

## Technik

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, MapLibre GL |
| Backend | ASP.NET Core (.NET 10), Minimal APIs |
| Speicher | JSON-Datei, später PostgreSQL + PostGIS |
| Karten & Orte | OpenFreeMap (Kartenkacheln), Photon (Ortssuche) – beide kostenlos, ohne API-Key; lädt OpenFreeMap nicht, schaltet die Karte auf CARTO-Kacheln um (kostenlos für nicht-kommerzielle Nutzung) |
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

### Als Desktop-App für Freunde

Mit einem Doppelklick aufs App-Icon startet alles. Der Server läuft unsichtbar im Hintergrund, die App öffnet sich in einem eigenen
Fenster (Chrome, Edge oder Brave im App-Modus, sonst im Standardbrowser). Wird das Fenster geschlossen, beendet sich der Server nach
ein paar Sekunden (nach dem letzten, falls mehrere offen sind). Ein zweiter Klick, während die App läuft, holt das offene Fenster nach vorne statt ein neues zu öffnen – ist es im Dock bzw. in der Taskleiste minimiert oder klappt das Nach-vorne-Holen nicht, öffnet sich ein neues Fenster.

- **Daten:** Reisen, Einstellungen, der eigene API-Key und das Log liegen im Benutzerordner. Auf dem Mac ist das
  `~/Library/Application Support/Urlaubsplanner`, unter Windows `%LOCALAPPDATA%\Urlaubsplanner`.
- **Erster Start:** Ein Tutorial führt durchs Anlegen eines eigenen, kostenlosen SerpApi-Keys. Der Key wird in der App eingetragen,
  geprüft und gespeichert, kein Terminal nötig. Unter **Einstellungen** lässt er sich ändern.
- **Warnungen:** Ohne Key und bei wenigen restlichen Suchen erscheint oben ein Hinweis.
- **Installieren:** Mac über `Urlaubsplanner-Mac.dmg` (Fenster mit Pfeil: App in „Programme“ ziehen; gebaut mit
  [dmgbuild](https://github.com/dmgbuild/dmgbuild)), Windows über `Urlaubsplanner-Setup.exe`
  ([Inno Setup](https://jrsoftware.org/isinfo.php), `packaging/windows/Urlaubsplanner.iss`): ohne Admin-Rechte nach
  `%LOCALAPPDATA%\Programs\Urlaubsplanner`, Startmenü und Desktop-Verknüpfung, Deinstaller mit Frage nach den Daten.
  Die Zips (`Urlaubsplanner-Mac.zip` für Apple-Chips und Intel, `Urlaubsplanner-Windows.zip`) sind die Grundlage der Updates.
  Alle Namen bleiben immer gleich, deshalb funktionieren die Download-Links oben für jede Version.
- **Standardbrowser:** Die App erkennt den Standardbrowser (Mac: LaunchServices, Windows: Registry). Chrome, Edge, Brave und
  Vivaldi öffnen sie als eigenes App-Fenster, Safari, Firefox & Co. als Tab. Links nach außen öffnen immer im Standardbrowser.
  `URLAUBSPLANNER_BROWSER=…` erzwingt einen bestimmten Browser.
- **Dock und Deinstallieren:** Unter **Einstellungen → App auf diesem Computer** legt sich die App auf dem Mac ins Dock
  (`defaults export/import com.apple.dock`) und entfernt sich auf beiden Systemen selbst – App, Verknüpfungen bzw.
  Dock-Eintrag, Browser-Profil und auf Wunsch alle Daten.
- **Automatische Updates:** Kurz nach dem Start fragt die App bei GitHub nach dem neuesten Release
  (`releases/latest`, ohne Key, 60 Anfragen/Stunde frei), lädt das passende Zip im Hintergrund, prüft die Prüfsumme und entpackt es in
  den Datenordner. Installiert wird beim Schließen der App (oder sofort per „Jetzt neu starten“): Auf dem Mac wird die ganze
  `Urlaubsplanner.app` getauscht, unter Windows werden die alten Dateien in `*.old` umbenannt und beim nächsten Start gelöscht.
  Voraussetzung: Die App liegt in einem beschreibbaren Ordner (Mac: „Programme“, Windows z. B. „Dokumente“). Läuft sie auf dem Mac
  direkt aus dem Download-Ordner (App Translocation), zeigt sie einen Hinweis statt sich zu aktualisieren.
  Abschalten: `Updates__Enabled=false`.

**Neue Version veröffentlichen** (Terminal auf dem MacBook):

```bash
cd ~/Documents/Projects/urlaubsplanner
git checkout main && git pull
git tag v0.2.0            # jedes Mal eine höhere Nummer
git push origin v0.2.0
```

Der Workflow **„App bauen“** baut dann beide Zips (Mac auf einem Mac-Runner, signiert), testet sie und legt ein GitHub-Release an.
Ab dann bekommen alle Freunde das Update beim nächsten Start der App.

**Pakete ohne Release bauen:**

- Auf GitHub unter **Actions → „App bauen“ → Run workflow** laufen lassen und die Zips herunterladen.
- Lokal auf dem Mac:

  ```bash
  packaging/build-app.sh mac          # oder windows, all → dist/*.zip
  ```

Die Anleitung für Freunde liegt jedem Zip bei (`packaging/ANLEITUNG.md`).

**Desktop-Modus beim Entwickeln testen:** `dotnet run -- --desktop`. Mit `URLAUBSPLANNER_DATA=…` lässt sich ein anderer Datenordner
wählen.

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
- Gesucht wird pro Etappe rund um ihren Ort (Umkreis 1–50 km), mit deren Daten und der Personenzahl der Reise. Ergebnisse werden 15 Minuten gecacht.
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
- **Kleine Orte:** Kennt Google den Etappennamen nicht (z. B. ein Bach oder Weiler), sucht die App mit dem Ort bzw. der Region rund
  um den Etappenpunkt (umgekehrte Ortssuche über Photon). Das kostet höchstens 2 Suchen mehr, und nur wenn die erste Suche nichts im
  Umkreis findet. Womit gesucht wurde, steht über der Liste („Gesucht: …“).
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
cacht Ergebnisse deshalb 30 Tage im Datenordner und lädt sie im Hintergrund vor, sobald eine Etappe einen Ort hat
(abschaltbar mit `Activities:Prefetch=false`).

- Gesucht wird in einem Rechteck um die Etappe (schnell für den Server), danach wird auf den Kreis zugeschnitten.
- Ist ein Overpass-Server überlastet oder bricht ab, probiert die App automatisch den nächsten
  (overpass-api.de → overpass.private.coffee → maps.mail.ru). Weitere Server lassen sich unter `Activities:OverpassUrls`
  in `appsettings.json` ergänzen. Was schiefging, steht im Backend-Terminal („Overpass (…) antwortete mit …“).
- Angezeigt werden erst 10 Vorschläge, beim Scrollen ans Listenende kommen jeweils 10 weitere – ohne neue Abfrage bei OpenStreetMap.

### Bus & Bahn (Transitous)

Funktioniert ohne Einrichtung. Fahrplandaten: [Transitous](https://transitous.org) – ein kostenloser, gemeinschaftlich
betriebener Routing-Dienst (MOTIS) auf Basis offener Fahrplandaten. Bedingungen: nur nicht-kommerzielle Nutzung, Quellenangabe
(steht unter jedem Ergebnis) und ein User-Agent mit Kontakt (setzt die App automatisch). Das Projekt steht deshalb unter der
MIT-Lizenz (siehe `LICENSE`). Ergebnisse werden 10 Minuten gecacht.

- Preise liefert Transitous nicht – dafür gibt es pro Verbindung den Link zu bahn.de bzw. Google Maps.
- Offene Fahrpläne reichen meist nur bis zum nächsten Fahrplanwechsel (Mitte Dezember). Findet die App für ein Datum, das
  mindestens drei Wochen entfernt ist, nichts, sucht sie am gleichen Wochentag in naher Zukunft und zeigt das Ergebnis als
  **Beispiel** auf das Reisedatum übertragen (gleiche Uhrzeit vor Ort, auch über die Zeitumstellung). Gemerkte Beispiele sind
  in der Notiz gekennzeichnet.
- Abdeckung: Europa sehr gut, in manchen Ländern fehlen Fernbusse oder einzelne Verkehrsverbünde.
- Anderer Server: `Transit:BaseUrl` in `appsettings.json`.

### Sicherheit

Der Server ist nur für den eigenen Rechner gedacht: Er nimmt nur Anfragen an `localhost`/`127.0.0.1` an (`AllowedHosts`,
schützt vor DNS-Rebinding), und Änderungen (POST/PUT/PATCH/DELETE) mit fremder Herkunft (`Origin` bzw. `Sec-Fetch-Site`)
lehnt er ab – eine andere Webseite im Browser kann die App also nicht fernsteuern. API-Keys verlassen das Backend nie.

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
| PUT | `/api/trips/{id}/period` | Reisezeitraum ändern: `startDate`, `endDate` – erste und letzte Etappe wandern mit |
| PUT | `/api/trips/{id}/packing` | Packliste ersetzen: `items` [{`id`, `text`, `category`, `packed`, `suggestionKey`}], `dismissed` |
| PUT | `/api/trips/{id}/party` | Mitreisende & Kosten: `members`, `expenses` [{`title`, `amount`, `paidBy`, `for`}], `optionShares` |
| PATCH | `/api/trips/{id}/options/{optionId}/price` | Neu geprüften Preis bestätigen (setzt „geprüft am“) |
| GET | `/api/places?q=…&lat=…&lon=…` | Ortssuche (lat/lon optional: Treffer in der Nähe bevorzugen) |
| POST | `/api/hotels/search` | Hotelsuche: `latitude`, `longitude`, `checkin`, `checkout`, `adults`, optional `rooms`, `radiusMeters` – oder statt Ort `hotelIds`; optional `place` (Ortsname, für Google Hotels) |
| POST | `/api/hotels/nearby` | Alle Hotels im Umkreis, auch ausgebuchte (ohne Preis) |
| GET | `/api/activities?lat=…&lon=…&radiusMeters=…&offset=0&limit=10` | Aktivitäten-Vorschläge seitenweise (500 m – 50 km), optional `category`, `q`, `sort=Distance` |
| GET | `/api/transit/plan?fromLat=…&fromLon=…&toLat=…&toLon=…&time=…&arriveBy=false` | Bus-&-Bahn-Verbindungen (Transitous), optional `cursor` für früher/später |
| GET | `/api/weather?lat=…&lon=…&from=…&to=…` | Wetter pro Tag (Vorhersage bzw. typisch), max. 62 Tage |
| GET | `/api/activities/photo?lat=…&lon=…&name=…` | Foto für einen Vorschlag ohne Bild (Wikimedia Commons in der Nähe, passender Dateiname) |
| GET | `/api/app/connectivity` | „Verbindung prüfen“: erreicht die App Photon, SerpApi, OpenStreetMap, Open-Meteo, Transitous, OpenFreeMap? |
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

## Lizenz

MIT – siehe [LICENSE](LICENSE).
