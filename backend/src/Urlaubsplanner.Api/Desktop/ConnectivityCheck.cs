using System.Diagnostics;
using System.Net.Sockets;
using System.Security.Authentication;

namespace Urlaubsplanner.Api.Desktop;

/// <summary>Ergebnis für einen Dienst: erreichbar oder warum nicht (in Worten, die man einem Freund weitergeben kann).</summary>
public sealed record ConnectivityResult(string Name, string Url, bool Ok, int Milliseconds, string? Problem);

/// <summary>
/// „Verbindung prüfen“: Erreicht die App die Dienste, die sie für die Suchen braucht? Hilft, wenn ein Antivirenprogramm
/// (z. B. Avast) oder eine Firewall die App blockiert – dann steht hier, welcher Dienst und warum.
/// Jede HTTP-Antwort zählt als erreichbar (auch 4xx); nur Netzwerk-, Zertifikats- und Zeitfehler sind Probleme.
/// </summary>
public static class ConnectivityCheck
{
    public const string HttpClientName = "connectivity";

    public static IReadOnlyList<(string Name, string Url)> Targets(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        string Base(string key, string fallback) => (configuration[key] ?? fallback).TrimEnd('/') + "/";
        var overpass = configuration["Activities:OverpassUrls:0"] ?? "https://overpass-api.de/api/interpreter";
        return
        [
            ("Ortssuche (Photon)", Base("Places:PhotonUrl", "https://photon.komoot.io/") + "api?q=Berlin&limit=1"),
            ("Flug- und Hotelsuche (SerpApi)", Base("SerpApi:BaseUrl", "https://serpapi.com/")),
            ("Aktivitäten (OpenStreetMap)", overpass),
            ("Wetter (Open-Meteo)", (configuration["Weather:ForecastUrl"] ?? "https://api.open-meteo.com/v1/forecast") + "?latitude=48.78&longitude=9.18&daily=weather_code&forecast_days=1"),
            ("Bus & Bahn (Transitous)", Base("Transit:BaseUrl", "https://api.transitous.org/")),
            ("Karten (OpenFreeMap)", "https://tiles.openfreemap.org/styles/positron"),
        ];
    }

    public static async Task<IReadOnlyList<ConnectivityResult>> RunAsync(HttpClient http, IConfiguration configuration, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(http);
        var checks = Targets(configuration).Select(t => CheckAsync(http, t.Name, t.Url, cancellationToken));
        return await Task.WhenAll(checks).ConfigureAwait(false);
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
            return new ConnectivityResult(name, Host(url), false, (int)watch.ElapsedMilliseconds, Explain(e));
        }
    }

    /// <summary>Technischen Fehler in eine verständliche Ursache übersetzen.</summary>
    internal static string Explain(Exception e)
    {
        if (e is TaskCanceledException)
        {
            return "Keine Antwort (Zeitüberschreitung) – Internet langsam oder die Verbindung wird blockiert.";
        }

        for (var inner = e.InnerException; inner is not null; inner = inner.InnerException)
        {
            switch (inner)
            {
                case AuthenticationException:
                    return "Sicherheitszertifikat abgelehnt – vermutlich prüft ein Antivirenprogramm (z. B. Avast „HTTPS-Scan“) verschlüsselte Verbindungen.";
                case SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.TryAgain or SocketError.NoData }:
                    return "Adresse nicht gefunden – kein Internet oder Namensauflösung (DNS) blockiert.";
                case SocketException { SocketErrorCode: SocketError.AccessDenied or SocketError.ConnectionRefused or SocketError.ConnectionReset }:
                    return "Verbindung blockiert – vermutlich von einer Firewall oder einem Antivirenprogramm.";
                case SocketException { SocketErrorCode: SocketError.NetworkUnreachable or SocketError.HostUnreachable }:
                    return "Kein Netzwerk – Internetverbindung prüfen.";
                default:
                    break;
            }
        }

        return $"Nicht erreichbar: {e.Message}";
    }

    private static string Host(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : url;
}
