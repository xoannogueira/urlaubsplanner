; Windows-Installer für den Urlaubsplanner (Inno Setup 6).
; Gebaut von packaging/build-app.sh windows:  ISCC /DAppVersion=1.2.3 /DSourceDir=…\Urlaubsplanner /DOutputDir=…\dist Urlaubsplanner.iss
;
; - Installiert ohne Admin-Rechte nach %LOCALAPPDATA%\Programs\Urlaubsplanner – dort kann sich die App selbst aktualisieren.
; - Startmenü-Eintrag und (vorausgewählt) Verknüpfung auf dem Desktop.
; - Deinstallieren über Windows-Einstellungen → Apps oder in der App unter „Einstellungen“; fragt, ob die Reisen mit weg sollen.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\Urlaubsplanner-Windows\Urlaubsplanner"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif

[Setup]
AppId={{8F3C2A51-6C1E-4D2B-9A57-3E1B7C0D9A24}
AppName=Urlaubsplanner
AppVersion={#AppVersion}
AppVerName=Urlaubsplanner {#AppVersion}
AppPublisher=Xoan Nogueira
AppPublisherURL=https://github.com/xoannogueira/urlaubsplanner
DefaultDirName={autopf}\Urlaubsplanner
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
WizardStyle=modern
SetupIconFile=..\icons\Urlaubsplanner.ico
UninstallDisplayIcon={app}\Urlaubsplanner.exe
UninstallDisplayName=Urlaubsplanner
OutputDir={#OutputDir}
OutputBaseFilename=Urlaubsplanner-Setup
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Verknüpfung auf dem &Desktop anlegen"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; Reste früherer automatischer Updates
Type: files; Name: "{app}\*.old"

[Icons]
Name: "{autoprograms}\Urlaubsplanner"; Filename: "{app}\Urlaubsplanner.exe"
Name: "{autodesktop}\Urlaubsplanner"; Filename: "{app}\Urlaubsplanner.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Urlaubsplanner.exe"; Description: "Urlaubsplanner jetzt starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Alles im Programmordner, auch Dateien aus automatischen Updates
Type: filesandordirs; Name: "{app}"

[Code]
const
  DataHint = 'Sollen auch deine Reisen, Einstellungen und dein API-Key gelöscht werden?' + #13#10 + #13#10 +
    'Wähle „Nein“, wenn du den Urlaubsplanner später wieder installieren und deine Reisen behalten möchtest.';

{ Laufende App und ihr App-Fenster beenden, damit Dateien nicht gesperrt sind. }
procedure StopApp();
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Urlaubsplanner.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec('powershell.exe', '-NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains(''\Urlaubsplanner\fenster'') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopApp();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopApp();
  Result := True;
end;

function HasParam(Name: String): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
    if CompareText(ParamStr(I), Name) = 0 then
      Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DeleteData: Boolean;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    { Aus der App heraus kommt die Wahl als /DELETEDATA mit; sonst fragen. }
    if UninstallSilent then
      DeleteData := HasParam('/DELETEDATA')
    else
      DeleteData := MsgBox(DataHint, mbConfirmation, MB_YESNO) = IDYES;
    if DeleteData then
      DelTree(ExpandConstant('{localappdata}\Urlaubsplanner'), True, True, True)
    else
      DelTree(ExpandConstant('{localappdata}\Urlaubsplanner\fenster'), True, True, True);
  end;
end;
