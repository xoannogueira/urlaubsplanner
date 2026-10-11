using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Hotels;

/// <summary>
/// Suche nach verfügbaren Hotels für einen Zeitraum – entweder rund um einen Punkt (<see cref="Center"/>)
/// oder gezielt für bestimmte Hotels (<see cref="HotelIds"/>, z. B. zum erneuten Prüfen gemerkter Hotels).
/// </summary>
public sealed record HotelSearchRequest
{
    public const int MaxNights = 30;
    public const int MinRadiusMeters = 500;
    public const int MaxRadiusMeters = 30_000;
    public const int MaxHotelIds = 20;

    private HotelSearchRequest(
        Coordinates? center,
        int radiusMeters,
        IReadOnlyList<string> hotelIds,
        DateOnly checkin,
        DateOnly checkout,
        int adults,
        int rooms)
    {
        Center = center;
        RadiusMeters = radiusMeters;
        HotelIds = hotelIds;
        Checkin = checkin;
        Checkout = checkout;
        Adults = adults;
        Rooms = rooms;
    }

    /// <summary>Mittelpunkt der Umkreissuche; null bei einer Suche nach <see cref="HotelIds"/>.</summary>
    public Coordinates? Center { get; }

    public int RadiusMeters { get; }

    /// <summary>Leer bei einer Umkreissuche.</summary>
    public IReadOnlyList<string> HotelIds { get; }

    public DateOnly Checkin { get; }

    public DateOnly Checkout { get; }

    public int Adults { get; }

    public int Rooms { get; }

    public int Nights => Checkout.DayNumber - Checkin.DayNumber;

    /// <summary>Umkreissuche. Prüft alle Eingaben; der Radius wird in einen sinnvollen Bereich geklemmt.</summary>
    public static HotelSearchRequest Create(
        double latitude,
        double longitude,
        int radiusMeters,
        DateOnly checkin,
        DateOnly checkout,
        int adults,
        int rooms,
        DateOnly today)
    {
        var center = Coordinates.TryCreate(latitude, longitude)
            ?? throw new DomainException("latitude", "Ungültige Koordinaten.");
        ValidateStay(checkin, checkout, adults, rooms, today);

        return new HotelSearchRequest(
            center,
            Math.Clamp(radiusMeters, MinRadiusMeters, MaxRadiusMeters),
            [],
            checkin,
            checkout,
            adults,
            rooms);
    }

    /// <summary>Suche nach bestimmten Hotels (höchstens <see cref="MaxHotelIds"/>).</summary>
    public static HotelSearchRequest ForHotels(
        IEnumerable<string>? hotelIds,
        DateOnly checkin,
        DateOnly checkout,
        int adults,
        int rooms,
        DateOnly today)
    {
        var ids = (hotelIds ?? []).Select(id => id?.Trim()).Where(id => !string.IsNullOrEmpty(id)).Distinct(StringComparer.Ordinal).ToList();
        if (ids.Count == 0)
        {
            throw new DomainException("hotelIds", "Wähle mindestens ein Hotel aus.");
        }

        if (ids.Count > MaxHotelIds)
        {
            throw new DomainException("hotelIds", $"Höchstens {MaxHotelIds} Hotels auf einmal.");
        }

        if (ids.Any(id => id!.Length > 50))
        {
            throw new DomainException("hotelIds", "Ungültige Hotel-ID.");
        }

        ValidateStay(checkin, checkout, adults, rooms, today);
        return new HotelSearchRequest(null, 0, ids!, checkin, checkout, adults, rooms);
    }

    /// <summary>Gleiche Suche, anderer Zeitraum (für Ausweichdaten).</summary>
    public HotelSearchRequest WithDates(DateOnly checkin, DateOnly checkout) =>
        new(Center, RadiusMeters, HotelIds, checkin, checkout, Adults, Rooms);

    /// <summary>
    /// Verteilt die Personen möglichst gleichmäßig auf die Zimmer: 5 Personen, 2 Zimmer → [3, 2].
    /// </summary>
    public IReadOnlyList<int> AdultsPerRoom() =>
        Enumerable.Range(0, Rooms).Select(i => (Adults / Rooms) + (i < Adults % Rooms ? 1 : 0)).ToList();

    private static void ValidateStay(DateOnly checkin, DateOnly checkout, int adults, int rooms, DateOnly today)
    {
        if (checkin < today)
        {
            throw new DomainException("checkin", "Die Anreise liegt in der Vergangenheit.");
        }

        if (checkout <= checkin)
        {
            throw new DomainException("checkout", "Die Abreise muss nach der Anreise liegen.");
        }

        if (checkout.DayNumber - checkin.DayNumber > MaxNights)
        {
            throw new DomainException("checkout", $"Höchstens {MaxNights} Nächte pro Suche.");
        }

        Guard.InRange(adults, "adults", 1, 50);
        Guard.InRange(rooms, "rooms", 1, adults);
    }
}

/// <summary>Ein buchbares Zimmerangebot (bei mehreren Zimmern: alle Zimmer zusammen).</summary>
/// <param name="TotalPrice">Gesamtpreis für alle Nächte und Zimmer.</param>
/// <param name="MarketPrice">
/// Vom Hotel empfohlener öffentlicher Preis (LiteAPI „suggested selling price“) – ungefähr das, was Booking &amp; Co. zeigen.
/// </param>
/// <param name="PayAtProperty">Steuern/Gebühren, die nicht im Preis enthalten sind und vor Ort bezahlt werden (z. B. Kurtaxe).</param>
public sealed record RoomOffer(
    string? Name,
    string? BoardName,
    bool Refundable,
    decimal TotalPrice,
    string Currency,
    decimal? MarketPrice,
    decimal? PayAtProperty,
    string? PayAtPropertyLabel);

/// <summary>Ein Hotel mit seinen Zimmerangeboten; die Felder oben beschreiben das günstigste Zimmer.</summary>
/// <param name="Rating">Gästebewertung 0–10 (wie bei LiteAPI/Booking).</param>
/// <param name="Stars">Hotelsterne 0–5.</param>
/// <param name="TotalPrice">Gesamtpreis des günstigsten Zimmers für alle Nächte und Zimmer.</param>
/// <param name="GoogleUrl">Google Hotels vergleicht viele Anbieter – hilfreich, wenn Booking.com ausgebucht ist.</param>
/// <param name="Rooms">Alle Zimmerangebote, günstigstes zuerst.</param>
public sealed record HotelOffer(
    string HotelId,
    string Name,
    string? Address,
    double? Latitude,
    double? Longitude,
    double? Rating,
    int? ReviewCount,
    double? Stars,
    string? PhotoUrl,
    decimal TotalPrice,
    string Currency,
    string? RoomName,
    string? BoardName,
    bool Refundable,
    string BookingUrl,
    string GoogleUrl,
    decimal? MarketPrice,
    decimal? PayAtProperty,
    string? PayAtPropertyLabel,
    IReadOnlyList<RoomOffer> Rooms);

/// <param name="Sandbox">True, wenn mit einem Sandbox-Key gesucht wurde (Preise sind dann ggf. Testdaten).</param>
public sealed record HotelSearchResult(IReadOnlyList<HotelOffer> Hotels, bool Sandbox, DateTimeOffset FetchedAt);

/// <summary>Ein Hotel im Umkreis – unabhängig davon, ob es für den Zeitraum frei ist.</summary>
public sealed record HotelListing(
    string HotelId,
    string Name,
    string? Address,
    double? Latitude,
    double? Longitude,
    double? Rating,
    int? ReviewCount,
    double? Stars,
    string? PhotoUrl,
    string BookingUrl,
    string GoogleUrl);

public interface IHotelSearch
{
    /// <summary>Ob ein API-Key hinterlegt ist. Ohne Key bietet die App nur das manuelle Speichern an.</summary>
    bool IsConfigured { get; }

    /// <summary>Freie Hotels mit dem günstigsten Preis.</summary>
    Task<HotelSearchResult> SearchAsync(HotelSearchRequest request, CancellationToken cancellationToken);

    /// <summary>Alle bekannten Hotels im Umkreis (auch ausgebuchte), ohne Preise. Braucht eine Umkreissuche.</summary>
    Task<IReadOnlyList<HotelListing>> ListAsync(HotelSearchRequest request, CancellationToken cancellationToken);
}

/// <summary>Kein API-Key hinterlegt.</summary>
public sealed class HotelSearchNotConfiguredException()
    : Exception("Für die Hotelsuche fehlt der LiteAPI-Key (siehe README, Abschnitt Hotelsuche).");

/// <summary>Der Anbieter hat nicht oder mit einem Fehler geantwortet.</summary>
public sealed class HotelSearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
