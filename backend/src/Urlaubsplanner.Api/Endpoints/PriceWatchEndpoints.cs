using Urlaubsplanner.Api.PriceWatch;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record PriceWatchRequest(Guid TripId, Guid OptionId);

/// <summary>Preiswächter: Flug beobachten, beenden, Hinweis „Preis gefallen“ wegklicken.</summary>
public static class PriceWatchEndpoints
{
    public static IEndpointRouteBuilder MapPriceWatchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/price-watches").WithTags("Preiswächter");
        group.MapGet("/", (PriceWatchStore store) => TypedResults.Ok(store.List()));
        group.MapPost("/", Add);
        group.MapDelete("/{optionId:guid}", (Guid optionId, PriceWatchStore store) =>
            store.Remove(optionId) ? Results.NoContent() : Results.NotFound());
        group.MapPost("/{optionId:guid}/seen", (Guid optionId, PriceWatchStore store) =>
            store.Update(optionId, w => w with { DropFrom = null }) is { } updated ? Results.Ok(updated) : Results.NotFound());
        return app;
    }

    private static async Task<IResult> Add(PriceWatchRequest request, ITripRepository repo, PriceWatchStore store, TimeProvider clock, CancellationToken ct)
    {
        var trip = await repo.GetAsync(request.TripId, ct) ?? throw new NotFoundException("Reise", request.TripId);
        var option = trip.Options.FirstOrDefault(o => o.Id == request.OptionId) ?? throw new NotFoundException("Option", request.OptionId);
        if (option.Kind != OptionKind.Flight || option.ExternalId is null || option.Provider is not ("serpapi" or "liteapi"))
        {
            throw new DomainException("optionId", "Nur Flüge aus der Flugsuche lassen sich beobachten.");
        }

        var price = option.TotalPrice(trip.Travelers) ?? 0m;
        var entry = store.Add(new PriceWatchEntry(
            trip.Id,
            option.Id,
            option.Title,
            option.ExternalId,
            Math.Clamp(trip.Travelers, 1, 9),
            price,
            null,
            null,
            false,
            null,
            null,
            clock.GetUtcNow()));
        return TypedResults.Ok(entry);
    }
}
