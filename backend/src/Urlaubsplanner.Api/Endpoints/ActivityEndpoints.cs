using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Api.Endpoints;

public static class ActivityEndpoints
{
    public static IEndpointRouteBuilder MapActivityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/activities", Search).WithTags("Aktivitäten");
        return app;
    }

    /// <summary>GET /api/activities?lat=38.72&amp;lon=-9.14&amp;radiusMeters=5000 – Vorschläge, bekannteste zuerst.</summary>
    private static async Task<IResult> Search(double? lat, double? lon, int? radiusMeters, IActivitySearch search, CancellationToken ct)
    {
        if (lat is null || lon is null)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["lat"] = ["Für Vorschläge fehlt der Ort."] },
                title: "Eingabe ungültig");
        }

        var request = ActivitySearchRequest.Create(lat.Value, lon.Value, radiusMeters ?? 5000);
        var result = await search.SearchAsync(request, ct);
        return TypedResults.Ok(new { result.Activities, result.FetchedAt, request.RadiusMeters });
    }
}
