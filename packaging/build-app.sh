#!/usr/bin/env bash
# Baut den Urlaubsplanner als Desktop-App zum Weitergeben – Doppelklick startet alles, kein Terminal nötig.
#
#   packaging/build-app.sh mac-arm64     # Mac mit Apple-Chip (M1–M4)
#   packaging/build-app.sh mac-x64       # Mac mit Intel-Chip
#   packaging/build-app.sh windows       # Windows 10/11 (64 Bit)
#   packaging/build-app.sh all           # alles
#
# Ergebnis: dist/Urlaubsplanner-<Ziel>.zip
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
[ "${targets[0]}" = "all" ] && targets=(mac-arm64 mac-x64 windows)

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
  rm -f "$out"/*.pdb
}

build_mac() { # $1 = osx-arm64 | osx-x64
  local rid="$1" name="Urlaubsplanner-Mac-${1#osx-}"
  local app="$DIST/$name/Urlaubsplanner.app"
  rm -rf "$DIST/$name"
  mkdir -p "$app/Contents/Resources"
  publish "$rid" "$app/Contents/MacOS"
  cp "$ICONS/Urlaubsplanner.icns" "$app/Contents/Resources/"
  # Startprogramm der App: startet den Server losgelöst und beendet sich sofort. So startet macOS die App bei jedem
  # Klick neu – läuft sie schon, öffnet der Server nur ein weiteres Fenster.
  cat > "$app/Contents/MacOS/Urlaubsplanner" <<'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
nohup "$DIR/Urlaubsplanner.Api" --desktop >/dev/null 2>&1 &
LAUNCHER
  chmod +x "$app/Contents/MacOS/Urlaubsplanner" "$app/Contents/MacOS/Urlaubsplanner.Api"
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
}

build_windows() {
  local name="Urlaubsplanner-Windows"
  local out="$DIST/$name/Urlaubsplanner"
  rm -rf "$DIST/$name"
  # WinExe: kein schwarzes Konsolenfenster beim Start.
  # Icon relativ zum Projekt angeben – so klappt es auch unter Git Bash auf Windows.
  publish win-x64 "$out" -p:OutputType=WinExe -p:ApplicationIcon=../../../packaging/icons/Urlaubsplanner.ico
  mv "$out/Urlaubsplanner.Api.exe" "$out/Urlaubsplanner.exe"
  cp "$ROOT/packaging/ANLEITUNG.md" "$DIST/$name/ANLEITUNG.md"
  (cd "$DIST/$name" && rm -f "$DIST/$name.zip" &&
    if command -v zip >/dev/null; then zip -qr "$DIST/$name.zip" .; else 7z a -tzip -bso0 "$DIST/$name.zip" .; fi)
  echo "✓ $DIST/$name.zip"
}

for target in "${targets[@]}"; do
  case "$target" in
    mac-arm64) build_mac osx-arm64 ;;
    mac-x64) build_mac osx-x64 ;;
    windows) build_windows ;;
    *) echo "Unbekanntes Ziel: $target (mac-arm64, mac-x64, windows, all)"; exit 1 ;;
  esac
done
