using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Holt das schon offene App-Fenster nach vorne (zweiter Klick aufs Icon). Ohne Zusatzrechte:
/// Windows sucht das Chrome/Edge-Fenster mit dem Titel „Urlaubsplanner“, macOS aktiviert die Browser-Instanz
/// mit dem eigenen Profil. Klappt das nicht (z. B. Fenster im Dock minimiert), öffnet der Aufrufer ein neues Fenster.
/// </summary>
internal enum FocusResult
{
    /// <summary>Kein sichtbares App-Fenster gefunden (z. B. im Dock minimiert oder Browser ohne App-Modus).</summary>
    NotFound,

    /// <summary>Fenster gefunden, aber das System hat das Nach-vorne-Holen abgelehnt.</summary>
    Refused,

    /// <summary>Fenster ist vorne.</summary>
    Done,
}

internal static class WindowFocus
{
    /// <summary>Fenstertitel der App (siehe frontend/index.html).</summary>
    public const string WindowTitle = "Urlaubsplanner";

    /// <summary>Versucht, das offene Fenster nach vorne zu holen.</summary>
    public static FocusResult TryBringToFront(AppPaths paths)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                return Win.TryBringToFront();
            }

            if (OperatingSystem.IsMacOS())
            {
                return FindBrowserProcess(paths) is { } pid ? Mac.TryBringToFront(pid) : FocusResult.NotFound;
            }
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException or InvalidOperationException or System.ComponentModel.Win32Exception or IOException)
        {
            // Dann eben ein neues Fenster.
        }

        return FocusResult.NotFound;
    }

    /// <summary>
    /// Beendet den Browser mit dem App-Profil. Auf dem Mac laufen Browser ohne Fenster weiter (Symbol bleibt im Dock) –
    /// nach dem Schließen der App soll aber nichts übrig bleiben.
    /// </summary>
    public static void CloseBrowser(AppPaths paths)
    {
        if (!OperatingSystem.IsMacOS() || FindBrowserProcess(paths) is not { } pid)
        {
            return;
        }

        try
        {
            // SIGTERM: Der Browser beendet sich sauber (kein „nicht richtig beendet“-Hinweis beim nächsten Start).
            using var kill = Process.Start(new ProcessStartInfo("/bin/kill", ["-TERM", pid.ToString(CultureInfo.InvariantCulture)]) { UseShellExecute = false });
            kill?.WaitForExit(2000);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            // Nicht schlimm.
        }
    }

    /// <summary>Hauptprozess des Browsers, der mit dem App-Profil läuft (nicht die Hilfsprozesse).</summary>
    internal static int? FindBrowserProcess(AppPaths paths)
    {
        var start = new ProcessStartInfo("/bin/ps", ["-axww", "-o", "pid=,args="]) { UseShellExecute = false, RedirectStandardOutput = true };
        try
        {
            using var ps = Process.Start(start);
            if (ps is null)
            {
                return null;
            }

            var output = ps.StandardOutput.ReadToEnd();
            ps.WaitForExit(2000);
            return FindBrowserProcess(output, paths.BrowserProfile);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>Sucht in einer <c>ps</c>-Ausgabe (Zeilen „PID Befehl“) den Browser-Hauptprozess mit diesem Profil.</summary>
    internal static int? FindBrowserProcess(string psOutput, string profile)
    {
        var marker = $"--user-data-dir={profile}";
        foreach (var line in psOutput.Split('\n'))
        {
            var trimmed = line.Trim();
            var space = trimmed.IndexOf(' ', StringComparison.Ordinal);
            if (space <= 0)
            {
                continue;
            }

            var args = trimmed[(space + 1)..];
            if (args.Contains(marker, StringComparison.Ordinal) && !args.Contains("--type=", StringComparison.Ordinal) &&
                int.TryParse(trimmed[..space], NumberStyles.None, CultureInfo.InvariantCulture, out var pid))
            {
                return pid;
            }
        }

        return null;
    }

    private static class Win
    {
        private const int SwRestore = 9;

        public static FocusResult TryBringToFront()
        {
            // Chrome, Edge und Brave nennen ihre Fensterklasse alle so; der Titel ist der Seitentitel.
            var window = FindWindowW("Chrome_WidgetWin_1", WindowTitle);
            if (window == IntPtr.Zero)
            {
                return FocusResult.NotFound;
            }

            if (IsIconic(window))
            {
                ShowWindow(window, SwRestore);
            }

            // Klappt, weil dieser Prozess gerade per Klick gestartet wurde und deshalb nach vorne holen darf.
            return SetForegroundWindow(window) ? FocusResult.Done : FocusResult.Refused;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr FindWindowW(string className, string windowName);

        [DllImport("user32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsIconic(IntPtr window);

        [DllImport("user32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShowWindow(IntPtr window, int command);

        [DllImport("user32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr window);
    }

    private static class Mac
    {
        private const string ObjC = "/usr/lib/libobjc.A.dylib";
        private const string CoreFoundation = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
        private const string CoreGraphics = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
        private const string AppKit = "/System/Library/Frameworks/AppKit.framework/AppKit";

        private const uint OnScreenOnly = 1;
        private const uint ExcludeDesktopElements = 16;
        private const nint NumberSInt32 = 3;
        private const uint Utf8 = 0x08000100;

        // NSApplicationActivateAllWindows | NSApplicationActivateIgnoringOtherApps
        private const nuint ActivateOptions = 3;

        public static FocusResult TryBringToFront(int pid)
        {
            // Nur sichtbare Fenster lassen sich nach vorne holen. Ein im Dock minimiertes Fenster würde unsichtbar bleiben –
            // dann lieber ein neues öffnen.
            if (!WindowOwners().Contains(pid))
            {
                return FocusResult.NotFound;
            }

            NativeLibrary.Load(AppKit);
            var app = SendPid(objc_getClass("NSRunningApplication"), sel_registerName("runningApplicationWithProcessIdentifier:"), pid);
            if (app == IntPtr.Zero)
            {
                return FocusResult.NotFound;
            }

            SendOptions(app, sel_registerName("activateWithOptions:"), ActivateOptions);

            // macOS kann die Bitte ablehnen – prüfen, ob das Fenster jetzt wirklich vorne ist.
            for (var i = 0; i < 10; i++)
            {
                Thread.Sleep(100);
                if (WindowOwners().FirstOrDefault() == pid)
                {
                    return FocusResult.Done;
                }
            }

            return FocusResult.Refused;
        }

        /// <summary>Besitzer der sichtbaren normalen Fenster, vorderstes zuerst (braucht keine Bildschirmaufnahme-Freigabe).</summary>
        private static List<int> WindowOwners()
        {
            var owners = new List<int>();
            var list = CGWindowListCopyWindowInfo(OnScreenOnly | ExcludeDesktopElements, 0);
            if (list == IntPtr.Zero)
            {
                return owners;
            }

            var pidKey = CFStringCreateWithCString(IntPtr.Zero, "kCGWindowOwnerPID", Utf8);
            var layerKey = CFStringCreateWithCString(IntPtr.Zero, "kCGWindowLayer", Utf8);
            try
            {
                var count = CFArrayGetCount(list);
                for (nint i = 0; i < count; i++)
                {
                    var window = CFArrayGetValueAtIndex(list, i);
                    if (ReadInt(window, layerKey) == 0 && ReadInt(window, pidKey) is { } owner)
                    {
                        owners.Add(owner);
                    }
                }
            }
            finally
            {
                CFRelease(pidKey);
                CFRelease(layerKey);
                CFRelease(list);
            }

            return owners;
        }

        private static int? ReadInt(IntPtr dictionary, IntPtr key)
        {
            var number = CFDictionaryGetValue(dictionary, key);
            return number != IntPtr.Zero && CFNumberGetValue(number, NumberSInt32, out var value) != 0 ? value : null;
        }

        [DllImport(ObjC)]
        private static extern IntPtr objc_getClass([MarshalAs(UnmanagedType.LPUTF8Str)] string name);

        [DllImport(ObjC)]
        private static extern IntPtr sel_registerName([MarshalAs(UnmanagedType.LPUTF8Str)] string name);

        [DllImport(ObjC, EntryPoint = "objc_msgSend")]
        private static extern IntPtr SendPid(IntPtr receiver, IntPtr selector, int pid);

        [DllImport(ObjC, EntryPoint = "objc_msgSend")]
        private static extern byte SendOptions(IntPtr receiver, IntPtr selector, nuint options);

        [DllImport(CoreGraphics)]
        private static extern IntPtr CGWindowListCopyWindowInfo(uint option, uint relativeToWindow);

        [DllImport(CoreFoundation)]
        private static extern nint CFArrayGetCount(IntPtr array);

        [DllImport(CoreFoundation)]
        private static extern IntPtr CFArrayGetValueAtIndex(IntPtr array, nint index);

        [DllImport(CoreFoundation)]
        private static extern IntPtr CFDictionaryGetValue(IntPtr dictionary, IntPtr key);

        [DllImport(CoreFoundation)]
        private static extern byte CFNumberGetValue(IntPtr number, nint type, out int value);

        [DllImport(CoreFoundation)]
        private static extern IntPtr CFStringCreateWithCString(IntPtr allocator, [MarshalAs(UnmanagedType.LPUTF8Str)] string value, uint encoding);

        [DllImport(CoreFoundation)]
        private static extern void CFRelease(IntPtr value);
    }
}
