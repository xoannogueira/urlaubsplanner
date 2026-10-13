using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class AppUpdaterTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "urlaubsplanner-update-tests", Guid.NewGuid().ToString("N"));

    public AppUpdaterTests() => Directory.CreateDirectory(_root);

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private string Write(string relative, string content)
    {
        var path = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
        return path;
    }

    [Theory]
    [InlineData("v1.2.0", "1.2.0")]
    [InlineData("1.2", "1.2.0")]
    [InlineData("v2.0.1-beta", "2.0.1")]
    public void Versionen_aus_Tags(string tag, string expected) =>
        Assert.Equal(Version.Parse(expected), AppUpdater.ParseVersion(tag));

    [Fact]
    public void Kein_Tag_ist_keine_Version() => Assert.Null(AppUpdater.ParseVersion("kaputt"));

    [Fact]
    public void Windows_tauscht_Dateien_ueber_Umbenennen_und_raeumt_spaeter_auf()
    {
        Write("install/Urlaubsplanner.exe", "alt");
        Write("install/wwwroot/index.html", "alt");
        Write("neu/Urlaubsplanner/Urlaubsplanner.exe", "neu");
        Write("neu/Urlaubsplanner/wwwroot/index.html", "neu");
        var target = new WindowsFolder(Path.Combine(_root, "install"));

        target.Apply(Path.Combine(_root, "neu"));

        Assert.Equal("neu", File.ReadAllText(Path.Combine(_root, "install/Urlaubsplanner.exe")));
        Assert.Equal("neu", File.ReadAllText(Path.Combine(_root, "install/wwwroot/index.html")));
        Assert.True(File.Exists(Path.Combine(_root, "install/Urlaubsplanner.exe.old")));

        target.Cleanup();
        Assert.False(File.Exists(Path.Combine(_root, "install/Urlaubsplanner.exe.old")));
        Assert.False(Directory.Exists(Path.Combine(_root, "install/wwwroot.old")));
    }

    [Fact]
    public void Mac_tauscht_die_ganze_App_und_macht_Programme_ausfuehrbar()
    {
        Write("Programme/Urlaubsplanner.app/Contents/MacOS/Urlaubsplanner", "alt");
        Write("Programme/Urlaubsplanner.app/Contents/MacOS/arm64/alt-nur-hier.txt", "alt");
        Write("neu/Urlaubsplanner.app/Contents/MacOS/Urlaubsplanner", "neu");
        Write("neu/Urlaubsplanner.app/Contents/MacOS/arm64/Urlaubsplanner.Api", "neu");
        var bundle = Path.Combine(_root, "Programme/Urlaubsplanner.app");
        var target = new MacBundle(bundle);

        target.Apply(Path.Combine(_root, "neu"));

        Assert.Equal("neu", File.ReadAllText(Path.Combine(bundle, "Contents/MacOS/Urlaubsplanner")));
        Assert.False(File.Exists(Path.Combine(bundle, "Contents/MacOS/arm64/alt-nur-hier.txt")));
        Assert.False(Directory.Exists(Path.Combine(_root, "Programme/.Urlaubsplanner-alt.app")));
        if (!OperatingSystem.IsWindows())
        {
            Assert.True(File.GetUnixFileMode(Path.Combine(bundle, "Contents/MacOS/arm64/Urlaubsplanner.Api")).HasFlag(UnixFileMode.UserExecute));
        }
    }

    [Fact]
    public void App_im_Download_Ordner_kann_sich_nicht_selbst_aktualisieren()
    {
        var target = new MacBundle("/private/var/folders/x/AppTranslocation/ABC/d/Urlaubsplanner.app");
        Assert.Contains("Programme", target.CannotUpdateReason, StringComparison.Ordinal);
    }

    private sealed class Handler(Func<Uri, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<Uri> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request.RequestUri!);
            return Task.FromResult(respond(request.RequestUri!));
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            var http = new HttpClient(handler, disposeHandler: false);
            AppUpdater.ConfigureClient(http, new UpdateOptions { ApiBaseUrl = "https://api.github.test/" });
            return http;
        }
    }

    private sealed class NoLifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;

        public CancellationToken ApplicationStopping => CancellationToken.None;

        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication()
        {
        }
    }

    private static byte[] WindowsZip()
    {
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in new[] { ("Urlaubsplanner/Urlaubsplanner.exe", "neu"), ("Urlaubsplanner/wwwroot/index.html", "neu"), ("ANLEITUNG.md", "…") })
            {
                using var writer = new StreamWriter(zip.CreateEntry(name).Open());
                writer.Write(content);
            }
        }

        return buffer.ToArray();
    }

    private AppUpdater Updater(Handler handler) =>
        new(new Factory(handler), new AppPaths(true, Path.Combine(_root, "daten")), Options.Create(new UpdateOptions()), new NoLifetime(), NullLogger<AppUpdater>.Instance);

    [Fact]
    public async Task Neue_Version_wird_geladen_geprueft_und_beim_Beenden_installiert()
    {
        var zip = WindowsZip();
        var digest = "sha256:" + Convert.ToHexStringLower(SHA256.HashData(zip));
        var handler = new Handler(uri => uri.AbsolutePath.EndsWith("/releases/latest", StringComparison.Ordinal)
            ? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    $$"""{ "tag_name": "v99.1.0", "assets": [ { "name": "Urlaubsplanner-Mac.zip", "browser_download_url": "https://dl.test/mac.zip", "size": 1 }, { "name": "Urlaubsplanner-Windows.zip", "browser_download_url": "https://dl.test/win.zip", "size": {{zip.Length}}, "digest": "{{digest}}" } ] }""",
                    Encoding.UTF8,
                    "application/json"),
            }
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(zip) });
        Write("install/Urlaubsplanner.exe", "alt");
        var target = new WindowsFolder(Path.Combine(_root, "install"));
        var updater = Updater(handler);

        await updater.CheckAndDownloadAsync(target, CancellationToken.None);

        Assert.Equal(UpdateState.Ready, updater.Status.State);
        Assert.Equal("99.1.0", updater.Status.Available);
        Assert.Contains(handler.Calls, u => u.AbsolutePath == "/repos/xoannogueira/urlaubsplanner/releases/latest");
        Assert.Contains(handler.Calls, u => u.Host == "dl.test" && u.AbsolutePath == "/win.zip");

        Assert.True(AppUpdater.ApplyStaged(target, new AppPaths(true, Path.Combine(_root, "daten")), NullLogger.Instance));
        Assert.Equal("neu", File.ReadAllText(Path.Combine(_root, "install/Urlaubsplanner.exe")));
        Assert.False(Directory.Exists(Path.Combine(_root, "daten/update")));
    }

    [Fact]
    public async Task Beschaedigter_Download_wird_nicht_installiert()
    {
        var zip = WindowsZip();
        var handler = new Handler(uri => uri.AbsolutePath.EndsWith("/releases/latest", StringComparison.Ordinal)
            ? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{ "tag_name": "v99.1.0", "assets": [ { "name": "Urlaubsplanner-Windows.zip", "browser_download_url": "https://dl.test/win.zip", "size": 10, "digest": "sha256:0000" } ] }""",
                    Encoding.UTF8,
                    "application/json"),
            }
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(zip) });
        var updater = Updater(handler);

        await Assert.ThrowsAsync<InvalidDataException>(() => updater.CheckAndDownloadAsync(new WindowsFolder(Path.Combine(_root, "install")), CancellationToken.None));
        Assert.False(File.Exists(Path.Combine(_root, "daten/update/bereit.json")));
    }

    [Fact]
    public async Task Gleiche_oder_aeltere_Version_heisst_aktuell()
    {
        var handler = new Handler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{ "tag_name": "v0.0.1", "assets": [] }""", Encoding.UTF8, "application/json"),
        });
        var updater = Updater(handler);

        await updater.CheckAndDownloadAsync(new WindowsFolder(_root), CancellationToken.None);

        Assert.Equal(UpdateState.UpToDate, updater.Status.State);
        Assert.Single(handler.Calls);
    }
}
