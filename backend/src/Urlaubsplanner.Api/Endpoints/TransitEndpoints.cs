using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Transit;

namespace Urlaubsplanner.Api.Endpoints;

public static class TransitEndpoints
{
    public static IEndpointRouteBuilder MapTransitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/transit/plan", Plan).WithTags("Bus & Bahn");
        return app;
    }

    /// <summary>
    /// GET /api/transit/plan?fromLat=48.78&amp;fromLon=9.18&amp;toLat=48.84&amp;toLon=2.37&amp;time=2027-05-12T08:00:00Z&amp;arriveBy=false&amp;cursor=…
    /// Verbindungen mit Bus & Bahn (Transitous). Kostenlos, ohne Key, zählt nicht zu den Google-Suchen.
    /// </summary>
    private static async Task<IResult> Plan(
        double? fromLat,
        double? fromLon,
        double? toLat,
        double? toLon,
        DateTimeOffset? time,
        bool? arriveBy,
        string? cursor,
        ITransitPlanner planner,
        CancellationToken ct)
    {
        var from = Coordinates.TryCreate(fromLat, fromLon);
        var to = Coordinates.TryCreate(toLat, toLon);
        if (from is null || to is null || time is null)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { [from is null ? "from" : to is null ? "to" : "time"] = ["Start, Ziel und Zeit werden gebraucht."] },
                title: "Eingabe ungültig");
        }

        var plan = await planner.PlanAsync(new TransitPlanRequest(from.Value, to.Value, time.Value, arriveBy ?? false, cursor), ct);
        return TypedResults.Ok(plan);
    }
}
