using System.IO.Compression;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Urlaubsplanner.Api.Desktop;

public sealed class UpdateOptions
{
    public const string Section = "Updates";

    /// <summary>Automatische Updates der Desktop-App (beim Entwickeln ohnehin aus).</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>GitHub-Repository mit den Releases.</summary>
    public string Repository { get; set; } = "xoannogueira/urlaubsplanner";

    public string ApiBaseUrl { get; set; } = "https://api.github.com/";
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UpdateState
{
    /// <summary>Keine Updates (beim Entwickeln, abgeschaltet oder Ort ohne Schreibrechte – dann steht der Grund in Hint).</summary>
    Off,
    Checking,
    UpToDate,
    Downloading,

    /// <summary>Neue Version liegt bereit und wird beim Schließen (oder „Jetzt neu starten“) installiert.</summary>
    Ready,
    Failed,
}

/// <param name="Hint">Für Menschen: warum es keine Updates gibt bzw. was schiefging.</param>
/// <param name="CheckedAt">Wann zuletzt erfolgreich nachgesehen wurde.</param>
public sealed record UpdateStatus(string Current, string? Available, UpdateState State, int? Progress, string? Hint, DateTimeOffset? CheckedAt = null);

/// <summary>
/// Automatische Updates der Desktop-App: prüft beim Start das neueste GitHub-Release, lädt die passende Zip im
/// Hintergrund und entpackt sie in den Datenordner. Installiert wird beim Beenden der App (Fenster schließen) –
/// beim nächsten Start läuft also die neue Version. „Jetzt neu starten“ installiert sofort und startet die App neu.
/// </summary>
public sealed partial class AppUpdater(
    IHttpClientFactory httpFactory,
    AppPaths paths,
    IOptions<UpdateOptions> options,
    IHostApplicationLifetime lifetime,
    ILogger<AppUpdater> logger) : BackgroundService
{
    public const string HttpClientName = "updates";

    /// <summary>Bleibt die App lange offen, wird in diesem Abstand erneut nachgesehen.</summary>
    public static readonly TimeSpan RecheckInterval = TimeSpan.FromHours(6);

    private readonly Lock _gate = new();
    private readonly SemaphoreSlim _checkNow = new(0, 1);
    private DateTimeOffset? _checkedAt;
    private readonly InstallTarget? _target = paths.Desktop ? InstallTarget.Detect(AppContext.BaseDirectory) : null;
    private UpdateStatus _status = new(CurrentVersionText, null, UpdateState.Off, null, null);

    public static Version CurrentVersion { get; } = Normalize(typeof(AppUpdater).Assembly.GetName().Version ?? new Version(0, 0, 0));

    public static string CurrentVersionText =>
        typeof(AppUpdater).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0]
        ?? CurrentVersion.ToString(3);

    public UpdateStatus Status
    {
        get
        {
            lock (_gate)
            {
                return _status;
            }
        }
    }

    /// <summary>Nach dem Beenden neu starten (Knopf „Jetzt neu starten“).</summary>
    public bool RestartRequested { get; private set; }

    public bool RequestRestart()
    {
        if (Status.State != UpdateState.Ready)
        {
            return false;
        }

        RestartRequested = true;
        lifetime.StopApplication();
        return true;
    }

    /// <summary>„Jetzt nach Updates suchen“: false, wenn gerade gesucht/geladen wird, ein Update bereitliegt oder Updates aus sind.</summary>
    public bool RequestCheck()
    {
        var state = Status.State;
        if (_target is null || state is UpdateState.Off or UpdateState.Checking or UpdateState.Downloading or UpdateState.Ready)
        {
            return false;
        }

        try
        {
            _checkNow.Release();
        }
        catch (SemaphoreFullException)
        {
            // Läuft schon an.
        }

        return true;
    }

    public override void Dispose()
    {
        _checkNow.Dispose();
        base.Dispose();
    }

    private string UpdateDirectory => Path.Combine(paths.DataDirectory, "update");

    private string ExtractedDirectory => Path.Combine(UpdateDirectory, "neu");

    private string ReadyFile => Path.Combine(UpdateDirectory, "bereit.json");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_target is null || !options.Value.Enabled)
        {
            return;
        }

        _target.Cleanup();
        if (_target.CannotUpdateReason is { } reason)
        {
            Set(UpdateState.Off, null, null, reason);
            return;
        }

        try
        {
            // Erst die App in Ruhe starten lassen.
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken).ConfigureAwait(false);
            // Beim Start nachsehen, danach alle paar Stunden oder auf Knopfdruck – bis ein Update bereitliegt.
            while (!stoppingToken.IsCancellationRequested)
            {
                await CheckOnceAsync(_target, stoppingToken).ConfigureAwait(false);
                if (Status.State == UpdateState.Ready)
                {
                    return;
                }

                await _checkNow.WaitAsync(RecheckInterval, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // App wird beendet.
        }
    }

    private async Task CheckOnceAsync(InstallTarget target, CancellationToken stoppingToken)
    {
        try
        {
            await CheckAndDownloadAsync(target, stoppingToken).ConfigureAwait(false);
        }
        catch (Exception e) when (e is HttpRequestException or IOException or InvalidDataException or JsonException or UnauthorizedAccessException
            or TaskCanceledException && !stoppingToken.IsCancellationRequested)
        {
            LogUpdateFailed(e);
            Set(UpdateState.Failed, Status.Available, null, "Die Suche nach Updates hat nicht geklappt – „Nochmal versuchen“ oder später automatisch.");
        }
    }

    internal async Task CheckAndDownloadAsync(InstallTarget target, CancellationToken ct)
    {
        Set(UpdateState.Checking, null, null, null);
        using var http = httpFactory.CreateClient(HttpClientName);
        var release = await http.GetFromJsonAsync<Release>(new Uri($"repos/{options.Value.Repository}/releases/latest", UriKind.Relative), ct).ConfigureAwait(false);
        var latest = ParseVersion(release?.TagName);
        lock (_gate)
        {
            _checkedAt = DateTimeOffset.UtcNow;
        }

        if (release is null || latest is null || latest <= CurrentVersion)
        {
            Set(UpdateState.UpToDate, latest?.ToString(3), null, null);
            return;
        }

        var asset = release.Assets?.FirstOrDefault(a => string.Equals(a.Name, target.AssetName, StringComparison.OrdinalIgnoreCase));
        if (asset?.BrowserDownloadUrl is null)
        {
            Set(UpdateState.UpToDate, latest.ToString(3), null, null);
            return;
        }

        if (ReadStagedVersion() == latest)
        {
            Set(UpdateState.Ready, latest.ToString(3), 100, null);
            return;
        }

        Set(UpdateState.Downloading, latest.ToString(3), 0, null);
        Directory.CreateDirectory(UpdateDirectory);
        var zip = Path.Combine(UpdateDirectory, "download.zip");
        await DownloadAsync(http, new Uri(asset.BrowserDownloadUrl), zip, asset.Size, latest, ct).ConfigureAwait(false);
        VerifyDigest(zip, asset.Digest);

        InstallTarget.TryDelete(ExtractedDirectory);
        await Task.Run(() => ZipFile.ExtractToDirectory(zip, ExtractedDirectory, overwriteFiles: true), ct).ConfigureAwait(false);
        File.Delete(zip);
        var text = latest.ToString(3);
        await File.WriteAllTextAsync(ReadyFile, JsonSerializer.Serialize(new Staged(text)), ct).ConfigureAwait(false);
        LogReady(text);
        Set(UpdateState.Ready, text, 100, null);
    }

    private async Task DownloadAsync(HttpClient http, Uri url, string file, long size, Version version, CancellationToken ct)
    {
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var total = response.Content.Headers.ContentLength ?? size;
        await using var source = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        await using var target = File.Create(file);
        var buffer = new byte[81920];
        long done = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read), ct).ConfigureAwait(false);
            done += read;
            if (total > 0)
            {
                Set(UpdateState.Downloading, version.ToString(3), (int)(done * 100 / total), null);
            }
        }
    }

    /// <summary>GitHub nennt zu jeder Datei eine SHA-256-Prüfsumme – stimmt sie nicht, wird nichts installiert.</summary>
    private static void VerifyDigest(string file, string? digest)
    {
        if (digest is null || !digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        using var stream = File.OpenRead(file);
        var actual = Convert.ToHexStringLower(SHA256.HashData(stream));
        if (!string.Equals(actual, digest["sha256:".Length..], StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).");
        }
    }

    /// <summary>
    /// Beim Beenden: bereitliegendes Update installieren. Gibt true zurück, wenn installiert wurde.
    /// </summary>
    public bool ApplyStaged() => ApplyStaged(_target, paths, logger);

    /// <summary>
    /// Auch beim Start aufrufbar (falls die App beim letzten Mal nicht sauber beendet wurde): installiert ein
    /// bereitliegendes, neueres Update. Fehler werden protokolliert, die alte Version läuft dann einfach weiter.
    /// </summary>
    public static bool ApplyStaged(InstallTarget? target, AppPaths paths, ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(paths);
        var updateDir = Path.Combine(paths.DataDirectory, "update");
        var ready = Path.Combine(updateDir, "bereit.json");
        if (target is null || !File.Exists(ready))
        {
            return false;
        }

        try
        {
            var staged = JsonSerializer.Deserialize<Staged>(File.ReadAllText(ready));
            if (ParseVersion(staged?.Version) is not { } version || version <= CurrentVersion)
            {
                InstallTarget.TryDelete(updateDir);
                return false;
            }

            target.Apply(Path.Combine(updateDir, "neu"));
            InstallTarget.TryDelete(updateDir);
            var text = version.ToString(3);
            LogInstalled(logger, text);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or InvalidDataException or JsonException)
        {
            LogInstallFailed(logger, e);
            // Kaputtes Update nicht immer wieder versuchen – beim nächsten Start wird neu geladen.
            InstallTarget.TryDelete(updateDir);
            return false;
        }
    }

    public void Relaunch(IReadOnlyList<string> args) => _target?.Relaunch(args);

    public static InstallTarget? DetectTarget(AppPaths paths) =>
        paths is { Desktop: true } ? InstallTarget.Detect(AppContext.BaseDirectory) : null;

    /// <summary>„v1.2.0“, „1.2“ → 1.2.0; sonst null.</summary>
    public static Version? ParseVersion(string? tag)
    {
        var text = tag?.Trim().TrimStart('v', 'V');
        var core = text?.Split('-', '+')[0];
        return Version.TryParse(core, out var version) ? Normalize(version) : null;
    }

    private static Version Normalize(Version v) => new(v.Major, Math.Max(0, v.Minor), Math.Max(0, v.Build));

    private Version? ReadStagedVersion()
    {
        try
        {
            return File.Exists(ReadyFile) && Directory.Exists(ExtractedDirectory)
                ? ParseVersion(JsonSerializer.Deserialize<Staged>(File.ReadAllText(ReadyFile))?.Version)
                : null;
        }
        catch (Exception e) when (e is IOException or JsonException)
        {
            return null;
        }
    }

    private void Set(UpdateState state, string? available, int? progress, string? hint)
    {
        lock (_gate)
        {
            _status = new UpdateStatus(CurrentVersionText, available, state, progress, hint, _checkedAt);
        }
    }

    public static void ConfigureClient(HttpClient http, UpdateOptions options)
    {
        ArgumentNullException.ThrowIfNull(http);
        ArgumentNullException.ThrowIfNull(options);
        http.BaseAddress = new Uri(options.ApiBaseUrl);
        http.Timeout = TimeSpan.FromMinutes(10);
        // GitHub verlangt einen User-Agent.
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Urlaubsplanner", CurrentVersion.ToString(3)));
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Update {Version} heruntergeladen – wird beim Beenden installiert")]
    private partial void LogReady(string version);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Update-Prüfung fehlgeschlagen")]
    private partial void LogUpdateFailed(Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Update {Version} installiert")]
    private static partial void LogInstalled(ILogger logger, string version);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Update konnte nicht installiert werden")]
    private static partial void LogInstallFailed(ILogger logger, Exception exception);

    private sealed record Staged(string Version);

    private sealed record Release(
        [property: JsonPropertyName("tag_name")] string? TagName,
        [property: JsonPropertyName("assets")] List<Asset>? Assets);

    private sealed record Asset(
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("browser_download_url")] string? BrowserDownloadUrl,
        [property: JsonPropertyName("size")] long Size,
        [property: JsonPropertyName("digest")] string? Digest);
}
