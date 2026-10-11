using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Hotels;

/// <summary>Suche nach verfügbaren Hotels rund um einen Punkt für einen Zeitraum.</summary>
public sealed record HotelSearchRequest
{
    public const int MaxNights = 30;
    public const int MinRadiusMeters = 500;
    public const int MaxRadiusMeters = 30_000;

    private HotelSearchRequest(Coordinates center, int radiusMeters, DateOnly checkin, DateOnly checkout, int adults, int rooms)
    {
        Center = center;
        RadiusMeters = radiusMeters;
        Checkin = checkin;
        Checkout = checkout;
        Adults = adults;
        Rooms = rooms;
    }

    public Coordinates Center { get; }

    public int RadiusMeters { get; }

    public DateOnly Checkin { get; }

    public DateOnly Checkout { get; }

    public int Adults { get; }

    public int Rooms { get; }

    public int Nights => Checkout.DayNumber - Checkin.DayNumber;

    /// <summary>Prüft alle Eingaben; der Radius wird in einen sinnvollen Bereich geklemmt.</summary>
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

        return new HotelSearchRequest(
            center,
            Math.Clamp(radiusMeters, MinRadiusMeters, MaxRadiusMeters),
            checkin,
            checkout,
            adults,
            rooms);
    }

    /// <summary>
    /// Verteilt die Personen möglichst gleichmäßig auf die Zimmer: 5 Personen, 2 Zimmer → [3, 2].
    /// </summary>
    public IReadOnlyList<int> AdultsPerRoom() =>
        Enumerable.Range(0, Rooms).Select(i => (Adults / Rooms) + (i < Adults % Rooms ? 1 : 0)).ToList();
}

/// <summary>Das günstigste verfügbare Angebot eines Hotels für die Suche.</summary>
/// <param name="Rating">Gästebewertung 0–10 (wie bei LiteAPI/Booking).</param>
/// <param name="Stars">Hotelsterne 0–5.</param>
/// <param name="TotalPrice">Gesamtpreis für alle Nächte und Zimmer.</param>
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
    string BookingUrl);

/// <param name="Sandbox">True, wenn mit einem Sandbox-Key gesucht wurde (Preise sind dann ggf. Testdaten).</param>
public sealed record HotelSearchResult(IReadOnlyList<HotelOffer> Hotels, bool Sandbox, DateTimeOffset FetchedAt);

public interface IHotelSearch
{
    /// <summary>Ob ein API-Key hinterlegt ist. Ohne Key bietet die App nur das manuelle Speichern an.</summary>
    bool IsConfigured { get; }

    Task<HotelSearchResult> SearchAsync(HotelSearchRequest request, CancellationToken cancellationToken);
}

/// <summary>Kein API-Key hinterlegt.</summary>
public sealed class HotelSearchNotConfiguredException()
    : Exception("Für die Hotelsuche fehlt der LiteAPI-Key (siehe README, Abschnitt Hotelsuche).");

/// <summary>Der Anbieter hat nicht oder mit einem Fehler geantwortet.</summary>
public sealed class HotelSearchUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
