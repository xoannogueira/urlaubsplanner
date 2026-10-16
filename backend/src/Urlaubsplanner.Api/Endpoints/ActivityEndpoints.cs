using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Api.Endpoints;

public static class ActivityEndpoints
{
    public static IEndpointRouteBuilder MapActivityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/activities", Search).WithTags("Aktivitäten");
        return app;
    }

    /// <summary>
    /// GET /api/activities?lat=38.72&amp;lon=-9.14&amp;radiusMeters=5000&amp;offset=0&amp;limit=10&amp;category=Museum&amp;q=…&amp;sort=Distance
    /// Die Suche selbst läuft einmal und bleibt einen Tag im Cache – weitere Seiten kosten keine neue Abfrage.
    /// </summary>
    private static async Task<IResult> Search(
        double? lat,
        double? lon,
        int? radiusMeters,
        int? offset,
        int? limit,
        ActivityCategory? category,
        string? q,
        ActivitySort? sort,
        IActivitySearch search,
        CancellationToken ct)
    {
        if (lat is null || lon is null)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["lat"] = ["Für Vorschläge fehlt der Ort."] },
                title: "Eingabe ungültig");
        }

        var request = ActivitySearchRequest.Create(lat.Value, lon.Value, radiusMeters ?? ActivitySearchRequest.DefaultRadiusMeters);
        var result = await search.SearchAsync(request, ct);
        var page = ActivityPaging.Page(
            result.Activities,
            category,
            q,
            sort ?? ActivitySort.Popular,
            offset ?? 0,
            limit ?? ActivityPaging.DefaultLimit);
        return TypedResults.Ok(new { page.Activities, page.Total, page.Offset, page.Categories, result.FetchedAt, request.RadiusMeters });
    }
}
