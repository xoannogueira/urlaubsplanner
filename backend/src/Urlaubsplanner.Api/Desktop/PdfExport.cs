using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Speichert den Reiseplan als PDF im Downloads-Ordner (genau eine Datei, kein Umweg über den Browser-Download)
/// und öffnet sie im Standard-PDF-Programm. Eine ältere Fassung derselben Reise wird ersetzt; ist sie gerade
/// geöffnet und gesperrt (Windows), bekommt die neue eine Nummer.
/// </summary>
public static partial class PdfExport
{
    /// <summary>Speichert und öffnet die PDF. Gibt den vollständigen Pfad zurück.</summary>
    public static string SaveAndOpen(byte[] pdf, string title)
    {
        ArgumentNullException.ThrowIfNull(pdf);
        var folder = DownloadsFolder();
        Directory.CreateDirectory(folder);
        var path = Write(folder, FileName(title), pdf);
        Open(path);
        return path;
    }

    /// <summary>„Portugal: Rundreise 2027“ → „Reiseplan Portugal Rundreise 2027.pdf“ (auf allen Systemen gültig).</summary>
    internal static string FileName(string title)
    {
        var invalid = new HashSet<char>(Path.GetInvalidFileNameChars()) { '/', '\\', ':', '*', '?', '"', '<', '>', '|' };
        var clean = new StringBuilder();
        foreach (var c in title.Trim())
        {
            clean.Append(invalid.Contains(c) || char.IsControl(c) ? ' ' : c);
        }

        var name = SpacesRegex().Replace(clean.ToString(), " ").Trim(' ', '.');
        if (name.Length > 80)
        {
            name = name[..80].TrimEnd(' ', '.');
        }

        return $"Reiseplan {(name.Length > 0 ? name : "Reise")}.pdf";
    }

    /// <summary>Schreibt die Datei; ist der Name gesperrt (offen in einem PDF-Programm), mit „(2)“, „(3)“ …</summary>
    internal static string Write(string folder, string fileName, byte[] pdf)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName);
        for (var n = 1; n <= 50; n++)
        {
            var path = Path.Combine(folder, n == 1 ? fileName : $"{stem} ({n}).pdf");
            try
            {
                File.WriteAllBytes(path, pdf);
                return path;
            }
            catch (IOException) when (n < 50)
            {
                // Gesperrt – nächsten Namen versuchen.
            }
        }

        throw new IOException("Die PDF konnte nicht gespeichert werden.");
    }

    /// <summary>Downloads-Ordner der Person (Windows: auch wenn er verschoben wurde).</summary>
    public static string DownloadsFolder()
    {
        if (OperatingSystem.IsWindows() && KnownDownloads() is { } known)
        {
            return known;
        }

        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
    }

    private static void Open(string path)
    {
        ProcessStartInfo start = OperatingSystem.IsMacOS()
            ? new("open", [path]) { UseShellExecute = false }
            : OperatingSystem.IsWindows()
                ? new(path) { UseShellExecute = true }
                : new("xdg-open", [path]) { UseShellExecute = false };
        try
        {
            using var _ = Process.Start(start);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or FileNotFoundException)
        {
            // Gespeichert ist sie trotzdem – die App zeigt den Pfad an.
        }
    }

    [SupportedOSPlatform("windows")]
    private static string? KnownDownloads()
    {
        var downloads = new Guid("374DE290-123F-4565-9164-39C4925E467B");
        if (SHGetKnownFolderPath(downloads, 0, IntPtr.Zero, out var pointer) != 0)
        {
            return null;
        }

        try
        {
            return Marshal.PtrToStringUni(pointer);
        }
        finally
        {
            Marshal.FreeCoTaskMem(pointer);
        }
    }

    [DllImport("shell32.dll", ExactSpelling = true)]
    private static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid folderId, uint flags, IntPtr token, out IntPtr path);

    [System.Text.RegularExpressions.GeneratedRegex(@"\s+")]
    private static partial System.Text.RegularExpressions.Regex SpacesRegex();
}
