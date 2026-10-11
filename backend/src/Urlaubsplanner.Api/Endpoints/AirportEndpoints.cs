using Microsoft.AspNetCore.Http.HttpResults;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Api.Endpoints;

/// <param name="DistanceKm">Nur bei Umkreissuche bzw. wenn über einen Ort gefunden.</param>
/// <param name="Near">Ort, über den der Flughafen gefunden wurde (z. B. „Lissabon“).</param>
public sealed record AirportResponse(
    string Code,
    string Name,
    string City,
    string CountryCode,
    double Latitude,
    double Longitude,
    bool Major,
    double? DistanceKm = null,
    string? Near = null)
{
    public static AirportResponse From(Airport a, double? distanceKm = null, string? near = null) =>
        new(a.Code, a.Name, a.City, a.CountryCode, a.Latitude, a.Longitude, a.Major, distanceKm, near);
}

public static class AirportEndpoints
{
    private const double PlaceRadiusKm = 150;

    public static IEndpointRouteBuilder MapAirportEndpoints(this IEndpointRouteBuilder app)
    {
        var airports = app.MapGroup("/api/airports").WithTags("Flughäfen");
        airports.MapGet("/", Search);
        airports.MapGet("/near", Near);
        airports.MapGet("/lookup", Lookup);
        return app;
    }

    /// <summary>
    /// Sucht nach Code, Stadt oder Name. Findet das wenig (z. B. „Lissabon“ statt „Lisbon“), wird der Ort
    /// über die Ortssuche bestimmt und die Flughäfen in der Nähe ergänzt.
    /// </summary>
    private static async Task<IResult> Search(string? q, IAirportDirectory directory, IPlaceSearch places, CancellationToken ct)
    {
        var query = q?.Trim() ?? string.Empty;
        if (query.Length < 2 || query.Length > 100)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["q"] = ["Bitte 2 bis 100 Zeichen eingeben."] },
                title: "Eingabe ungültig");
        }

        var results = directory.Search(query, 8).Select(a => AirportResponse.From(a)).ToList();
        if (results.Count < 3 && query.Length >= 3)
        {
            try
            {
                var found = await places.SearchAsync(query, null, ct);
                var place = found.Count > 0 ? found[0] : null;
                if (place is not null)
                {
                    var center = new Coordinates(place.Latitude, place.Longitude);
                    results.AddRange(directory.Near(center, PlaceRadiusKm, 5)
                        .Where(n => results.TrueForAll(r => r.Code != n.Airport.Code))
                        .Select(n => AirportResponse.From(n.Airport, n.DistanceKm, place.Name)));
                }
            }
            catch (PlaceSearchUnavailableException)
            {
                // Ohne Ortssuche bleiben die direkten Treffer.
            }
        }

        return TypedResults.Ok(results);
    }

    /// <summary>GET /api/airports/near?lat=38.72&amp;lon=-9.14&amp;radiusKm=150</summary>
    private static IResult Near(double? lat, double? lon, double? radiusKm, IAirportDirectory directory)
    {
        if (Coordinates.TryCreate(lat, lon) is not { } center)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["lat"] = ["Ungültige Koordinaten."] },
                title: "Eingabe ungültig");
        }

        var radius = Math.Clamp(radiusKm ?? PlaceRadiusKm, 10, 500);
        return TypedResults.Ok(directory.Near(center, radius, 10).Select(n => AirportResponse.From(n.Airport, n.DistanceKm)));
    }

    /// <summary>GET /api/airports/lookup?codes=STR,LIS – unbekannte Codes fehlen in der Antwort.</summary>
    private static Ok<IEnumerable<AirportResponse>> Lookup(string? codes, IAirportDirectory directory) =>
        TypedResults.Ok((codes ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Take(30)
            .Select(directory.Find)
            .OfType<Airport>()
            .DistinctBy(a => a.Code)
            .Select(a => AirportResponse.From(a)));
}
