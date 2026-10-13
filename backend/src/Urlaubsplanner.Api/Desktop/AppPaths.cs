namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Wo die App ihre Daten ablegt. Als Desktop-App im Benutzerordner
/// (Mac: ~/Library/Application Support/Urlaubsplanner, Windows: %LOCALAPPDATA%\Urlaubsplanner),
/// beim Entwickeln im Ordner der Datendatei (Standard: data/).
/// </summary>
/// <param name="Desktop">Läuft als Desktop-App (Doppelklick auf das App-Icon).</param>
/// <param name="DataDirectory">Ordner für Reisen, Einstellungen und Log.</param>
public sealed record AppPaths(bool Desktop, string DataDirectory)
{
    public const string AppId = "urlaubsplanner";

    /// <summary>Eigene Einstellungen (z. B. der API-Key), die in der App eingetragen werden.</summary>
    public string SettingsFile => Path.Combine(DataDirectory, "settings.json");

    public string TripsFile => Path.Combine(DataDirectory, "trips.json");

    /// <summary>Port und Prozess der laufenden App – damit ein zweiter Klick nur das Fenster öffnet.</summary>
    public string InstanceFile => Path.Combine(DataDirectory, "instance.json");

    public string LogFile => Path.Combine(DataDirectory, "urlaubsplanner.log");

    /// <summary>Eigenes Browser-Profil für das App-Fenster.</summary>
    public string BrowserProfile => Path.Combine(DataDirectory, "fenster");

    /// <summary>
    /// Desktop-Modus, wenn neben der Programmdatei eine <c>desktop.json</c> liegt (so wird die App gepackt)
    /// oder mit <c>--desktop</c> gestartet wird.
    /// </summary>
    public static bool IsDesktopRequested(string[] args) =>
        args.Contains("--desktop", StringComparer.OrdinalIgnoreCase) || File.Exists(Path.Combine(AppContext.BaseDirectory, "desktop.json"));

    public static AppPaths Resolve(bool desktop, string? storageFile)
    {
        var overrideDir = Environment.GetEnvironmentVariable("URLAUBSPLANNER_DATA");
        if (!string.IsNullOrWhiteSpace(overrideDir))
        {
            return new AppPaths(desktop, Path.GetFullPath(overrideDir));
        }

        if (desktop)
        {
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.Create);
            return new AppPaths(true, Path.Combine(root, "Urlaubsplanner"));
        }

        var file = Path.GetFullPath(string.IsNullOrWhiteSpace(storageFile) ? "data/trips.json" : storageFile);
        return new AppPaths(false, Path.GetDirectoryName(file)!);
    }
}
