# Urlaubsplanner – so geht's

Reisen planen an einem Ort: Etappen, Flüge, Hotels und Aktivitäten, mit echten Preisen und allem auf der Karte.
Deine Daten bleiben auf deinem Computer. Du brauchst kein Terminal und musst nichts einrichten.

## Mac

1. **Zip öffnen.** Doppelklick auf `Urlaubsplanner-Mac.zip`. Danach liegt `Urlaubsplanner` (mit dem Koffer-Icon) daneben.
2. **In „Programme“ ziehen.** Zieh `Urlaubsplanner` in den Ordner **Programme** (im Finder links in der Seitenleiste).
   Das ist wichtig: Nur von dort kann sich die App selbst aktualisieren.
3. **Beim ersten Mal öffnen.** Die App ist nicht bei Apple registriert, deshalb fragt dein Mac einmal nach:
   - **Rechtsklick** (oder Ctrl-Klick) auf `Urlaubsplanner` → **Öffnen** → nochmal **Öffnen**.
   - Kommt nur „kann nicht geöffnet werden“: **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen
     und bei „Urlaubsplanner“ auf **Trotzdem öffnen** klicken.
4. **Fertig.** Ab jetzt reicht ein normaler Klick. Tipp: Zieh die App ins Dock, dann hast du sie immer griffbereit.

## Windows

1. **Zip entpacken.** Rechtsklick auf `Urlaubsplanner-Windows.zip` → **Alle extrahieren…** → **Extrahieren**.
2. **Ordner ablegen.** Verschieb den Ordner `Urlaubsplanner` z. B. nach **Dokumente**. (Nicht in „Programme“ – dort darf
   sich die App nicht selbst aktualisieren.)
3. **Starten.** Im Ordner auf **`Urlaubsplanner`** (mit dem Koffer-Icon) doppelklicken.
4. **Beim ersten Mal:** Erscheint „Der Computer wurde durch Windows geschützt“, auf **Weitere Informationen** →
   **Trotzdem ausführen** klicken.
5. **Icon auf den Desktop:** Rechtsklick auf `Urlaubsplanner` → **Weitere Optionen anzeigen** → **Senden an** →
   **Desktop (Verknüpfung erstellen)**.

## Erster Start

Beim ersten Start erklärt dir ein kurzes Tutorial alles. Für **Flug- und Hotelpreise** brauchst du einen eigenen, kostenlosen
Key von [SerpApi](https://serpapi.com/users/sign_up):

- Konto anlegen, den **kostenlosen Plan** wählen und den Key aus **Your Account → API Key** in die App kopieren.
- Jeder Key hat **250 Suchen pro Monat** für Flüge und Hotels zusammen.
- **Gib deinen Key nicht weiter.** Wer ihn hat, verbraucht deine Suchen. Deshalb braucht jede Person ihren eigenen.

Ohne Key funktioniert alles andere trotzdem: Reisen, Etappen, Aktivitäten, Karte und Einträge von Hand.

## Updates – passieren von allein

Du musst nie wieder etwas herunterladen. Die App schaut beim Start nach, ob es eine neue Version gibt, und lädt sie im
Hintergrund. Dann erscheint oben ein Hinweis:

- **Einfach weitermachen:** Die neue Version wird installiert, sobald du die App schließt. Beim nächsten Öffnen ist sie da.
- **Oder „Jetzt neu starten“ klicken:** Die App startet nach ein paar Sekunden mit der neuen Version neu.

Deine Reisen und dein Key bleiben bei einem Update natürlich erhalten. Welche Version du hast, steht unter **Einstellungen**.

## Gut zu wissen

- **Fenster:** Die App öffnet sich in einem eigenen Fenster, wenn Google Chrome, Microsoft Edge oder Brave installiert ist.
  Sonst öffnet sie sich als Tab in deinem Standardbrowser.
- **Schon offen?** Ein Klick aufs Icon holt das offene Fenster nach vorne – es startet nichts doppelt.
- **Beenden:** Einfach das Fenster schließen. Nach etwa 10 Sekunden ist der Urlaubsplanner komplett beendet.
- **Deine Daten** (Reisen, Einstellungen, Key) liegen nur auf deinem Computer:
  - Mac: `~/Library/Application Support/Urlaubsplanner`
  - Windows: `%LOCALAPPDATA%\Urlaubsplanner`

  Zum Sichern diesen Ordner kopieren, am besten bei geschlossener App.
- **Wenn etwas nicht klappt:** Im selben Ordner liegt `urlaubsplanner.log`. Schick die Datei an Xoan.
- **Mac, Notlösung:** Startet die App gar nicht, öffne das Programm **Terminal** und gib einmal ein:
  `xattr -dr com.apple.quarantine /Applications/Urlaubsplanner.app`
