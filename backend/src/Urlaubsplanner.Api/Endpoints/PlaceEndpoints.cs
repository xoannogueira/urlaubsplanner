using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Api.Endpoints;

public static class PlaceEndpoints
{
    public static IEndpointRouteBuilder MapPlaceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/places", SearchPlaces).WithTags("Orte");
        return app;
    }

    /// <summary>GET /api/places?q=Hotel%20Miradouro&amp;lat=38.71&amp;lon=-9.14 – lat/lon sind optional.</summary>
    private static async Task<IResult> SearchPlaces(string? q, double? lat, double? lon, IPlaceSearch search, CancellationToken ct)
    {
        var query = q?.Trim() ?? string.Empty;
        if (query.Length < 2 || query.Length > 200)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["q"] = ["Bitte 2 bis 200 Zeichen eingeben."] },
                title: "Eingabe ungültig");
        }

        return TypedResults.Ok(await search.SearchAsync(query, Coordinates.TryCreate(lat, lon), ct));
    }
}
