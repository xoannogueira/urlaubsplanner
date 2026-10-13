using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class WindowFocusTests
{
    private const string Profile = "/Users/anna/Library/Application Support/Urlaubsplanner/browser";

    [Fact]
    public void Findet_den_Browser_mit_dem_App_Profil_und_nicht_seine_Hilfsprozesse()
    {
        var ps = $"""
              101 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
              202 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer) --type=renderer --user-data-dir={Profile}
              303 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --app=http://127.0.0.1:51770/ --user-data-dir={Profile} --no-first-run
            """;

        Assert.Equal(303, WindowFocus.FindBrowserProcess(ps, Profile));
    }

    [Fact]
    public void Ohne_App_Browser_gibt_es_keinen_Treffer()
    {
        const string ps = """
              101 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
              404 /bin/zsh
            """;

        Assert.Null(WindowFocus.FindBrowserProcess(ps, Profile));
    }
}
