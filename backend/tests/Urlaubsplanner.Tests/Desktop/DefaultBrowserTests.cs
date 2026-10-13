using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class DefaultBrowserTests
{
    private const string LaunchServices = """
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
          <key>LSHandlers</key>
          <array>
            <dict>
              <key>LSHandlerContentType</key><string>public.html</string>
              <key>LSHandlerRoleAll</key><string>com.apple.safari</string>
            </dict>
            <dict>
              <key>LSHandlerPreferredVersions</key>
              <dict><key>LSHandlerRoleAll</key><string>-</string></dict>
              <key>LSHandlerRoleAll</key><string>com.google.chrome</string>
              <key>LSHandlerURLScheme</key><string>https</string>
            </dict>
          </array>
        </dict>
        </plist>
        """;

    [Fact]
    public void Mac_Standardbrowser_fuer_https_aus_den_LaunchServices()
    {
        Assert.Equal("com.google.chrome", DefaultBrowser.MacHandlerFor(LaunchServices, "https"));
        Assert.Null(DefaultBrowser.MacHandlerFor(LaunchServices, "ftp"));
    }

    [Fact]
    public void Mac_nur_Chromium_Browser_koennen_ein_App_Fenster()
    {
        Assert.NotNull(DefaultBrowser.MacBrowsers["com.google.chrome"].Executable);
        Assert.Null(DefaultBrowser.MacBrowsers["com.apple.safari"].Executable);
        Assert.Null(DefaultBrowser.MacBrowsers["org.mozilla.firefox"].Executable);
    }

    [Theory]
    [InlineData("\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" --single-argument %1", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")]
    [InlineData("C:\\Browser\\brave.exe -- \"%1\"", "C:\\Browser\\brave.exe")]
    [InlineData("", null)]
    public void Windows_Programmdatei_aus_dem_Oeffnen_Befehl(string command, string? expected)
    {
        Assert.Equal(expected, DefaultBrowser.ExecutableFromCommand(command));
    }
}
