using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class AppInstallationTests
{
    private const string App = "/Applications/Urlaubsplanner.app";

    private const string DockPlist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>autohide</key><false/>
          <key>persistent-apps</key>
          <array>
            <dict>
              <key>tile-data</key>
              <dict>
                <key>file-data</key>
                <dict><key>_CFURLString</key><string>file:///System/Applications/Mail.app/</string><key>_CFURLStringType</key><integer>15</integer></dict>
              </dict>
              <key>tile-type</key><string>file-tile</string>
            </dict>
          </array>
          <key>tilesize</key><integer>48</integer>
        </dict>
        </plist>
        """;

    [Fact]
    public void Dock_App_hinzufuegen_und_wieder_entfernen_laesst_den_Rest_unberuehrt()
    {
        Assert.False(Dock.Contains(DockPlist, App));

        var added = Dock.WithApp(DockPlist, App);
        Assert.True(Dock.Contains(added, App));
        Assert.Contains("file:///Applications/Urlaubsplanner.app/", added, StringComparison.Ordinal);
        Assert.Contains("Mail.app", added, StringComparison.Ordinal);
        Assert.Contains("<key>tilesize</key>", added, StringComparison.Ordinal);
        Assert.StartsWith("<?xml", added, StringComparison.Ordinal);

        var removed = Dock.WithoutApp(added, App);
        Assert.False(Dock.Contains(removed, App));
        Assert.Contains("Mail.app", removed, StringComparison.Ordinal);
    }

    [Fact]
    public void Dock_erkennt_Pfade_mit_Leerzeichen()
    {
        const string path = "/Users/anna/Meine Apps/Urlaubsplanner.app";
        Assert.True(Dock.Contains(Dock.WithApp(DockPlist, path), path));
    }

    [Fact]
    public void Shell_Werte_sind_sicher_gequotet()
    {
        Assert.Equal("'/Users/o'\\''brien/x'", AppInstallation.Sh("/Users/o'brien/x"));
        Assert.Equal("'C:\\Users\\o''brien'", AppInstallation.Ps("C:\\Users\\o'brien"));
    }

    [Fact]
    public void Mac_Skript_loescht_App_und_je_nach_Wahl_die_Daten()
    {
        var all = AppInstallation.MacScript(App, "/Users/anna/Library/Application Support/Urlaubsplanner", keepData: false, pid: 42);
        Assert.Contains("kill -0 42", all, StringComparison.Ordinal);
        Assert.Contains("rm -rf '/Applications/Urlaubsplanner.app'", all, StringComparison.Ordinal);
        Assert.Contains("rm -rf '/Users/anna/Library/Application Support/Urlaubsplanner'\n", all, StringComparison.Ordinal);

        var keep = AppInstallation.MacScript(App, "/Users/anna/Library/Application Support/Urlaubsplanner", keepData: true, pid: 42);
        Assert.DoesNotContain("rm -rf '/Users/anna/Library/Application Support/Urlaubsplanner'\n", keep, StringComparison.Ordinal);
        Assert.Contains("Urlaubsplanner/fenster'", keep, StringComparison.Ordinal);
    }

    [Fact]
    public void Windows_Skript_nutzt_den_Deinstaller_und_gibt_die_Datenwahl_weiter()
    {
        var all = AppInstallation.WindowsScript(@"C:\Users\Anna\AppData\Local\Programs\Urlaubsplanner", @"C:\Users\Anna\AppData\Local\Urlaubsplanner", keepData: false, pid: 7);
        Assert.Contains("unins000.exe", all, StringComparison.Ordinal);
        Assert.Contains("'/DELETEDATA'", all, StringComparison.Ordinal);
        Assert.Contains("Wait-Process -Id 7", all, StringComparison.Ordinal);

        var keep = AppInstallation.WindowsScript(@"C:\Apps\Urlaubsplanner", @"C:\Daten\Urlaubsplanner", keepData: true, pid: 7);
        Assert.DoesNotContain("DELETEDATA", keep, StringComparison.Ordinal);
        Assert.DoesNotContain(@"-LiteralPath 'C:\Daten\Urlaubsplanner' -Recurse", keep, StringComparison.Ordinal);
    }
}
