using System.Diagnostics;
using System.Net.Sockets;
using System.Security.Authentication;
using Urlaubsplanner.Infrastructure.Activities;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Ergebnis für einen Dienst: erreichbar oder warum nicht (in Worten, die man einem Freund weitergeben kann).
/// <paramref name="Kind"/> ordnet das Problem ein (<see cref="ConnectivityCheck.Kinds"/>), <paramref name="Detail"/> ist die
/// technische Originalmeldung, <paramref name="Note"/> ein Hinweis, wenn der Dienst nur über einen Ausweichserver geht.
/// </summary>
public sealed record ConnectivityResult(
    string Name,
    string Url,
    bool Ok,
    int Milliseconds,
    string? Problem,
    string? Kind = null,
    string? Detail = null,
    string? Note = null);

/// <summary>
/// „Verbindung prüfen“: Erreicht die App die Dienste, die sie für die Suchen braucht? Hilft, wenn ein Antivirenprogramm
/// (z. B. Avast) oder eine Firewall die App blockiert – dann steht hier, welcher Dienst und warum.
/// Jede HTTP-Antwort zählt als erreichbar (auch 4xx); nur Netzwerk-, Verschlüsselungs- und Zeitfehler sind Probleme.
/// Hat ein Dienst mehrere Server (Aktivitäten), reicht einer – die Suche weicht selbst aus.
/// </summary>
public static class ConnectivityCheck
{
    public const string HttpClientName = "connectivity";

    /// <summary>Art des Problems, damit die Oberfläche den passenden Tipp zeigt.</summary>
    public static class Kinds
    {
        public const string Blocked = "blockiert";
        public const string Certificate = "zertifikat";
        public const string Encryption = "verschluesselung";
        public const string Network = "netz";
        public const string Timeout = "zeit";
        public const string Other = "sonstiges";
    }

    public static IReadOnlyList<(string Name, IReadOnlyList<string> Urls)> Targets(IConfiguration configuration, IEnumerable<string>? overpassUrls = null)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        string Base(string key, string fallback) => (configuration[key] ?? fallback).TrimEnd('/') + "/";
        var overpass = (overpassUrls ?? new ActivityOptions().OverpassUrls).Where(u => !string.IsNullOrWhiteSpace(u)).ToList();
        return
        [
            ("Ortssuche (Photon)", [Base("Places:PhotonUrl", "https://photon.komoot.io/") + "api?q=Berlin&limit=1"]),
            ("Flug- und Hotelsuche (SerpApi)", [Base("SerpApi:BaseUrl", "https://serpapi.com/")]),
            ("Aktivitäten (OpenStreetMap)", overpass),
            ("Wetter (Open-Meteo)", [(configuration["Weather:ForecastUrl"] ?? "https://api.open-meteo.com/v1/forecast") + "?latitude=48.78&longitude=9.18&daily=weather_code&forecast_days=1"]),
            ("Bus & Bahn (Transitous)", [Base("Transit:BaseUrl", "https://api.transitous.org/")]),
            ("Karten (OpenFreeMap)", ["https://tiles.openfreemap.org/styles/positron"]),
        ];
    }

    public static async Task<IReadOnlyList<ConnectivityResult>> RunAsync(
        HttpClient http,
        IConfiguration configuration,
        CancellationToken cancellationToken,
        IEnumerable<string>? overpassUrls = null)
    {
        ArgumentNullException.ThrowIfNull(http);
        var checks = Targets(configuration, overpassUrls).Select(t => CheckServiceAsync(http, t.Name, t.Urls, cancellationToken));
        return await Task.WhenAll(checks).ConfigureAwait(false);
    }

    private static async Task<ConnectivityResult> CheckServiceAsync(HttpClient http, string name, IReadOnlyList<string> urls, CancellationToken cancellationToken)
    {
        var results = await Task.WhenAll(urls.Select(u => CheckAsync(http, name, u, cancellationToken))).ConfigureAwait(false);
        var ok = results.Where(r => r.Ok).OrderBy(r => r.Milliseconds).FirstOrDefault();
        var failed = results.Where(r => !r.Ok).ToList();
        if (ok is null)
        {
            return failed.FirstOrDefault() ?? new ConnectivityResult(name, "–", false, 0, "Kein Server eingestellt.", Kinds.Other);
        }

        if (failed.Count == 0)
        {
            return ok;
        }

        var note = string.Join(" ", failed.Select(f => $"{f.Url}: {f.Problem}"));
        return ok with { Note = $"Geht über einen Ausweichserver. Nicht nutzbar: {note}", Detail = string.Join(" | ", failed.Select(f => $"{f.Url}: {f.Detail}")) };
    }

    private static async Task<ConnectivityResult> CheckAsync(HttpClient http, string name, string url, CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            using var response = await http.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false);
            return new ConnectivityResult(name, Host(url), true, (int)watch.ElapsedMilliseconds, null);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            var (kind, text) = Classify(e);
            return new ConnectivityResult(name, Host(url), false, (int)watch.ElapsedMilliseconds, text, kind, Innermost(e));
        }
    }

    /// <summary>Technischen Fehler in eine verständliche Ursache übersetzen.</summary>
    internal static string Explain(Exception e) => Classify(e).Text;

    internal static (string Kind, string Text) Classify(Exception e)
    {
        if (e is TaskCanceledException)
        {
            return (Kinds.Timeout, "Keine Antwort (Zeitüberschreitung) – Internet langsam oder die Verbindung wird blockiert.");
        }

        for (var inner = e.InnerException; inner is not null; inner = inner.InnerException)
        {
            switch (inner)
            {
                case AuthenticationException when IsProtocolMismatch(inner):
                    return (Kinds.Encryption,
                        "Verschlüsselung passt nicht zusammen – der Server verlangt vermutlich TLS 1.3, das dieses System der App nicht anbietet (z. B. Windows 10).");
                case AuthenticationException:
                    return (Kinds.Certificate,
                        "Sicherheitszertifikat abgelehnt – vermutlich prüft ein Antivirenprogramm (z. B. Avast „HTTPS-Scan“) verschlüsselte Verbindungen.");
                case SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.TryAgain or SocketError.NoData }:
                    return (Kinds.Network, "Adresse nicht gefunden – kein Internet oder Namensauflösung (DNS) blockiert.");
                case SocketException { SocketErrorCode: SocketError.AccessDenied or SocketError.ConnectionRefused or SocketError.ConnectionReset }:
                    return (Kinds.Blocked, "Verbindung blockiert – vermutlich von einer Firewall oder einem Antivirenprogramm.");
                case SocketException { SocketErrorCode: SocketError.NetworkUnreachable or SocketError.HostUnreachable }:
                    return (Kinds.Network, "Kein Netzwerk – Internetverbindung prüfen.");
                default:
                    break;
            }
        }

        return (Kinds.Other, $"Nicht erreichbar: {e.Message}");
    }

    /// <summary>
    /// Scheitert schon das Aushandeln (macOS: „handshake failure“, Windows: „no common algorithm“), liegt es nicht am
    /// Zertifikat, sondern an der TLS-Version bzw. den Verfahren.
    /// </summary>
    private static bool IsProtocolMismatch(Exception authentication)
    {
        string[] markers = ["handshake failure", "common algorithm", "protocol version", "no shared cipher", "unsupported protocol", "not supported"];
        for (var x = authentication; x is not null; x = x.InnerException)
        {
            if (x is PlatformNotSupportedException || markers.Any(m => x.Message.Contains(m, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Die innerste Fehlermeldung – die technische Ursache, zum Weitergeben.</summary>
    private static string Innermost(Exception e)
    {
        var x = e;
        while (x.InnerException is not null)
        {
            x = x.InnerException;
        }

        return $"{x.GetType().Name}: {x.Message}";
    }

    private static string Host(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : url;
}
