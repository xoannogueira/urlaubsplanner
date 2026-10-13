# Urlaubsplanner – Installation

Reisen planen an einem Ort: Etappen, Flüge, Hotels und Aktivitäten, mit echten Preisen und allem auf der Karte.
Deine Daten bleiben auf deinem Computer.

## Mac

1. **Richtige Datei nehmen.** Welchen Chip hat dein Mac? Klick oben links auf das Apple-Menü und dann auf „Über diesen Mac“.
   - Steht dort „Chip Apple M1/M2/M3/M4“, nimm `Urlaubsplanner-Mac-arm64.zip`.
   - Steht dort „Prozessor Intel“, nimm `Urlaubsplanner-Mac-x64.zip`.
2. **Entpacken und verschieben.** Zip doppelklicken und `Urlaubsplanner.app` in den Ordner **Programme** ziehen.
3. **Erstes Öffnen.** Die App ist nicht bei Apple registriert, deshalb fragt macOS beim ersten Mal nach:
   - **Rechtsklick** auf `Urlaubsplanner.app` → **Öffnen** → nochmal **Öffnen**.
   - Kommt nur „kann nicht geöffnet werden“: **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen und bei
     „Urlaubsplanner“ auf **Trotzdem öffnen** klicken.
   - Geht beides nicht, im Programm **Terminal** einmal eingeben:
     `xattr -dr com.apple.quarantine /Applications/Urlaubsplanner.app`
4. **Ab jetzt** startet die App mit einem normalen Doppelklick. Tipp: Zieh sie ins Dock.

## Windows

1. `Urlaubsplanner-Windows.zip` mit **Rechtsklick → Alle extrahieren** entpacken. Den Ordner `Urlaubsplanner` z. B. nach
   „Dokumente“ verschieben.
2. Im Ordner **`Urlaubsplanner.exe`** doppelklicken.
3. Erscheint „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen** → **Trotzdem ausführen** klicken.
   Das passiert nur beim ersten Mal.
4. Tipp: **Rechtsklick auf `Urlaubsplanner.exe` → Senden an → Desktop (Verknüpfung erstellen)**. Dann hast du das Icon
   auf dem Desktop.

## Erster Start

Beim ersten Start erklärt dir ein kurzes Tutorial alles. Für **Flug- und Hotelpreise** brauchst du einen eigenen, kostenlosen
Key von [SerpApi](https://serpapi.com/users/sign_up):

- Konto anlegen, den **kostenlosen Plan** wählen und den Key aus **Your Account → API Key** in die App kopieren.
- Jeder Key hat **250 Suchen pro Monat** für Flüge und Hotels zusammen.
- **Gib deinen Key nicht weiter.** Wer ihn hat, verbraucht deine Suchen. Deshalb braucht jede Person ihren eigenen.

Ohne Key funktioniert alles andere trotzdem: Reisen, Etappen, Aktivitäten, Karte und Einträge von Hand.

## Gut zu wissen

- **Fenster:** Die App öffnet sich in einem eigenen Fenster, wenn Google Chrome, Microsoft Edge oder Brave installiert ist.
  Sonst öffnet sie sich als Tab in deinem Standardbrowser.
- **Beenden:** Einfach das Fenster schließen. Nach ein paar Sekunden ist der Urlaubsplanner komplett beendet.
- **Deine Daten** (Reisen, Einstellungen, Key) liegen nur auf deinem Computer:
  - Mac: `~/Library/Application Support/Urlaubsplanner`
  - Windows: `%LOCALAPPDATA%\Urlaubsplanner`

  Zum Sichern diesen Ordner kopieren, am besten bei geschlossener App.
- **Wenn etwas nicht klappt:** Im selben Ordner liegt `urlaubsplanner.log`. Schick die Datei an Xoan.
