# Urlaubsplanner – so geht's

Reisen planen an einem Ort: Etappen, Flüge, Hotels und Aktivitäten, mit echten Preisen und allem auf der Karte.
Deine Daten bleiben auf deinem Computer. Du brauchst kein Terminal und musst nichts einrichten.

## Mac

1. **`Urlaubsplanner-Mac.dmg` öffnen** (Doppelklick). Es öffnet sich ein Fenster mit dem Koffer-Icon und dem Ordner
   „Programme“.
2. **Das Koffer-Icon auf den Ordner „Programme“ ziehen.** Fertig installiert. Das Fenster kannst du danach schließen
   (und in der Seitenleiste des Finders auf ⏏ neben „Urlaubsplanner“ klicken).
3. **Beim ersten Mal öffnen.** Die App ist nicht bei Apple registriert, deshalb fragt dein Mac einmal nach:
   - Im Finder **Programme** öffnen, **Rechtsklick** (oder Ctrl-Klick) auf `Urlaubsplanner` → **Öffnen** → nochmal **Öffnen**.
   - Kommt nur „kann nicht geöffnet werden“: **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen
     und bei „Urlaubsplanner“ auf **Trotzdem öffnen** klicken.
4. **Ins Dock legen:** Am Ende des Tutorials (oder unter **Einstellungen**) auf **„Ins Dock legen“** klicken. Ab jetzt reicht
   ein Klick aufs Icon im Dock.

## Windows

1. **`Urlaubsplanner-Setup.exe` öffnen** (Doppelklick).
2. Erscheint „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen** → **Trotzdem ausführen** klicken.
   Das passiert nur beim ersten Mal.
3. Im Installer **Weiter** und **Installieren** klicken. Das Häkchen bei „Verknüpfung auf dem Desktop anlegen“ ist schon
   gesetzt. Zum Schluss startet der Urlaubsplanner auf Wunsch gleich.
4. Ab jetzt startest du die App über das Icon auf dem Desktop oder im Startmenü.

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

## Deinstallieren

- **In der App:** **Einstellungen → „Urlaubsplanner deinstallieren“**. Du wählst, ob deine Reisen gelöscht oder behalten
  werden. Die App schließt sich und ist nach ein paar Sekunden komplett weg – mit Dock-Eintrag bzw. Verknüpfungen.
- **Windows** geht auch ganz normal über **Einstellungen → Apps → Urlaubsplanner → Deinstallieren**.

## Gut zu wissen

- **Browser:** Die App öffnet sich mit deinem Standardbrowser. Ist das Chrome, Edge, Brave oder Vivaldi, bekommt sie ein
  eigenes Fenster wie eine richtige App. Bei Safari oder Firefox öffnet sie sich als Tab.
- **Links** in der App (Booking, Google Flights …) öffnen sich immer in deinem Standardbrowser – dort, wo du eingeloggt bist.
- **Reiseplan als PDF:** In jeder Reise gibt es links den Punkt **„PDF“**. Ein Klick auf **„PDF erstellen“** speichert den
  ganzen Plan im Ordner **Downloads** und öffnet ihn – zum Ausdrucken oder fürs Handy.
- **Schon offen?** Ein Klick aufs Icon holt das offene Fenster nach vorne – es startet nichts doppelt.
- **Beenden:** Einfach das Fenster (bzw. den Tab) schließen. Nach etwa 10 Sekunden ist der Urlaubsplanner komplett beendet.
- **Deine Daten** (Reisen, Einstellungen, Key) liegen nur auf deinem Computer:
  - Mac: `~/Library/Application Support/Urlaubsplanner`
  - Windows: `%LOCALAPPDATA%\Urlaubsplanner`

  Zum Sichern diesen Ordner kopieren, am besten bei geschlossener App.
- **Suche findet nichts oder meldet Fehler?** In der App oben **Einstellungen → „Verbindung prüfen“** klicken. Dort steht
  für jeden Dienst, ob die App ihn erreicht – und wenn nicht, warum. Mit **„Ergebnis kopieren“** kannst du es an Xoan schicken.
- **Windows mit Avast (oder einem anderen Antivirenprogramm):** Blockiert es die App, im Antivirenprogramm den
  Programmordner `%LOCALAPPDATA%\Programs\Urlaubsplanner` als Ausnahme hinzufügen (Avast: Menü → Einstellungen → Ausnahmen)
  und bei einer Firewall-Frage **Zulassen** wählen. Danach die App schließen, neu öffnen und noch einmal „Verbindung prüfen“.
- **Wenn etwas nicht klappt:** Die Datei `urlaubsplanner.log` liegt unter Windows in `%LOCALAPPDATA%\Urlaubsplanner`
  (Windows-Taste + R, `%LOCALAPPDATA%\Urlaubsplanner` eingeben, Enter), am Mac in
  `~/Library/Application Support/Urlaubsplanner`. Schick die Datei an Xoan.
- **Mac, Notlösung:** Startet die App gar nicht, öffne das Programm **Terminal** und gib einmal ein:
  `xattr -dr com.apple.quarantine /Applications/Urlaubsplanner.app`
