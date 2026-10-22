using Urlaubsplanner.Api.PriceStats;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record FlightLegOptionsBody(IReadOnlyList<string> Origins, IReadOnlyList<string> Destinations, DateOnly Date);

/// <summary>Suche; pro Strecke dürfen mehrere Flughäfen angegeben werden (z. B. alle im Umkreis).</summary>
public sealed record FlightSearchBody(IReadOnlyList<FlightLegOptionsBody> Legs, int Adults, CabinClass? Cabin);

public sealed record FlightLegBody(string Origin, string Destination, DateOnly Date);

public sealed record FlightAlternativesBody(IReadOnlyList<FlightLegBody> Legs, int Adults, CabinClass? Cabin, int? ShiftDays);

/// <param name="Signature">Kennung eines gemerkten Flugs (ExternalId der Option, ggf. mit „#Tarif“).</param>
public sealed record FlightRecheckBody(string Signature, int Adults, CabinClass? Cabin);

/// <param name="Continuation">Kennung einer Teil-Verbindung (z. B. gewählter Hinflug), siehe FlightJourney.Continuation.</param>
public sealed record FlightContinueBody(string Continuation);

public static class FlightEndpoints
{
    /// <summary>LiteAPI-Sandbox erlaubt 5 Anfragen pro Sekunde – zwei parallel bleiben sicher darunter.</summary>
    private const int ParallelRequests = 2;
    private const int DefaultShiftDays = 3;

    public static IEndpointRouteBuilder MapFlightEndpoints(this IEndpointRouteBuilder app)
    {
        var flights = app.MapGroup("/api/flights").WithTags("Flüge");
        flights.MapGet("/status", Status);
        flights.MapPost("/search", Search);
        flights.MapPost("/continue", Continue);
        flights.MapPost("/alternatives", Alternatives);
        flights.MapPost("/recheck", Recheck);
        return app;
    }

    private static async Task<IResult> Status(IFlightSearch search, CancellationToken ct)
    {
        var quota = search is IFlightSearchQuota q && search.IsConfigured ? await q.GetQuotaAsync(ct) : null;
        return TypedResults.Ok(new
        {
            Configured = search.IsConfigured,
            search.Provider,
            // Google liefert erst Hinflüge, Rückflüge kommen nach der Wahl (eine Suche mehr).
            Stepwise = search is IStepwiseFlightSearch,
            Quota = quota,
        });
    }

    private static async Task<IResult> Search(FlightSearchBody body, IFlightSearch search, TimeProvider clock, PriceArchive archive, CancellationToken ct)
    {
        var returnDate = body.Legs is { Count: > 1 } l ? l[^1].Date : (DateOnly?)null;
        if (search is IMultiAirportFlightSearch multi)
        {
            if (!search.IsConfigured)
            {
                throw new FlightSearchNotConfiguredException();
            }

            var combined = FlightQuery.Combine(
                body.Legs?.Select(l => new FlightLegOptions(l.Origins, l.Destinations, l.Date)).ToList(),
                body.Adults,
                body.Cabin ?? CabinClass.Economy,
                Today(clock));
            var found = await multi.SearchAsync(combined, ct);
            // Fürs Preisarchiv merken (keine zusätzliche Suche) – plus Googles Preisverlauf zur günstigsten Verbindung.
            archive.Record(found.Journeys, returnDate, "suche", clock.GetUtcNow());
            if (found.Journeys.MinBy(j => j.TotalPrice) is { Legs.Count: > 0 } cheapest)
            {
                archive.RecordHistory(cheapest.Legs[0].Origin, cheapest.Legs[0].Destination, body.Legs![0].Date, returnDate, found.Insights, clock.GetUtcNow());
            }

            return TypedResults.Ok(new
            {
                Journeys = found.Journeys.Select(JourneyResponse.From),
                Requests = 1,
                Failed = 0,
                found.Sandbox,
                FetchedAt = clock.GetUtcNow(),
            });
        }

        var requests = FlightQuery.Expand(
            body.Legs?.Select(l => new FlightLegOptions(l.Origins, l.Destinations, l.Date)).ToList(),
            body.Adults,
            body.Cabin ?? CabinClass.Economy,
            Today(clock));

        var results = await RunAll(requests, search, ct);
        if (results.All(r => r.Result is null))
        {
            throw new FlightSearchUnavailableException("Die Flugsuche ist gerade nicht erreichbar.");
        }

        // Gleiche Verbindung aus mehreren Kombinationen nur einmal, mit dem besten Preis.
        var journeys = results
            .SelectMany(r => r.Result?.Journeys ?? [])
            .GroupBy(j => j.Signature)
            .Select(g => g.MinBy(j => j.TotalPrice)!)
            .OrderBy(j => j.TotalPrice)
            .ThenBy(j => j.TotalMinutes)
            .ToList();
        archive.Record(journeys, returnDate, "suche", clock.GetUtcNow());

        return TypedResults.Ok(new
        {
            Journeys = journeys.Select(JourneyResponse.From),
            Requests = requests.Count,
            Failed = results.Count(r => r.Result is null),
            Sandbox = results.Any(r => r.Result?.Sandbox == true),
            FetchedAt = clock.GetUtcNow(),
        });
    }

    /// <summary>Nächste Strecke zu einer Teil-Verbindung, z. B. die Rückflüge zum gewählten Hinflug.</summary>
    private static async Task<IResult> Continue(FlightContinueBody body, IFlightSearch search, TimeProvider clock, PriceArchive archive, CancellationToken ct)
    {
        if (search is not IStepwiseFlightSearch stepwise)
        {
            throw new DomainException("continuation", "Diese Flugsuche liefert Verbindungen immer vollständig.");
        }

        if (string.IsNullOrWhiteSpace(body.Continuation))
        {
            throw new DomainException("continuation", "Fehlt.");
        }

        var result = await stepwise.ContinueAsync(body.Continuation, ct);
        archive.Record(result.Journeys, null, "suche", clock.GetUtcNow());
        return TypedResults.Ok(new
        {
            Journeys = result.Journeys.Select(JourneyResponse.From),
            Requests = 1,
            Failed = 0,
            result.Sandbox,
            FetchedAt = clock.GetUtcNow(),
        });
    }

    /// <summary>
    /// Ausweichdaten: alle Strecken gemeinsam um ±1–3 Tage verschoben (gleiche Reisedauer).
    /// Eine Anfrage pro Zeitraum; pro Zeitraum kommt der günstigste Preis zurück.
    /// </summary>
    private static async Task<IResult> Alternatives(FlightAlternativesBody body, IFlightSearch search, TimeProvider clock, PriceArchive archive, CancellationToken ct)
    {
        var today = Today(clock);
        var request = FlightSearchRequest.Create(
            body.Legs?.Select(l => new FlightLeg(l.Origin, l.Destination, l.Date)),
            body.Adults,
            body.Cabin ?? CabinClass.Economy,
            today);
        var maxShift = body.ShiftDays ?? DefaultShiftDays;
        if (maxShift is < 1 or > 7)
        {
            throw new DomainException("shiftDays", "Muss zwischen 1 und 7 liegen.");
        }

        var shifts = Enumerable.Range(1, maxShift)
            .SelectMany(d => new[] { -d, d })
            .Where(s => request.Legs[0].Date.AddDays(s) >= today && request.Legs[^1].Date.AddDays(s) <= today.AddDays(FlightSearchRequest.MaxDaysAhead))
            .ToList();
        if (shifts.Count == 0)
        {
            throw new DomainException("legs", "Für diesen Zeitraum gibt es keine Ausweichdaten.");
        }

        var results = await RunAll([.. shifts.Select(request.ShiftedBy)], search, ct);
        if (results.All(r => r.Result is null))
        {
            throw new FlightSearchUnavailableException("Die Flugsuche ist gerade nicht erreichbar.");
        }

        foreach (var (shifted, result) in results.Where(r => r.Result is not null))
        {
            archive.Record(result!.Journeys, shifted.Legs.Count > 1 ? shifted.Legs[^1].Date : null, "andere-daten", clock.GetUtcNow());
        }

        return TypedResults.Ok(new
        {
            Windows = shifts.Zip(results, (shift, r) => new
            {
                ShiftDays = shift,
                Dates = r.Request.Legs.Select(l => l.Date),
                CheapestPrice = r.Result?.Journeys.Count > 0 ? r.Result.Journeys.Min(j => j.TotalPrice) : (decimal?)null,
                Count = r.Result?.Journeys.Count ?? 0,
                Failed = r.Result is null,
            }).OrderBy(w => w.ShiftDays),
            Requests = shifts.Count,
        });
    }

    /// <summary>Gemerkten Flug erneut suchen: gibt es exakt diese Flüge noch, und was kostet der Tarif jetzt?</summary>
    private static async Task<IResult> Recheck(FlightRecheckBody body, IFlightSearch search, TimeProvider clock, PriceArchive archive, CancellationToken ct)
    {
        var outcome = await RecheckAsync(search, body.Signature, body.Adults, body.Cabin ?? CabinClass.Economy, Today(clock), ct);
        if (outcome.Journey is not null)
        {
            archive.Record([outcome.Journey], null, "prüfung", clock.GetUtcNow());
        }

        var result = outcome.Result;
        return TypedResults.Ok(new
        {
            Available = outcome.Journey is not null,
            Journey = outcome.Journey is null ? null : JourneyResponse.From(outcome.Journey),
            outcome.Fare,
            // Andere Verbindungen derselben Strecke, falls der Flug weg ist.
            Alternatives = result.Journeys.Count,
            CheapestPrice = result.Journeys.Count > 0 ? result.Journeys.Min(j => j.TotalPrice) : (decimal?)null,
        });
    }

    /// <summary>Gemeinsam für „Preis prüfen“ und den Preiswächter.</summary>
    internal static async Task<(FlightJourney? Journey, FlightFare? Fare, FlightSearchResult Result)> RecheckAsync(
        IFlightSearch search,
        string signature,
        int adults,
        CabinClass cabin,
        DateOnly today,
        CancellationToken ct)
    {
        var legs = FlightSignature.ParseLegs(signature)
            ?? throw new DomainException("signature", "Dieser Flug lässt sich nicht erneut prüfen.");
        var request = FlightSearchRequest.Create(legs, adults, cabin, today);
        if (!search.IsConfigured)
        {
            throw new FlightSearchNotConfiguredException();
        }

        var parts = signature.Split('#', 2);
        FlightSearchResult result;
        FlightJourney? journey;
        if (search is IStepwiseFlightSearch stepwise)
        {
            (journey, result) = await stepwise.FindAsync(request, signature, ct);
        }
        else
        {
            result = await search.SearchAsync(request, ct);
            journey = result.Journeys.FirstOrDefault(j => j.Signature == parts[0]);
        }

        // Gemerkter Tarif, sonst der günstigste (z. B. Flug mit LiteAPI gemerkt, jetzt über Google geprüft).
        var fare = journey?.Fares.FirstOrDefault(f => parts.Length > 1 && string.Equals(f.Family, parts[1], StringComparison.OrdinalIgnoreCase))
            ?? journey?.Fares[0];
        return (journey, fare, result);
    }

    private static async Task<List<(FlightSearchRequest Request, FlightSearchResult? Result)>> RunAll(
        IReadOnlyList<FlightSearchRequest> requests,
        IFlightSearch search,
        CancellationToken ct)
    {
        if (!search.IsConfigured)
        {
            throw new FlightSearchNotConfiguredException();
        }

        using var gate = new SemaphoreSlim(ParallelRequests);
        var tasks = requests.Select(async request =>
        {
            await gate.WaitAsync(ct);
            try
            {
                return (request, (FlightSearchResult?)await search.SearchAsync(request, ct));
            }
            catch (FlightSearchUnavailableException)
            {
                return (request, null);
            }
            finally
            {
                gate.Release();
            }
        });
        return [.. await Task.WhenAll(tasks)];
    }

    internal static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
}

/// <summary>Verbindung für das Frontend, inkl. Gesamtpreis des günstigsten Tarifs.</summary>
public sealed record JourneyResponse(
    string Signature,
    IReadOnlyList<FlightJourneyLeg> Legs,
    int TotalMinutes,
    decimal TotalPrice,
    IReadOnlyList<FlightFare> Fares,
    string BookingUrl,
    string GoogleUrl,
    string? Continuation)
{
    public static JourneyResponse From(FlightJourney j) =>
        new(j.Signature, j.Legs, j.TotalMinutes, j.TotalPrice, j.Fares, j.BookingUrl, j.GoogleUrl, j.Continuation);
}
