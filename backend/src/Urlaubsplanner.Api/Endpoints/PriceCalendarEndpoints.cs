using Urlaubsplanner.Api.PriceStats;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

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
        // Der konkrete günstigste Flug eines Tages laut Aviasales (kostenlos) – Hin- und ggf. Rückflug, mit Link zum Angebot.
        group.MapGet("/day-flights", async (string origin, string destination, DateOnly date, int? nights, IIndicativeFares fares, CancellationToken ct) =>
        {
            var from = FlightSearchRequest.NormalizeCode(origin);
            var to = FlightSearchRequest.NormalizeCode(destination);
            if (!FlightSearchRequest.IsAirportCode(from) || !FlightSearchRequest.IsAirportCode(to))
            {
                throw new DomainException("origin", "Bitte gültige Flughafen-Codes angeben (z. B. STR).");
            }

            if (nights is < 1 or > 60)
            {
                throw new DomainException("nights", "Reisedauer zwischen 1 und 60 Nächten.");
            }

            try
            {
                var outbound = await fares.DayAsync(from, to, date, ct);
                var inbound = nights is { } n ? await fares.DayAsync(to, from, date.AddDays(n), ct) : [];
                return Results.Ok(new { Outbound = outbound.Take(3), Inbound = inbound.Take(3) });
            }
            catch (IndicativeFaresException e)
            {
                return Results.Problem(e.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        });
        group.MapPost("/{id:guid}/cancel", (Guid id, PriceCalendarRunner runner) => runner.Cancel(id) ? Results.Accepted() : Results.NotFound());
        group.MapDelete("/{id:guid}", (Guid id, PriceCalendarStore store, PriceCalendarRunner runner) =>
        {
            runner.Cancel(id);
            return store.Remove(id) ? Results.NoContent() : Results.NotFound();
        });
        return app;
    }
}
