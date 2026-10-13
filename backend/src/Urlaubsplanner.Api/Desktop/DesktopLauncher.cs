using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Alles rund um den Start per Doppelklick: läuft die App schon (dann nur Fenster öffnen), welcher Port,
/// und das App-Fenster selbst – Chrome/Edge/Brave im App-Modus (ohne Adressleiste), sonst der Standardbrowser.
/// </summary>
public static partial class DesktopLauncher
{
    /// <summary>Fester Port, damit Einstellungen im Browser (z. B. Heimatflughafen) beim nächsten Start noch da sind.</summary>
    public const int PreferredPort = 51770;

    private static readonly string[] LinuxBrowsers = ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

    private sealed record Instance(int Port, int ProcessId);

    /// <summary>
    /// Läuft die App schon? Dann kein zweiter Server: das offene Fenster nach vorne holen, oder – wenn keins offen ist
    /// oder das nicht klappt – ein Fenster öffnen.
    /// </summary>
    public static async Task<bool> TryActivateExistingAsync(AppPaths paths, ILogger? logger = null)
    {
        ArgumentNullException.ThrowIfNull(paths);
        if (!File.Exists(paths.InstanceFile))
        {
            return false;
        }

        try
        {
            var instance = JsonSerializer.Deserialize<Instance>(await File.ReadAllTextAsync(paths.InstanceFile).ConfigureAwait(false));
            if (instance is null)
            {
                return false;
            }

            var url = $"http://127.0.0.1:{instance.Port}/";
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var info = await http.GetStringAsync(new Uri(url + "api/app/info")).ConfigureAwait(false);
            if (!info.Contains(AppPaths.AppId, StringComparison.Ordinal))
            {
                return false;
            }

            var (windows, starting) = await GetOpenWindowsAsync(http, url).ConfigureAwait(false);
            if (starting)
            {
                // Das erste Fenster ist noch unterwegs (z. B. doppelt geklickt) – kein zweites öffnen.
                if (logger is not null)
                {
                    LogStillStarting(logger);
                }

                return true;
            }

            if (windows > 0)
            {
                var result = WindowFocus.TryBringToFront(paths);
                if (logger is not null)
                {
                    LogSecondLaunch(logger, windows, result);
                }

                if (result == FocusResult.Done)
                {
                    return true;
                }
            }

            var opened = OpenWindow(url, paths);
            if (logger is not null)
            {
                LogOpened(logger, opened);
            }

            return true;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or IOException)
        {
            return false;
        }
    }

    private static async Task<(int Open, bool Starting)> GetOpenWindowsAsync(HttpClient http, string url)
    {
        try
        {
            var json = await http.GetStringAsync(new Uri(url + "api/app/windows")).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var open = root.TryGetProperty("open", out var o) && o.TryGetInt32(out var count) ? count : 0;
            var starting = root.TryGetProperty("starting", out var s) && s.ValueKind == JsonValueKind.True;
            return (open, starting);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            // Ältere Version ohne diese Abfrage: wie bisher ein Fenster öffnen.
            return (0, false);
        }
    }

    /// <summary>Der feste Port, wenn er frei ist – sonst irgendein freier.</summary>
    public static int ChoosePort()
    {
        foreach (var port in new[] { PreferredPort, 0 })
        {
            try
            {
                var listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                var chosen = ((IPEndPoint)listener.LocalEndpoint).Port;
                listener.Stop();
                return chosen;
            }
            catch (SocketException)
            {
                // Port belegt – nächsten versuchen.
            }
        }

        return PreferredPort;
    }

    public static void WriteInstance(AppPaths paths, int port)
    {
        ArgumentNullException.ThrowIfNull(paths);
        File.WriteAllText(paths.InstanceFile, JsonSerializer.Serialize(new Instance(port, Environment.ProcessId)));
    }

    public static void DeleteInstance(AppPaths paths)
    {
        ArgumentNullException.ThrowIfNull(paths);
        try
        {
            File.Delete(paths.InstanceFile);
        }
        catch (IOException)
        {
            // Nicht schlimm – beim nächsten Start wird geprüft, ob die Instanz noch antwortet.
        }
    }

    /// <summary>
    /// Öffnet die App im Standardbrowser: als eigenes App-Fenster, wenn er das kann (Chrome, Edge, Brave, Vivaldi),
    /// sonst als Tab (Safari, Firefox …). Lässt sich der Standardbrowser nicht bestimmen, wird ein vorhandener
    /// Chromium-Browser genommen. Gibt zurück, wie geöffnet wurde (fürs Log).
    /// </summary>
    public static string OpenWindow(string url, AppPaths paths)
    {
        ArgumentNullException.ThrowIfNull(paths);
        var custom = Environment.GetEnvironmentVariable("URLAUBSPLANNER_BROWSER");
        if (string.IsNullOrWhiteSpace(custom))
        {
            var choice = DefaultBrowser.Detect();
            if (choice?.AppWindowExecutable is { } exe && TryStart(AppWindow(exe, url, paths)))
            {
                return $"App-Fenster mit {choice.Name}";
            }

            if (choice is not null && DefaultBrowser.OpenUrl(url))
            {
                return $"Tab im Standardbrowser ({choice.Name})";
            }
        }

        var browser = FindChromium();
        if (browser is not null && TryStart(AppWindow(browser, url, paths)))
        {
            return $"App-Fenster mit {Path.GetFileNameWithoutExtension(browser)}";
        }

        // Kein Chrome/Edge/Brave: normaler Tab im Standardbrowser.
        DefaultBrowser.OpenUrl(url);
        return "Tab im Standardbrowser";
    }

    private static ProcessStartInfo AppWindow(string browser, string url, AppPaths paths)
    {
        var start = new ProcessStartInfo(browser) { UseShellExecute = false };
        start.ArgumentList.Add($"--app={url}");
        start.ArgumentList.Add($"--user-data-dir={paths.BrowserProfile}");
        start.ArgumentList.Add("--no-first-run");
        start.ArgumentList.Add("--no-default-browser-check");
        start.ArgumentList.Add("--window-size=1440,920");
        return start;
    }

    private static bool TryStart(ProcessStartInfo start)
    {
        try
        {
            using var process = Process.Start(start);
            return process is not null;
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or FileNotFoundException)
        {
            return false;
        }
    }

    /// <summary>Chrome, Edge oder Brave an den üblichen Stellen; null, wenn keiner da ist.</summary>
    internal static string? FindChromium()
    {
        var custom = Environment.GetEnvironmentVariable("URLAUBSPLANNER_BROWSER");
        if (!string.IsNullOrWhiteSpace(custom))
        {
            return File.Exists(custom) ? custom : null;
        }

        IEnumerable<string> candidates;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string[] apps =
            [
                "Google Chrome.app/Contents/MacOS/Google Chrome",
                "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "Brave Browser.app/Contents/MacOS/Brave Browser",
                "Chromium.app/Contents/MacOS/Chromium",
            ];
            candidates = apps.SelectMany(a => new[] { Path.Combine("/Applications", a), Path.Combine(home, "Applications", a) });
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            var roots = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            }.Where(r => !string.IsNullOrEmpty(r));
            string[] apps =
            [
                @"Google\Chrome\Application\chrome.exe",
                @"Microsoft\Edge\Application\msedge.exe",
                @"BraveSoftware\Brave-Browser\Application\brave.exe",
            ];
            candidates = apps.SelectMany(a => roots.Select(r => Path.Combine(r, a)));
        }
        else
        {
            var path = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty).Split(Path.PathSeparator);
            candidates = LinuxBrowsers.SelectMany(n => path.Select(p => Path.Combine(p, n)));
        }

        return candidates.FirstOrDefault(File.Exists);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Fenster geöffnet: {How}")]
    internal static partial void LogOpened(ILogger logger, string how);

    [LoggerMessage(Level = LogLevel.Information, Message = "App startet gerade – Fenster ist unterwegs, kein zweites")]
    private static partial void LogStillStarting(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "App läuft schon ({Windows} Fenster offen) – nach vorne holen: {Result}")]
    private static partial void LogSecondLaunch(ILogger logger, int windows, FocusResult result);
}
