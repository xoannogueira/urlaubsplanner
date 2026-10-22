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

    // Essen & Trinken
    Restaurant,
    Cafe,
    Bar,
    IceCream,
}

/// <summary>Was gesucht wird: Sehenswertes oder Essen & Trinken.</summary>
public enum ActivityTheme
{
    Sights,
    Food,
}

/// <summary>Vorschläge rund um einen Punkt (meist den Ort einer Etappe).</summary>
public sealed record ActivitySearchRequest
{
    public const int MinRadiusMeters = 500;
    public const int MaxRadiusMeters = 50_000;

    /// <summary>Umkreis, mit dem die Vorschläge zuerst angezeigt (und im Hintergrund vorgeladen) werden.</summary>
    public const int DefaultRadiusMeters = 5000;

    /// <summary>Essen & Trinken: kleinerer Umkreis (in Städten gibt es sonst Tausende) und höchstens 10 km.</summary>
    public const int DefaultFoodRadiusMeters = 1500;
    public const int MaxFoodRadiusMeters = 10_000;

    private ActivitySearchRequest(Coordinates center, int radiusMeters, ActivityTheme theme)
    {
        Center = center;
        RadiusMeters = radiusMeters;
        Theme = theme;
    }

    public Coordinates Center { get; }

    public int RadiusMeters { get; }

    public ActivityTheme Theme { get; }

    public static ActivitySearchRequest Create(double latitude, double longitude, int radiusMeters, ActivityTheme theme = ActivityTheme.Sights)
    {
        var center = Coordinates.TryCreate(latitude, longitude)
            ?? throw new DomainException("latitude", "Ungültige Koordinaten.");
        var max = theme == ActivityTheme.Food ? MaxFoodRadiusMeters : MaxRadiusMeters;
        return new ActivitySearchRequest(center, Math.Clamp(radiusMeters, MinRadiusMeters, max), theme);
    }
}

/// <summary>Ein Vorschlag, z. B. ein Museum oder ein Aussichtspunkt.</summary>
/// <param name="Id">Kennung bei OpenStreetMap, z. B. „way/123“.</param>
/// <param name="Popularity">Anzahl Wikipedia-Sprachversionen – grobes Maß, wie bekannt ein Ort ist (0 = keine).</param>
/// <param name="FreeEntry">true = Eintritt frei, false = kostet Eintritt, null = unbekannt.</param>
/// <param name="OpeningHours">Öffnungszeiten im OpenStreetMap-Format, z. B. „Tu-Su 10:00-18:00“.</param>
/// <param name="Cuisine">Essen & Trinken: Küche auf Deutsch, z. B. „Portugiesisch, Fisch“.</param>
/// <param name="Diet">Essen & Trinken: „vegan“, „vegetarisch“ oder „vegetarische Auswahl“.</param>
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
    string? WikidataId,
    string? Cuisine = null,
    string? Diet = null,
    string? Phone = null);

public sealed record ActivitySearchResult(IReadOnlyList<ActivitySuggestion> Activities, DateTimeOffset FetchedAt);

public interface IActivitySearch
{
    Task<ActivitySearchResult> SearchAsync(ActivitySearchRequest request, CancellationToken cancellationToken);

    /// <summary>Liegt das Ergebnis schon bereit (dann muss nicht vorgeladen werden)?</summary>
    bool IsCached(ActivitySearchRequest request) => false;
}

/// <summary>OpenStreetMap ist gerade nicht erreichbar.</summary>
public sealed class ActivitySearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Sucht ein passendes Foto für einen Ort ohne Bild (z. B. auf Wikimedia Commons in unmittelbarer Nähe).</summary>
public interface IActivityPhotos
{
    /// <summary>Bild-URL oder <c>null</c>, wenn nichts sicher passt.</summary>
    Task<string?> FindAsync(Places.Coordinates at, string name, CancellationToken cancellationToken);
}
