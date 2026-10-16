using Urlaubsplanner.Api.Activities;
using Urlaubsplanner.Api.Contracts;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Api.Endpoints;

/// <summary>
/// REST-Endpunkte für Reisen, Etappen und Optionen.
/// Jede Änderung antwortet mit der ganzen, aktualisierten Reise. So braucht das Frontend
/// nach einer Änderung keinen zweiten Request und die Oberfläche bleibt flüssig.
/// </summary>
public static class TripEndpoints
{
    public static IEndpointRouteBuilder MapTripEndpoints(this IEndpointRouteBuilder app)
    {
        var trips = app.MapGroup("/api/trips").WithTags("Reisen");

        // Sobald eine Reise mit Etappen geöffnet oder geändert wird: Aktivitäten im Hintergrund vorladen.
        trips.AddEndpointFilter(async (context, next) =>
        {
            var result = await next(context).ConfigureAwait(false);
            if (result is IValueHttpResult { Value: TripResponse trip })
            {
                context.HttpContext.RequestServices.GetService<ActivityPrefetcher>()?.Enqueue(trip);
            }

            return result;
        });

        trips.MapGet("/", ListTrips);
        trips.MapPost("/", CreateTrip);
        trips.MapGet("/{tripId:guid}", GetTrip);
        trips.MapPut("/{tripId:guid}", UpdateTrip);
        trips.MapDelete("/{tripId:guid}", DeleteTrip);
        trips.MapGet("/{tripId:guid}/summary", GetSummary);

        trips.MapPost("/{tripId:guid}/stages", (Guid tripId, StageRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.AddStage(request.ToData(), clock.GetUtcNow()), ct));
        trips.MapPut("/{tripId:guid}/stages/{stageId:guid}", (Guid tripId, Guid stageId, StageRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.UpdateStage(stageId, request.ToData(), clock.GetUtcNow()), ct));
        trips.MapDelete("/{tripId:guid}/stages/{stageId:guid}", (Guid tripId, Guid stageId, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.RemoveStage(stageId, clock.GetUtcNow()), ct));

        trips.MapPost("/{tripId:guid}/options", (Guid tripId, OptionRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.AddOption(request.ToData(), clock.GetUtcNow()), ct));
        trips.MapPut("/{tripId:guid}/options/{optionId:guid}", (Guid tripId, Guid optionId, OptionRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.UpdateOption(optionId, request.ToData(), clock.GetUtcNow()), ct));
        trips.MapPatch("/{tripId:guid}/options/{optionId:guid}/status", (Guid tripId, Guid optionId, StatusRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.ChangeOptionStatus(optionId, request.Status, clock.GetUtcNow()), ct));
        trips.MapPatch("/{tripId:guid}/options/{optionId:guid}/price", (Guid tripId, Guid optionId, PriceRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.ConfirmOptionPrice(optionId, request.Price, clock.GetUtcNow()), ct));
        trips.MapDelete("/{tripId:guid}/options/{optionId:guid}", (Guid tripId, Guid optionId, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.RemoveOption(optionId, clock.GetUtcNow()), ct));

        // Packliste und Mitreisende/Kosten: die App schickt jeweils den ganzen Stand.
        trips.MapPut("/{tripId:guid}/packing", (Guid tripId, PackingList request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.SetPacking(request, clock.GetUtcNow()), ct));
        trips.MapPut("/{tripId:guid}/party", (Guid tripId, TripParty request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
            Change(repo, tripId, trip => trip.SetParty(request, clock.GetUtcNow()), ct));

        return app;
    }

    private static async Task<IResult> ListTrips(ITripRepository repo, CancellationToken ct)
    {
        var trips = await repo.ListAsync(ct);
        return TypedResults.Ok(trips.Select(TripListItem.From).ToList());
    }

    private static async Task<IResult> CreateTrip(TripRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct)
    {
        var trip = Trip.Create(request.ToData(), clock.GetUtcNow());
        await repo.AddAsync(trip, ct);
        return TypedResults.Created($"/api/trips/{trip.Id}", TripResponse.From(trip));
    }

    private static async Task<IResult> GetTrip(Guid tripId, ITripRepository repo, CancellationToken ct)
    {
        var trip = await repo.GetAsync(tripId, ct);
        return trip is null ? TripNotFound(tripId) : TypedResults.Ok(TripResponse.From(trip));
    }

    private static Task<IResult> UpdateTrip(Guid tripId, TripRequest request, ITripRepository repo, TimeProvider clock, CancellationToken ct) =>
        Change(repo, tripId, trip => trip.Update(request.ToData(), clock.GetUtcNow()), ct);

    private static async Task<IResult> DeleteTrip(Guid tripId, ITripRepository repo, CancellationToken ct) =>
        await repo.DeleteAsync(tripId, ct) ? TypedResults.NoContent() : TripNotFound(tripId);

    private static async Task<IResult> GetSummary(Guid tripId, ITripRepository repo, CancellationToken ct)
    {
        var trip = await repo.GetAsync(tripId, ct);
        return trip is null ? TripNotFound(tripId) : TypedResults.Ok(TripSummaryCalculator.Calculate(trip));
    }

    private static Task<IResult> Change(ITripRepository repo, Guid tripId, Action<Trip> change, CancellationToken ct) =>
        Change(repo, tripId, trip =>
        {
            change(trip);
            return trip;
        }, ct);

    private static async Task<IResult> Change<T>(ITripRepository repo, Guid tripId, Func<Trip, T> change, CancellationToken ct)
    {
        var updated = await repo.UpdateAsync(
            tripId,
            trip =>
            {
                change(trip);
                return TripResponse.From(trip);
            },
            ct);
        return updated is null ? TripNotFound(tripId) : TypedResults.Ok(updated);
    }

    private static Microsoft.AspNetCore.Http.HttpResults.ProblemHttpResult TripNotFound(Guid tripId) =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Reise nicht gefunden", detail: $"Reise {tripId} gibt es nicht.");
}
