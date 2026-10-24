#!/usr/bin/env bash
# Baut den Urlaubsplanner als Desktop-App zum Weitergeben – Doppelklick startet alles, kein Terminal nötig.
#
#   packaging/build-app.sh mac           # alle Macs (Apple-Chip und Intel in einer App)
#   packaging/build-app.sh windows       # Windows 10/11 (64 Bit)
#   packaging/build-app.sh all           # beides
#
# Ergebnis (feste Namen, damit die Download-Links …/releases/latest/download/… und die Updates sie immer finden):
#   dist/Urlaubsplanner-Mac.dmg       Installationsfenster für den Mac (App in „Programme“ ziehen)
#   dist/Urlaubsplanner-Setup.exe     Installer für Windows (braucht Inno Setup 6)
#   dist/Urlaubsplanner-Mac.zip, dist/Urlaubsplanner-Windows.zip – für die automatischen Updates
# Mac-Pakete bitte auf einem Mac bauen: nur dort lässt sich die App signieren (ohne Signatur startet sie auf Apple-Chips nicht).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
API="$ROOT/backend/src/Urlaubsplanner.Api"
ICONS="$ROOT/packaging/icons"
# Anzeige-Version z. B. „1.2.0“ oder „1.2.0-3-gabc123“; .NET und macOS brauchen eine reine Zahl wie 1.2.0.
VERSION="${VERSION:-$(git -C "$ROOT" describe --tags --always 2>/dev/null | sed 's/^v//' || echo 0.0.0)}"
NUMERIC_VERSION="$(echo "$VERSION" | grep -Eo '^[0-9]+(\.[0-9]+){1,2}' || echo 0.0.0)"

targets=("$@")
[ ${#targets[@]} -eq 0 ] && { sed -n '2,10p' "$0"; exit 1; }
[ "${targets[0]}" = "all" ] && targets=(mac windows)

echo "▸ Frontend bauen"
(cd "$ROOT/frontend" && npm ci --no-audit --no-fund && npm run build)

mkdir -p "$DIST"

publish() { # $1 = Runtime, $2 = Zielordner, weitere Argumente gehen an dotnet publish
  local rid="$1" out="$2"
  shift 2
  echo "▸ Backend für $rid veröffentlichen"
  rm -rf "$out"
  dotnet publish "$API" -c Release -r "$rid" --self-contained true -o "$out" \
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
    -p:DebugType=None -p:GenerateDocumentationFile=false \
    -p:Version="$NUMERIC_VERSION" -p:InformationalVersion="$VERSION" "$@"
  # Kennzeichnet den Ordner als Desktop-App: Datenordner im Benutzerverzeichnis, eigenes Fenster, Beenden beim Schließen.
  echo '{ "Desktop": { "Enabled": true } }' > "$out/desktop.json"
  # Aviasales-Token für die kostenlosen Richtpreise mitliefern (GitHub-Secret TRAVELPAYOUTS_TOKEN), damit Freunde
  # sich nicht selbst anmelden müssen. Nie ausgeben – nur in die Datei schreiben.
  if [ -n "${TRAVELPAYOUTS_TOKEN:-}" ]; then
    if ! [[ "$TRAVELPAYOUTS_TOKEN" =~ ^[A-Za-z0-9_-]+$ ]]; then
      echo "TRAVELPAYOUTS_TOKEN enthält unerwartete Zeichen" >&2
      exit 1
    fi
    printf '{ "Travelpayouts": { "Token": "%s" } }\n' "$TRAVELPAYOUTS_TOKEN" > "$out/bundled.json"
    echo "  Aviasales-Token mitgeliefert"
  else
    echo "  Ohne Aviasales-Token (Preiskalender nur mit Google)"
  fi
  rm -f "$out"/*.pdb
}

build_mac() {
  local name="Urlaubsplanner-Mac"
  local app="$DIST/$name/Urlaubsplanner.app"
  rm -rf "$DIST/$name"
  mkdir -p "$app/Contents/Resources"
  # Beide Varianten in eine App – das Startprogramm nimmt die passende. So muss niemand wissen, welchen Chip sein Mac hat.
  publish osx-arm64 "$app/Contents/MacOS/arm64"
  publish osx-x64 "$app/Contents/MacOS/x64"
  cp "$ICONS/Urlaubsplanner.icns" "$app/Contents/Resources/"
  # Startprogramm der App: startet den Server losgelöst und beendet sich sofort. So startet macOS die App bei jedem
  # Klick neu – läuft sie schon, öffnet der Server nur ein weiteres Fenster.
  cat > "$app/Contents/MacOS/Urlaubsplanner" <<'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -m)" = "arm64" ]; then ARCH=arm64; else ARCH=x64; fi
nohup "$DIR/$ARCH/Urlaubsplanner.Api" --desktop "$@" >/dev/null 2>&1 &
LAUNCHER
  chmod +x "$app/Contents/MacOS/Urlaubsplanner" "$app/Contents/MacOS/arm64/Urlaubsplanner.Api" "$app/Contents/MacOS/x64/Urlaubsplanner.Api"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Urlaubsplanner</string>
  <key>CFBundleDisplayName</key><string>Urlaubsplanner</string>
  <key>CFBundleIdentifier</key><string>io.github.xoannogueira.urlaubsplanner</string>
  <key>CFBundleExecutable</key><string>Urlaubsplanner</string>
  <key>CFBundleIconFile</key><string>Urlaubsplanner</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${NUMERIC_VERSION}</string>
  <key>CFBundleVersion</key><string>${NUMERIC_VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <!-- Der Server läuft unsichtbar im Hintergrund; sichtbar ist nur das App-Fenster. -->
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
  if command -v codesign >/dev/null; then
    echo "▸ Ad-hoc signieren"
    codesign --force --deep --sign - "$app"
  else
    echo "⚠ codesign fehlt (kein Mac) – die App startet auf Apple-Chips erst nach dem Signieren auf einem Mac."
  fi
  cp "$ROOT/packaging/ANLEITUNG.md" "$DIST/$name/ANLEITUNG.md"
  (cd "$DIST/$name" && rm -f "$DIST/$name.zip" &&
    if command -v ditto >/dev/null; then ditto -c -k --sequesterRsrc . "$DIST/$name.zip"; else zip -qry "$DIST/$name.zip" .; fi)
  echo "✓ $DIST/$name.zip"
  build_dmg "$app"
}

# Installationsfenster für den Mac: App + Ordner „Programme“ zum Hinüberziehen. Das Zip bleibt für die Updates.
build_dmg() {
  local app="$1" dmg="$DIST/Urlaubsplanner-Mac.dmg"
  command -v hdiutil >/dev/null || { echo "⚠ hdiutil fehlt (kein Mac) – kein .dmg"; return; }
  rm -f "$dmg"
  if command -v dmgbuild >/dev/null; then
    dmgbuild -s "$ROOT/packaging/mac/dmg_settings.py" -D app="$app" -D icon="$ICONS/Urlaubsplanner.icns" "Urlaubsplanner" "$dmg"
  else
    # Ohne dmgbuild: gleiche Dateien, nur ohne Pfeil im Hintergrund.
    local stage
    stage="$(mktemp -d)"
    cp -R "$app" "$stage/"
    ln -s /Applications "$stage/Programme"
    hdiutil create -volname Urlaubsplanner -srcfolder "$stage" -ov -format UDZO "$dmg" >/dev/null
    rm -rf "$stage"
  fi
  echo "✓ $dmg"
}

build_windows() {
  local name="Urlaubsplanner-Windows"
  local out="$DIST/$name/Urlaubsplanner"
  rm -rf "$DIST/$name"
  # DesktopWindows: kein schwarzes Konsolenfenster beim Start und eigenes Icon (siehe Urlaubsplanner.Api.csproj).
  publish win-x64 "$out" -p:DesktopWindows=true
  mv "$out/Urlaubsplanner.Api.exe" "$out/Urlaubsplanner.exe"
  cp "$ROOT/packaging/ANLEITUNG.md" "$DIST/$name/ANLEITUNG.md"
  (cd "$DIST/$name" && rm -f "$DIST/$name.zip" &&
    if command -v zip >/dev/null; then zip -qr "$DIST/$name.zip" .; else 7z a -tzip -bso0 "$DIST/$name.zip" .; fi)
  echo "✓ $DIST/$name.zip"
  build_installer "$out"
}

# Windows-Installer (Inno Setup): Urlaubsplanner-Setup.exe. Das Zip bleibt für die Updates.
build_installer() {
  local iscc
  iscc="$(command -v iscc || command -v ISCC.exe || true)"
  for candidate in "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" "/c/Program Files/Inno Setup 6/ISCC.exe"; do
    [ -z "$iscc" ] && [ -f "$candidate" ] && iscc="$candidate"
  done
  [ -z "$iscc" ] && { echo "⚠ Inno Setup (ISCC) fehlt – kein Installer, nur das Zip"; return; }
  win() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
  # MSYS würde „/D…“ sonst für einen Pfad halten.
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' "$iscc" /Q "/DAppVersion=$NUMERIC_VERSION" "/DSourceDir=$(win "$1")" "/DOutputDir=$(win "$DIST")" \
    "$(win "$ROOT/packaging/windows/Urlaubsplanner.iss")"
  echo "✓ $DIST/Urlaubsplanner-Setup.exe"
}

for target in "${targets[@]}"; do
  case "$target" in
    mac) build_mac ;;
    windows) build_windows ;;
    *) echo "Unbekanntes Ziel: $target (mac, windows, all)"; exit 1 ;;
  esac
done
