using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Xml.Linq;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>Was die App über ihre Installation weiß (für die Einstellungen).</summary>
/// <param name="Platform">"mac", "windows" oder "other".</param>
/// <param name="CanUninstall">Läuft als gepackte Desktop-App und kann sich selbst entfernen.</param>
/// <param name="CanAddToDock">Mac: liegt nicht im Download-Ordner (App Translocation) und kann ins Dock.</param>
/// <param name="InDock">Mac: ist schon im Dock.</param>
/// <param name="Installer">Windows: mit dem Installer installiert (Deinstallieren auch über „Apps“ in den Windows-Einstellungen).</param>
public sealed record InstallationStatus(string Platform, bool CanUninstall, bool CanAddToDock, bool InDock, bool Installer);

/// <summary>
/// Dock (Mac) und Deinstallieren. Beim Deinstallieren beendet sich die App; ein kleines Skript wartet darauf und
/// entfernt dann App, Verknüpfungen, Browser-Profil und – wenn gewünscht – Reisen, Einstellungen und Key.
/// </summary>
public sealed partial class AppInstallation(AppPaths paths, IHostApplicationLifetime lifetime, ILogger<AppInstallation> logger)
{
    private readonly InstallTarget? _target = paths.Desktop ? InstallTarget.Detect(AppContext.BaseDirectory) : null;
    private bool? _keepData;

    /// <summary>Deinstallieren wurde angefordert (wird nach dem Beenden in <see cref="RunPendingUninstall"/> ausgeführt).</summary>
    public bool UninstallRequested => _keepData.HasValue;

    public InstallationStatus Status()
    {
        var platform = OperatingSystem.IsMacOS() ? "mac" : OperatingSystem.IsWindows() ? "windows" : "other";
        var mac = _target as MacBundle;
        var translocated = mac?.BundlePath.Contains("/AppTranslocation/", StringComparison.Ordinal) ?? true;
        return new InstallationStatus(
            platform,
            CanUninstall: _target is WindowsFolder || (mac is not null && !translocated),
            CanAddToDock: mac is not null && !translocated,
            InDock: mac is not null && !translocated && IsInDock(mac.BundlePath),
            Installer: _target is WindowsFolder w && File.Exists(Path.Combine(w.InstallDirectory, "unins000.exe")));
    }

    private bool IsInDock(string bundlePath)
    {
        try
        {
            return Dock.Contains(Dock.Export(), bundlePath);
        }
        catch (Exception e) when (e is IOException or InvalidOperationException or System.Xml.XmlException or System.ComponentModel.Win32Exception)
        {
            LogDockUnreadable(e.Message);
            return false;
        }
    }

    /// <summary>Mac: App ins Dock legen (rechts neben die anderen Apps).</summary>
    public bool AddToDock()
    {
        if (_target is not MacBundle mac)
        {
            return false;
        }

        var plist = Dock.Export();
        if (Dock.Contains(plist, mac.BundlePath))
        {
            return true;
        }

        Dock.Import(Dock.WithApp(plist, mac.BundlePath));
        var saved = Dock.Contains(Dock.Export(), mac.BundlePath);
        LogDock(saved);
        return true;
    }

    /// <summary>Deinstallieren anfordern: Die App beendet sich gleich, danach wird aufgeräumt.</summary>
    public bool RequestUninstall(bool keepData)
    {
        if (_target is null)
        {
            return false;
        }

        _keepData = keepData;
        LogUninstall(keepData);
        if (_target is MacBundle mac)
        {
            try
            {
                var plist = Dock.Export();
                if (Dock.Contains(plist, mac.BundlePath))
                {
                    Dock.Import(Dock.WithoutApp(plist, mac.BundlePath));
                }
            }
            catch (Exception e) when (e is IOException or InvalidOperationException or System.Xml.XmlException or System.ComponentModel.Win32Exception)
            {
                // Dock-Eintrag bleibt dann als „?“ stehen – nicht schlimm.
                LogDockUnreadable(e.Message);
            }
        }

        // Kurz warten, damit die Antwort noch beim Fenster ankommt.
        _ = Task.Delay(TimeSpan.FromSeconds(1)).ContinueWith(_ => lifetime.StopApplication(), TaskScheduler.Default);
        return true;
    }

    /// <summary>Nach dem Beenden: Aufräum-Skript losgelöst starten. true = wurde gestartet.</summary>
    public bool RunPendingUninstall()
    {
        if (_keepData is not { } keep || _target is null)
        {
            return false;
        }

        var script = _target switch
        {
            MacBundle mac => (File: Path.Combine(Path.GetTempPath(), $"urlaubsplanner-entfernen-{Environment.ProcessId}.sh"), Text: MacScript(mac.BundlePath, paths.DataDirectory, keep, Environment.ProcessId)),
            WindowsFolder win => (File: Path.Combine(Path.GetTempPath(), $"urlaubsplanner-entfernen-{Environment.ProcessId}.ps1"), Text: WindowsScript(win.InstallDirectory, paths.DataDirectory, keep, Environment.ProcessId)),
            _ => default,
        };
        if (script.File is null)
        {
            return false;
        }

        File.WriteAllText(script.File, script.Text, new UTF8Encoding(encoderShouldEmitUTF8Identifier: OperatingSystem.IsWindows()));
        var start = OperatingSystem.IsWindows()
            ? new ProcessStartInfo("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script.File]) { UseShellExecute = false, CreateNoWindow = true }
            : new ProcessStartInfo("/bin/bash", [script.File]) { UseShellExecute = false };
        using var process = Process.Start(start);
        return process is not null;
    }

    internal static string Sh(string value) => "'" + value.Replace("'", "'\\''", StringComparison.Ordinal) + "'";

    internal static string Ps(string value) => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

    internal static string MacScript(string bundle, string data, bool keepData, int pid) =>
        $"""
        #!/bin/bash
        # Urlaubsplanner entfernen – läuft nach dem Beenden der App.
        for i in $(seq 1 60); do kill -0 {pid} 2>/dev/null || break; sleep 0.5; done
        pkill -TERM -f -- {Sh($"--user-data-dir={Path.Combine(data, "fenster")}")} 2>/dev/null
        sleep 1
        rm -rf {Sh(bundle)}
        {(keepData
            ? $"rm -rf {Sh(Path.Combine(data, "fenster"))} {Sh(Path.Combine(data, "update"))} {Sh(Path.Combine(data, "instance.json"))}"
            : $"rm -rf {Sh(data)}")}
        rm -f "$0"
        """;

    internal static string WindowsScript(string installDir, string data, bool keepData, int pid) =>
        $$"""
        # Urlaubsplanner entfernen – läuft nach dem Beenden der App.
        $ErrorActionPreference = 'SilentlyContinue'
        Wait-Process -Id {{pid.ToString(CultureInfo.InvariantCulture)}} -Timeout 30
        $profileArg = '--user-data-dir=' + {{Ps(Path.Combine(data, "fenster"))}}
        Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profileArg) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Start-Sleep -Seconds 2
        $app = {{Ps(installDir)}}
        $uninstaller = Join-Path $app 'unins000.exe'
        if (Test-Path $uninstaller) {
          $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'{{(keepData ? string.Empty : ", '/DELETEDATA'")}})
          Start-Process -FilePath $uninstaller -ArgumentList $arguments -Wait
          Start-Sleep -Seconds 3
        } else {
          foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
            Remove-Item -LiteralPath (Join-Path $folder 'Urlaubsplanner.lnk') -Force
          }
        }
        Remove-Item -LiteralPath $app -Recurse -Force
        {{(keepData
            ? $"Remove-Item -LiteralPath {Ps(Path.Combine(data, "fenster"))} -Recurse -Force; Remove-Item -LiteralPath {Ps(Path.Combine(data, "update"))} -Recurse -Force"
            : $"Remove-Item -LiteralPath {Ps(data)} -Recurse -Force")}}
        Remove-Item -LiteralPath $PSCommandPath -Force
        """;

    [LoggerMessage(Level = LogLevel.Information, Message = "Ins Dock gelegt (Eintrag gespeichert: {Saved})")]
    private partial void LogDock(bool saved);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Dock-Einstellungen nicht lesbar: {Reason}")]
    private partial void LogDockUnreadable(string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "Deinstallieren angefordert (Daten behalten: {KeepData})")]
    private partial void LogUninstall(bool keepData);
}

/// <summary>Mac-Dock über <c>defaults export/import com.apple.dock</c> – ohne Zusatzrechte.</summary>
internal static class Dock
{
    public static string Export()
    {
        var start = new ProcessStartInfo("/usr/bin/defaults", ["export", "com.apple.dock", "-"]) { UseShellExecute = false, RedirectStandardOutput = true };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("defaults");
        var xml = process.StandardOutput.ReadToEnd();
        process.WaitForExit(5000);
        return xml;
    }

    public static void Import(string plistXml)
    {
        // Über eine Datei statt stdin – „defaults import“ liest stdin nicht überall zuverlässig.
        var file = Path.Combine(Path.GetTempPath(), $"urlaubsplanner-dock-{Environment.ProcessId}.plist");
        File.WriteAllText(file, plistXml);
        try
        {
            var start = new ProcessStartInfo("/usr/bin/defaults", ["import", "com.apple.dock", file]) { UseShellExecute = false, RedirectStandardError = true };
            using var process = Process.Start(start) ?? throw new InvalidOperationException("defaults");
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit(5000);
            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException($"defaults import: {error.Trim()}");
            }
        }
        finally
        {
            File.Delete(file);
        }

        // Dock neu starten, damit es die Änderung zeigt (startet sofort von selbst wieder). Hart beenden: Bei einem
        // normalen Beenden speichert das Dock seinen alten Stand und macht die Änderung wieder rückgängig.
        using var kill = Process.Start(new ProcessStartInfo("/usr/bin/killall", ["-KILL", "Dock"]) { UseShellExecute = false });
        kill?.WaitForExit(3000);
    }

    public static bool Contains(string plistXml, string bundlePath) => Apps(XDocument.Parse(plistXml)).Any(e => Points(e, bundlePath));

    public static string WithApp(string plistXml, string bundlePath)
    {
        var doc = XDocument.Parse(plistXml);
        var array = AppsArray(doc);
        array.Add(new XElement(
            "dict",
            new XElement("key", "tile-data"),
            new XElement(
                "dict",
                new XElement("key", "file-data"),
                new XElement(
                    "dict",
                    new XElement("key", "_CFURLString"),
                    new XElement("string", FileUrl(bundlePath)),
                    new XElement("key", "_CFURLStringType"),
                    new XElement("integer", "15")),
                new XElement("key", "file-label"),
                new XElement("string", Path.GetFileNameWithoutExtension(bundlePath))),
            new XElement("key", "tile-type"),
            new XElement("string", "file-tile")));
        return Serialize(doc);
    }

    public static string WithoutApp(string plistXml, string bundlePath)
    {
        var doc = XDocument.Parse(plistXml);
        foreach (var entry in Apps(doc).Where(e => Points(e, bundlePath)).ToList())
        {
            entry.Remove();
        }

        return Serialize(doc);
    }

    /// <summary>
    /// Plist-Kopf selbst schreiben: .NET gibt den DOCTYPE als „…dtd"[]>“ aus, das macOS ablehnt.
    /// </summary>
    private static string Serialize(XDocument doc)
    {
        doc.DocumentType?.Remove();
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">

            """ + doc.Root;
    }

    private static XElement AppsArray(XDocument doc)
    {
        var root = doc.Root?.Element("dict") ?? throw new System.Xml.XmlException("Keine Dock-Einstellungen");
        var key = root.Elements("key").FirstOrDefault(k => k.Value == "persistent-apps");
        if (key?.ElementsAfterSelf().FirstOrDefault() is { Name.LocalName: "array" } array)
        {
            return array;
        }

        array = new XElement("array");
        root.Add(new XElement("key", "persistent-apps"), array);
        return array;
    }

    private static IEnumerable<XElement> Apps(XDocument doc) => AppsArray(doc).Elements("dict");

    private static bool Points(XElement entry, string bundlePath)
    {
        var target = Path.TrimEndingDirectorySeparator(bundlePath);
        return entry.Descendants("string").Any(s =>
            string.Equals(Path.TrimEndingDirectorySeparator(Uri.TryCreate(s.Value, UriKind.Absolute, out var uri) && uri.IsFile ? uri.LocalPath : s.Value), target, StringComparison.Ordinal));
    }

    private static string FileUrl(string path) => new Uri(Path.TrimEndingDirectorySeparator(path) + "/").AbsoluteUri;
}
