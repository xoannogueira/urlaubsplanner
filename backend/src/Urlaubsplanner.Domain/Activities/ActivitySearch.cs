using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Activities;

public enum ActivityCategory
{
    Sight,
    Museum,
    Viewpoint,
    Castle,
    Religious,
    Nature,
    Beach,
    Zoo,
    ThemePark,
}

/// <summary>Vorschläge rund um einen Punkt (meist den Ort einer Etappe).</summary>
public sealed record ActivitySearchRequest
{
    public const int MinRadiusMeters = 500;
    public const int MaxRadiusMeters = 50_000;

    /// <summary>Umkreis, mit dem die Vorschläge zuerst angezeigt (und im Hintergrund vorgeladen) werden.</summary>
    public const int DefaultRadiusMeters = 5000;

    private ActivitySearchRequest(Coordinates center, int radiusMeters)
    {
        Center = center;
        RadiusMeters = radiusMeters;
    }

    public Coordinates Center { get; }

    public int RadiusMeters { get; }

    public static ActivitySearchRequest Create(double latitude, double longitude, int radiusMeters)
    {
        var center = Coordinates.TryCreate(latitude, longitude)
            ?? throw new DomainException("latitude", "Ungültige Koordinaten.");
        return new ActivitySearchRequest(center, Math.Clamp(radiusMeters, MinRadiusMeters, MaxRadiusMeters));
    }
}

/// <summary>Ein Vorschlag, z. B. ein Museum oder ein Aussichtspunkt.</summary>
/// <param name="Id">Kennung bei OpenStreetMap, z. B. „way/123“.</param>
/// <param name="Popularity">Anzahl Wikipedia-Sprachversionen – grobes Maß, wie bekannt ein Ort ist (0 = keine).</param>
/// <param name="FreeEntry">true = Eintritt frei, false = kostet Eintritt, null = unbekannt.</param>
/// <param name="OpeningHours">Öffnungszeiten im OpenStreetMap-Format, z. B. „Tu-Su 10:00-18:00“.</param>
public sealed record ActivitySuggestion(
    string Id,
    string Name,
    ActivityCategory Category,
    double Latitude,
    double Longitude,
    double DistanceKm,
    string? Description,
    string? ImageUrl,
    string? WikipediaUrl,
    string? Website,
    string? OpeningHours,
    bool? FreeEntry,
    int Popularity,
    string? WikidataId);

public sealed record ActivitySearchResult(IReadOnlyList<ActivitySuggestion> Activities, DateTimeOffset FetchedAt);

public interface IActivitySearch
{
    Task<ActivitySearchResult> SearchAsync(ActivitySearchRequest request, CancellationToken cancellationToken);

    /// <summary>Liegt das Ergebnis schon bereit (dann muss nicht vorgeladen werden)?</summary>
    bool IsCached(ActivitySearchRequest request) => false;
}

/// <summary>OpenStreetMap ist gerade nicht erreichbar.</summary>
public sealed class ActivitySearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
