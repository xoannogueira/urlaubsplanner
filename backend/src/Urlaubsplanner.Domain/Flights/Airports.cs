using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Flights;

/// <summary>Flughafen mit Linienverkehr.</summary>
/// <param name="Code">IATA-Code, z. B. STR.</param>
/// <param name="Major">Großer Flughafen (viele Verbindungen).</param>
public sealed record Airport(string Code, string Name, string City, string CountryCode, double Latitude, double Longitude, bool Major)
{
    public Coordinates Position => new(Latitude, Longitude);
}

public sealed record NearbyAirport(Airport Airport, double DistanceKm);

public interface IAirportDirectory
{
    Airport? Find(string code);

    /// <summary>Sucht nach IATA-Code, Stadt oder Name (ohne Akzente, Groß/Klein egal).</summary>
    IReadOnlyList<Airport> Search(string query, int limit);

    /// <summary>Flughäfen im Umkreis, nächste zuerst.</summary>
    IReadOnlyList<NearbyAirport> Near(Coordinates center, double radiusKm, int limit);
}

public static class GeoMath
{
    private const double EarthRadiusKm = 6371;

    /// <summary>Luftlinie in km (Haversine).</summary>
    public static double DistanceKm(Coordinates a, Coordinates b)
    {
        static double Rad(double deg) => deg * Math.PI / 180;
        var dLat = Rad(b.Latitude - a.Latitude);
        var dLon = Rad(b.Longitude - a.Longitude);
        var h = (Math.Sin(dLat / 2) * Math.Sin(dLat / 2)) +
            (Math.Cos(Rad(a.Latitude)) * Math.Cos(Rad(b.Latitude)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2));
        return 2 * EarthRadiusKm * Math.Asin(Math.Min(1, Math.Sqrt(h)));
    }
}
