using System.Diagnostics;
using System.Runtime.Versioning;
using System.Xml.Linq;
using Microsoft.Win32;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>Der Standardbrowser der Person: Name und – wenn er ein eigenes App-Fenster kann – das Programm dazu.</summary>
/// <param name="Name">Anzeigename, z. B. „Safari“ oder „Google Chrome“.</param>
/// <param name="AppWindowExecutable">Programmdatei für ein App-Fenster (nur Chrome, Edge, Brave, Vivaldi, Chromium), sonst null.</param>
public sealed record BrowserChoice(string Name, string? AppWindowExecutable);

/// <summary>
/// Findet den Standardbrowser. Kann er ein eigenes App-Fenster (Chromium-Browser), öffnet die App darin;
/// sonst (Safari, Firefox …) als normaler Tab. Links aus der App öffnen immer im Standardbrowser.
/// </summary>
public static class DefaultBrowser
{
    /// <summary>Mac: Bundle-ID → Name und Pfad der Programmdatei im .app-Bundle (null = kein App-Fenster möglich).</summary>
    internal static readonly Dictionary<string, (string Name, string? Executable)> MacBrowsers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["com.google.chrome"] = ("Google Chrome", "Google Chrome.app/Contents/MacOS/Google Chrome"),
        ["com.microsoft.edgemac"] = ("Microsoft Edge", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ["com.brave.browser"] = ("Brave", "Brave Browser.app/Contents/MacOS/Brave Browser"),
        ["com.vivaldi.vivaldi"] = ("Vivaldi", "Vivaldi.app/Contents/MacOS/Vivaldi"),
        ["org.chromium.chromium"] = ("Chromium", "Chromium.app/Contents/MacOS/Chromium"),
        ["com.apple.safari"] = ("Safari", null),
        ["org.mozilla.firefox"] = ("Firefox", null),
        ["company.thebrowser.browser"] = ("Arc", null),
        ["com.operasoftware.opera"] = ("Opera", null),
    };

    /// <summary>Windows: Anfang der ProgId → Name; App-Fenster können nur Chromium-Browser.</summary>
    internal static readonly (string Prefix, string Name, bool AppWindow)[] WindowsBrowsers =
    [
        ("ChromeHTML", "Google Chrome", true),
        ("MSEdgeHTM", "Microsoft Edge", true),
        ("BraveHTML", "Brave", true),
        ("VivaldiHTM", "Vivaldi", true),
        ("ChromiumHTM", "Chromium", true),
        ("FirefoxURL", "Firefox", false),
        ("Opera", "Opera", false),
    ];

    /// <summary>Der Standardbrowser, oder null, wenn er sich nicht bestimmen lässt (dann gilt das alte Verhalten).</summary>
    public static BrowserChoice? Detect()
    {
        try
        {
            if (OperatingSystem.IsMacOS())
            {
                return DetectMac();
            }

            if (OperatingSystem.IsWindows())
            {
                return DetectWindows();
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Xml.XmlException or InvalidOperationException
            or System.ComponentModel.Win32Exception or System.Security.SecurityException)
        {
            // Unbekannt – dann wie bisher.
        }

        return null;
    }

    /// <summary>Öffnet eine Adresse im Standardbrowser (neuer Tab bzw. neues Fenster).</summary>
    public static bool OpenUrl(string url)
    {
        ProcessStartInfo start = OperatingSystem.IsMacOS()
            ? new("open", [url]) { UseShellExecute = false }
            : OperatingSystem.IsWindows()
                ? new(url) { UseShellExecute = true }
                : new("xdg-open", [url]) { UseShellExecute = false };
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

    private static BrowserChoice? DetectMac()
    {
        var plist = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist");
        var bundleId = File.Exists(plist) ? MacHandlerFor(RunPlutil(plist), "https") : null;

        // Nie geändert = Safari.
        bundleId ??= "com.apple.safari";
        if (!MacBrowsers.TryGetValue(bundleId, out var browser))
        {
            return new BrowserChoice(bundleId, null);
        }

        if (browser.Executable is null)
        {
            return new BrowserChoice(browser.Name, null);
        }

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var path = new[] { "/Applications", Path.Combine(home, "Applications") }
            .Select(root => Path.Combine(root, browser.Executable))
            .FirstOrDefault(File.Exists);
        return new BrowserChoice(browser.Name, path);
    }

    private static string RunPlutil(string plist)
    {
        var start = new ProcessStartInfo("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", plist]) { UseShellExecute = false, RedirectStandardOutput = true };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("plutil");
        var xml = process.StandardOutput.ReadToEnd();
        process.WaitForExit(3000);
        return xml;
    }

    /// <summary>Liest aus den LaunchServices-Einstellungen (als XML-Plist) die App für ein URL-Schema.</summary>
    internal static string? MacHandlerFor(string plistXml, string scheme)
    {
        var doc = XDocument.Parse(plistXml);
        foreach (var dict in doc.Descendants("dict"))
        {
            var values = PlistDict(dict);
            if (values.TryGetValue("LSHandlerURLScheme", out var s) && string.Equals(s, scheme, StringComparison.OrdinalIgnoreCase) &&
                values.TryGetValue("LSHandlerRoleAll", out var bundle))
            {
                return bundle;
            }
        }

        return null;
    }

    private static Dictionary<string, string> PlistDict(XElement dict)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var children = dict.Elements().ToList();
        for (var i = 0; i + 1 < children.Count; i++)
        {
            if (children[i].Name == "key" && children[i + 1].Name == "string")
            {
                result[children[i].Value] = children[i + 1].Value;
            }
        }

        return result;
    }

    [SupportedOSPlatform("windows")]
    private static BrowserChoice? DetectWindows()
    {
        using var choice = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice");
        var progId = choice?.GetValue("ProgId") as string;
        if (string.IsNullOrEmpty(progId))
        {
            return null;
        }

        var known = WindowsBrowsers.FirstOrDefault(b => progId.StartsWith(b.Prefix, StringComparison.OrdinalIgnoreCase));
        var name = known.Name ?? progId;
        if (known.Name is null || !known.AppWindow)
        {
            return new BrowserChoice(name, null);
        }

        using var command = Registry.ClassesRoot.OpenSubKey($@"{progId}\shell\open\command");
        var exe = ExecutableFromCommand(command?.GetValue(null) as string);
        return new BrowserChoice(name, exe is not null && File.Exists(exe) ? exe : null);
    }

    /// <summary>"\"C:\…\chrome.exe\" --single-argument %1" → C:\…\chrome.exe</summary>
    internal static string? ExecutableFromCommand(string? command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        command = command.Trim();
        if (command.StartsWith('"'))
        {
            var end = command.IndexOf('"', 1);
            return end > 1 ? command[1..end] : null;
        }

        var exe = command.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
        return exe > 0 ? command[..(exe + 4)] : null;
    }
}
