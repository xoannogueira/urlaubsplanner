using Urlaubsplanner.Api.PriceStats;

namespace Urlaubsplanner.Api.Endpoints;

/// <summary>Preiskalender: über mehrere Monate pro Abflugtag den günstigsten Preis laden, speichern und anzeigen.</summary>
public static class PriceCalendarEndpoints
{
    public static IEndpointRouteBuilder MapPriceCalendarEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/price-calendars").WithTags("Preiskalender");

        // Kosten vorab: so viele Google-Suchen würde der Kalender brauchen.
        group.MapPost("/preview", (PriceCalendarRequest request, TimeProvider clock) =>
            TypedResults.Ok(new { Searches = PriceCalendarRules.Dates(request, FlightEndpoints.Today(clock)).Count }));
        group.MapPost("/", async (PriceCalendarRequest request, PriceCalendarRunner runner, CancellationToken ct) =>
            TypedResults.Ok(await runner.StartAsync(request, ct)));
        // Höchstens ~100 Tage pro Kalender – die Liste darf die Tagespreise mitbringen.
        group.MapGet("/", (PriceCalendarStore store) => TypedResults.Ok(store.List()));
        group.MapGet("/{id:guid}", (Guid id, PriceCalendarStore store, TimeProvider clock) =>
            store.Update(id, c => c with { LastUsedAt = clock.GetUtcNow() }) is { } calendar ? Results.Ok(calendar) : Results.NotFound());
        // Kostenlose Quelle (Aviasales): Stand der Prüfung beim Start, auf Wunsch neu prüfen.
        app.MapGet("/api/price-source", (PriceSourceMonitor monitor) => TypedResults.Ok(monitor.Current)).WithTags("Preiskalender");
        app.MapPost("/api/price-source/check", async (PriceSourceMonitor monitor, CancellationToken ct) => TypedResults.Ok(await monitor.CheckAsync(ct)))
            .WithTags("Preiskalender");
        group.MapPost("/{id:guid}/cancel", (Guid id, PriceCalendarRunner runner) => runner.Cancel(id) ? Results.Accepted() : Results.NotFound());
        group.MapDelete("/{id:guid}", (Guid id, PriceCalendarStore store, PriceCalendarRunner runner) =>
        {
            runner.Cancel(id);
            return store.Remove(id) ? Results.NoContent() : Results.NotFound();
        });
        return app;
    }
}
