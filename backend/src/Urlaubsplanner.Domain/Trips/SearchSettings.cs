namespace Urlaubsplanner.Domain.Trips;

/// <summary>Startpunkt zu Hause für Bus & Bahn (z. B. „Stuttgart Hbf“).</summary>
public sealed record HomePlace(string Name, double Latitude, double Longitude);

/// <summary>
/// Voreinstellungen für die Suchen einer Reise – damit Flug-, Hotel-, Aktivitäten- und Bahnsuche schon passend
/// ausgefüllt sind. Alles optional; leer heißt „wie bisher“.
/// </summary>
public sealed record SearchSettings(
    IReadOnlyList<string>? HomeAirports = null,
    string? Cabin = null,
    bool Nonstop = false,
    bool WithBag = false,
    int? DepartFrom = null,
    int? DepartTo = null,
    int? HotelRooms = null,
    double? HotelMinRating = null,
    int? HotelMinStars = null,
    decimal? HotelMaxPrice = null,
    bool HotelRefundableOnly = false,
    int? ActivityRadius = null,
    int? FoodRadius = null,
    int? TransitHour = null,
    HomePlace? TransitHome = null)
{
    public static SearchSettings Empty { get; } = new();

    private static readonly string[] Cabins = ["Economy", "PremiumEconomy", "Business", "First"];

    /// <summary>Nichts eingestellt – dann wird auch nichts gespeichert.</summary>
    public bool IsEmpty =>
        (HomeAirports?.Count ?? 0) == 0 && Cabin is null && !Nonstop && !WithBag && DepartFrom is null && DepartTo is null &&
        HotelRooms is null && HotelMinRating is null && HotelMinStars is null && HotelMaxPrice is null && !HotelRefundableOnly &&
        ActivityRadius is null && FoodRadius is null && TransitHour is null && TransitHome is null;

    /// <summary>Prüft Bereiche und räumt auf (Flughafen-Codes groß, doppelte weg).</summary>
    public static SearchSettings Validate(SearchSettings? settings)
    {
        if (settings is null)
        {
            return Empty;
        }

        var airports = (settings.HomeAirports ?? [])
            .Select(a => a?.Trim().ToUpperInvariant() ?? string.Empty)
            .Where(a => a.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (airports.Count > 5 || airports.Any(a => a.Length != 3 || !a.All(char.IsAsciiLetterUpper)))
        {
            throw new DomainException("homeAirports", "Bis zu 5 Flughäfen als dreistelliger Code, z. B. STR.");
        }

        if (settings.Cabin is not null && !Cabins.Contains(settings.Cabin, StringComparer.Ordinal))
        {
            throw new DomainException("cabin", "Unbekannte Klasse.");
        }

        Hour(settings.DepartFrom, "departFrom", 0, 23);
        Hour(settings.DepartTo, "departTo", 1, 24);
        if (settings.DepartFrom is { } f && settings.DepartTo is { } t && t <= f)
        {
            throw new DomainException("departTo", "Das Ende des Zeitfensters muss nach dem Anfang liegen.");
        }

        Range(settings.HotelRooms, "hotelRooms", 1, Trip.MaxTravelers);
        if (settings.HotelMinRating is < 0 or > 10)
        {
            throw new DomainException("hotelMinRating", "Bewertung zwischen 0 und 10.");
        }

        Range(settings.HotelMinStars, "hotelMinStars", 1, 5);
        if (settings.HotelMaxPrice is < 0 or > 1_000_000)
        {
            throw new DomainException("hotelMaxPrice", "Höchstpreis zwischen 0 und 1.000.000 €.");
        }

        Range(settings.ActivityRadius, "activityRadius", 500, 50_000);
        Range(settings.FoodRadius, "foodRadius", 500, 10_000);
        Hour(settings.TransitHour, "transitHour", 0, 23);

        var home = settings.TransitHome;
        if (home is not null)
        {
            var name = Guard.RequiredText(home.Name, "transitHome", 120);
            if (home.Latitude is < -90 or > 90 || home.Longitude is < -180 or > 180)
            {
                throw new DomainException("transitHome", "Ungültige Koordinaten.");
            }

            home = home with { Name = name };
        }

        return settings with { HomeAirports = airports, TransitHome = home };
    }

    private static void Hour(int? value, string field, int min, int max) => Range(value, field, min, max);

    private static void Range(int? value, string field, int min, int max)
    {
        if (value is { } v && (v < min || v > max))
        {
            throw new DomainException(field, $"Wert zwischen {min} und {max}.");
        }
    }
}
