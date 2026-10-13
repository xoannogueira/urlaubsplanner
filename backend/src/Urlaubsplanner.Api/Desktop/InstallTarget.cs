using System.Diagnostics;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Wo die Desktop-App liegt und wie sie sich selbst austauscht. Mac: die ganze <c>Urlaubsplanner.app</c> wird gegen
/// die neue getauscht. Windows: laufende Dateien lassen sich nicht überschreiben, aber umbenennen – alte Dateien
/// bekommen „.old“ und werden beim nächsten Start gelöscht.
/// </summary>
public abstract class InstallTarget
{
    /// <summary>Name der Datei im GitHub-Release, z. B. „Urlaubsplanner-Mac.zip“.</summary>
    public abstract string AssetName { get; }

    /// <summary>Warum sich die App hier nicht selbst aktualisieren kann (für den Hinweis in der App); null = kann sie.</summary>
    public abstract string? CannotUpdateReason { get; }

    /// <summary>Ersetzt die installierte App durch die entpackte neue Version (Wurzel des entpackten Zips).</summary>
    public abstract void Apply(string extractedRoot);

    /// <summary>Startet die (neue) App erneut.</summary>
    public abstract void Relaunch(IReadOnlyList<string> args);

    /// <summary>Reste eines früheren Updates entfernen.</summary>
    public abstract void Cleanup();

    /// <summary>Die laufende App, oder null, wenn sie nicht als gepackte Desktop-App läuft (z. B. beim Entwickeln).</summary>
    public static InstallTarget? Detect(string baseDirectory)
    {
        if (OperatingSystem.IsMacOS())
        {
            var dir = new DirectoryInfo(baseDirectory);
            while (dir is not null && !dir.Name.EndsWith(".app", StringComparison.OrdinalIgnoreCase))
            {
                dir = dir.Parent;
            }

            return dir is null ? null : new MacBundle(dir.FullName);
        }

        if (OperatingSystem.IsWindows() && File.Exists(Path.Combine(baseDirectory, "Urlaubsplanner.exe")))
        {
            return new WindowsFolder(Path.TrimEndingDirectorySeparator(baseDirectory));
        }

        return null;
    }

    internal static void CopyDirectory(string source, string target)
    {
        Directory.CreateDirectory(target);
        foreach (var file in Directory.EnumerateFiles(source))
        {
            File.Copy(file, Path.Combine(target, Path.GetFileName(file)), overwrite: true);
        }

        foreach (var dir in Directory.EnumerateDirectories(source))
        {
            CopyDirectory(dir, Path.Combine(target, Path.GetFileName(dir)));
        }
    }

    internal static bool CanWrite(string directory)
    {
        try
        {
            var probe = Path.Combine(directory, $".urlaubsplanner-test-{Environment.ProcessId}");
            File.WriteAllText(probe, string.Empty);
            File.Delete(probe);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    internal static void TryDelete(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
            else if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Beim nächsten Start nochmal versuchen.
        }
    }
}

/// <summary>Mac: <c>…/Urlaubsplanner.app</c>.</summary>
public sealed class MacBundle(string bundlePath) : InstallTarget
{
    public string BundlePath { get; } = bundlePath;

    private string Parent => Path.GetDirectoryName(BundlePath)!;

    private string Incoming => Path.Combine(Parent, ".Urlaubsplanner-neu.app");

    private string Previous => Path.Combine(Parent, ".Urlaubsplanner-alt.app");

    public override string AssetName => "Urlaubsplanner-Mac.zip";

    public override string? CannotUpdateReason =>
        BundlePath.Contains("/AppTranslocation/", StringComparison.Ordinal)
            ? "Die App läuft direkt aus dem Download. Zieh „Urlaubsplanner“ in den Ordner „Programme“ und öffne sie von dort – dann aktualisiert sie sich automatisch."
            : CanWrite(Parent) ? null : $"Keine Schreibrechte im Ordner {Parent} – deshalb kann sich die App nicht selbst aktualisieren.";

    public override void Apply(string extractedRoot)
    {
        var fresh = Path.Combine(extractedRoot, "Urlaubsplanner.app");
        if (!Directory.Exists(Path.Combine(fresh, "Contents", "MacOS")))
        {
            throw new InvalidDataException("Im Update fehlt Urlaubsplanner.app.");
        }

        // Erst neben die alte App kopieren (gleicher Datenträger), dann in zwei schnellen Umbenennungen tauschen.
        TryDelete(Incoming);
        TryDelete(Previous);
        CopyDirectory(fresh, Incoming);
        MarkExecutable(Incoming);
        Directory.Move(BundlePath, Previous);
        try
        {
            Directory.Move(Incoming, BundlePath);
        }
        catch
        {
            Directory.Move(Previous, BundlePath);
            throw;
        }

        TryDelete(Previous);
    }

    public override void Relaunch(IReadOnlyList<string> args)
    {
        var start = new ProcessStartInfo("open") { UseShellExecute = false };
        start.ArgumentList.Add("-n");
        start.ArgumentList.Add(BundlePath);
        if (args.Count > 0)
        {
            start.ArgumentList.Add("--args");
            foreach (var arg in args)
            {
                start.ArgumentList.Add(arg);
            }
        }

        using var _ = Process.Start(start);
    }

    public override void Cleanup()
    {
        TryDelete(Incoming);
        TryDelete(Previous);
    }

    /// <summary>Beim Kopieren/Entpacken können Ausführrechte verloren gehen – Startprogramm und Server wieder ausführbar machen.</summary>
    private static void MarkExecutable(string bundle)
    {
        if (!OperatingSystem.IsMacOS() && !OperatingSystem.IsLinux())
        {
            return;
        }

        var macos = Path.Combine(bundle, "Contents", "MacOS");
        var executables = new[] { Path.Combine(macos, "Urlaubsplanner") }
            .Concat(Directory.EnumerateFiles(macos, "Urlaubsplanner.Api", SearchOption.AllDirectories));
        foreach (var file in executables.Where(File.Exists))
        {
            File.SetUnixFileMode(file, File.GetUnixFileMode(file) | UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute);
        }
    }
}

/// <summary>Windows: Ordner mit <c>Urlaubsplanner.exe</c>.</summary>
public sealed class WindowsFolder(string installDirectory) : InstallTarget
{
    public string InstallDirectory { get; } = installDirectory;

    public override string AssetName => "Urlaubsplanner-Windows.zip";

    public override string? CannotUpdateReason =>
        CanWrite(InstallDirectory) ? null : $"Keine Schreibrechte im Ordner {InstallDirectory} – leg den Ordner „Urlaubsplanner“ z. B. unter „Dokumente“ ab.";

    public override void Apply(string extractedRoot)
    {
        var fresh = Path.Combine(extractedRoot, "Urlaubsplanner");
        if (!File.Exists(Path.Combine(fresh, "Urlaubsplanner.exe")))
        {
            throw new InvalidDataException("Im Update fehlt Urlaubsplanner.exe.");
        }

        // Laufende Dateien (die .exe) lassen sich unter Windows nicht überschreiben, aber umbenennen.
        foreach (var source in Directory.EnumerateFileSystemEntries(fresh))
        {
            var target = Path.Combine(InstallDirectory, Path.GetFileName(source));
            var old = target + ".old";
            TryDelete(old);
            if (Directory.Exists(target))
            {
                Directory.Move(target, old);
            }
            else if (File.Exists(target))
            {
                File.Move(target, old);
            }

            if (Directory.Exists(source))
            {
                CopyDirectory(source, target);
            }
            else
            {
                File.Copy(source, target, overwrite: true);
            }
        }
    }

    public override void Relaunch(IReadOnlyList<string> args)
    {
        var start = new ProcessStartInfo(Path.Combine(InstallDirectory, "Urlaubsplanner.exe")) { UseShellExecute = false, WorkingDirectory = InstallDirectory };
        foreach (var arg in args)
        {
            start.ArgumentList.Add(arg);
        }

        using var _ = Process.Start(start);
    }

    public override void Cleanup()
    {
        foreach (var old in Directory.EnumerateFileSystemEntries(InstallDirectory, "*.old"))
        {
            TryDelete(old);
        }
    }
}
