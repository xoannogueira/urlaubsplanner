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

public static class FlightEndpoints
{
    /// <summary>LiteAPI-Sandbox erlaubt 5 Anfragen pro Sekunde – zwei parallel bleiben sicher darunter.</summary>
    private const int ParallelRequests = 2;
    private const int DefaultShiftDays = 3;

    public static IEndpointRouteBuilder MapFlightEndpoints(this IEndpointRouteBuilder app)
    {
        var flights = app.MapGroup("/api/flights").WithTags("Flüge");
        flights.MapGet("/status", (IFlightSearch search) => TypedResults.Ok(new { configured = search.IsConfigured }));
        flights.MapPost("/search", Search);
        flights.MapPost("/alternatives", Alternatives);
        flights.MapPost("/recheck", Recheck);
        return app;
    }

    private static async Task<IResult> Search(FlightSearchBody body, IFlightSearch search, TimeProvider clock, CancellationToken ct)
    {
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

        return TypedResults.Ok(new
        {
            Journeys = journeys.Select(JourneyResponse.From),
            Requests = requests.Count,
            Failed = results.Count(r => r.Result is null),
            Sandbox = results.Any(r => r.Result?.Sandbox == true),
            FetchedAt = clock.GetUtcNow(),
        });
    }

    /// <summary>
    /// Ausweichdaten: alle Strecken gemeinsam um ±1–3 Tage verschoben (gleiche Reisedauer).
    /// Eine Anfrage pro Zeitraum; pro Zeitraum kommt der günstigste Preis zurück.
    /// </summary>
    private static async Task<IResult> Alternatives(FlightAlternativesBody body, IFlightSearch search, TimeProvider clock, CancellationToken ct)
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
    private static async Task<IResult> Recheck(FlightRecheckBody body, IFlightSearch search, TimeProvider clock, CancellationToken ct)
    {
        var legs = FlightSignature.ParseLegs(body.Signature)
            ?? throw new DomainException("signature", "Dieser Flug lässt sich nicht erneut prüfen.");
        var request = FlightSearchRequest.Create(legs, body.Adults, body.Cabin ?? CabinClass.Economy, Today(clock));
        var result = await search.SearchAsync(request, ct);

        var parts = body.Signature.Split('#', 2);
        var journey = result.Journeys.FirstOrDefault(j => j.Signature == parts[0]);
        var fare = journey?.Fares.FirstOrDefault(f => parts.Length > 1 && string.Equals(f.Family, parts[1], StringComparison.OrdinalIgnoreCase))
            ?? journey?.Fares[0];

        return TypedResults.Ok(new
        {
            Available = journey is not null,
            Journey = journey is null ? null : JourneyResponse.From(journey),
            Fare = fare,
            // Andere Verbindungen derselben Strecke, falls der Flug weg ist.
            Alternatives = result.Journeys.Count,
            CheapestPrice = result.Journeys.Count > 0 ? result.Journeys.Min(j => j.TotalPrice) : (decimal?)null,
        });
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

    private static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
}

/// <summary>Verbindung für das Frontend, inkl. Gesamtpreis des günstigsten Tarifs.</summary>
public sealed record JourneyResponse(
    string Signature,
    IReadOnlyList<FlightJourneyLeg> Legs,
    int TotalMinutes,
    decimal TotalPrice,
    IReadOnlyList<FlightFare> Fares,
    string BookingUrl,
    string GoogleUrl)
{
    public static JourneyResponse From(FlightJourney j) =>
        new(j.Signature, j.Legs, j.TotalMinutes, j.TotalPrice, j.Fares, j.BookingUrl, j.GoogleUrl);
}
