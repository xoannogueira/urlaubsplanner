using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Infrastructure.Places;

/// <summary>
/// Ortssuche über Photon (https://photon.komoot.io), kostenlos und für Suche beim Tippen gedacht.
/// Ergebnisse werden einen Tag gecacht, damit gleiche Suchen den Dienst nicht erneut belasten.
/// </summary>
public sealed partial class PhotonPlaceSearch(HttpClient http, IMemoryCache cache, ILogger<PhotonPlaceSearch> logger) : IPlaceSearch, IPlaceNames
{
    public const int MaxResults = 6;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromDays(1);

    public async Task<IReadOnlyList<Place>> SearchAsync(string query, Coordinates? near, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        var normalized = query.Trim();
        // Auf ~1 km runden, damit leicht verschobene Kartenausschnitte denselben Cache-Eintrag nutzen.
        var bias = near is { } n
            ? string.Create(CultureInfo.InvariantCulture, $"&lat={Math.Round(n.Latitude, 2)}&lon={Math.Round(n.Longitude, 2)}")
            : string.Empty;
        var cacheKey = $"photon:{normalized.ToUpperInvariant()}{bias}";

        if (cache.TryGetValue(cacheKey, out IReadOnlyList<Place>? cached) && cached is not null)
        {
            return cached;
        }

        PhotonResponse? response;
        try
        {
            var url = $"api/?q={Uri.EscapeDataString(normalized)}&limit={MaxResults}&lang=de{bias}";
            response = await http.GetFromJsonAsync<PhotonResponse>(url, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e, normalized);
            throw new PlaceSearchUnavailableException("Die Ortssuche ist gerade nicht erreichbar.", e);
        }

        var places = (response?.Features ?? [])
            .Select(ToPlace)
            .OfType<Place>()
            .DistinctBy(p => p.Label)
            .ToList();

        cache.Set(cacheKey, (IReadOnlyList<Place>)places, CacheDuration);
        return places;
    }

    /// <summary>Ort, Gemeinde/Bezirk und Region am Punkt (Photon /reverse). Fehler ergeben eine leere Liste.</summary>
    public async Task<IReadOnlyList<string>> NamesAroundAsync(Coordinates point, CancellationToken cancellationToken)
    {
        var at = string.Create(CultureInfo.InvariantCulture, $"lat={Math.Round(point.Latitude, 3)}&lon={Math.Round(point.Longitude, 3)}");
        var cacheKey = $"photon:reverse:{at}";
        if (cache.TryGetValue(cacheKey, out IReadOnlyList<string>? cached) && cached is not null)
        {
            return cached;
        }

        try
        {
            var response = await http.GetFromJsonAsync<PhotonResponse>($"reverse?{at}&limit=1&lang=de", cancellationToken).ConfigureAwait(false);
            var p = response?.Features?.FirstOrDefault()?.Properties;
            IReadOnlyList<string> names = p is null
                ? []
                : [.. new[] { p.City, p.District, p.County, p.State }
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Select(n => n!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)];
            cache.Set(cacheKey, names, CacheDuration);
            return names;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed(e, at);
            return [];
        }
    }

    internal static Place? ToPlace(PhotonFeature feature)
    {
        var p = feature.Properties;
        var coordinates = feature.Geometry?.Coordinates;
        if (p?.Name is not { Length: > 0 } name || coordinates is not { Length: >= 2 })
        {
            return null;
        }

        // Für das Label nur Teile nehmen, die etwas Neues sagen ("Lissabon, Lissabon, Portugal" vermeiden).
        var parts = new List<string> { name };
        foreach (var part in new[] { p.City, p.State, p.Country })
        {
            if (!string.IsNullOrWhiteSpace(part) && !parts.Contains(part, StringComparer.OrdinalIgnoreCase))
            {
                parts.Add(part);
            }
        }

        return new Place(name, string.Join(", ", parts), coordinates[1], coordinates[0], Classify(p));
    }

    private static string? Classify(PhotonProperties p) => (p.OsmKey, p.OsmValue) switch
    {
        ("tourism", "hotel" or "hostel" or "guest_house" or "apartment" or "motel") => "hotel",
        ("tourism", _) or ("historic", _) => "attraction",
        ("aeroway", "aerodrome") => "airport",
        ("place", "city" or "town" or "village" or "hamlet") => "city",
        ("place", "country") or ("boundary", _) => "region",
        _ => p.Type?.ToLower(CultureInfo.InvariantCulture),
    };

    [LoggerMessage(Level = LogLevel.Warning, Message = "Ortssuche fehlgeschlagen für \"{Query}\"")]
    private partial void LogFailed(Exception exception, string query);
}

internal sealed record PhotonResponse(List<PhotonFeature>? Features);

internal sealed record PhotonFeature(PhotonGeometry? Geometry, PhotonProperties? Properties);

internal sealed record PhotonGeometry(double[]? Coordinates);

internal sealed record PhotonProperties(
    string? Name,
    string? City,
    string? District,
    string? County,
    string? State,
    string? Country,
    string? Type,
    [property: System.Text.Json.Serialization.JsonPropertyName("osm_key")] string? OsmKey,
    [property: System.Text.Json.Serialization.JsonPropertyName("osm_value")] string? OsmValue);
