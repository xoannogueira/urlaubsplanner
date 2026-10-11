using Urlaubsplanner.Domain.Hotels;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record HotelSearchBody(
    double Latitude,
    double Longitude,
    DateOnly Checkin,
    DateOnly Checkout,
    int Adults,
    int? Rooms,
    int? RadiusMeters);

public static class HotelEndpoints
{
    public static IEndpointRouteBuilder MapHotelEndpoints(this IEndpointRouteBuilder app)
    {
        var hotels = app.MapGroup("/api/hotels").WithTags("Hotels");

        // Sagt dem Frontend, ob die Suche eingerichtet ist – ohne den Key preiszugeben.
        hotels.MapGet("/status", (IHotelSearch search) => TypedResults.Ok(new { configured = search.IsConfigured }));
        hotels.MapPost("/search", Search);

        return app;
    }

    private static async Task<IResult> Search(HotelSearchBody body, IHotelSearch search, TimeProvider clock, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
        var rooms = body.Rooms ?? (int)Math.Ceiling(body.Adults / 2.0);
        var request = HotelSearchRequest.Create(
            body.Latitude,
            body.Longitude,
            body.RadiusMeters ?? 3000,
            body.Checkin,
            body.Checkout,
            body.Adults,
            Math.Max(1, rooms),
            today);

        var result = await search.SearchAsync(request, ct);
        return TypedResults.Ok(new
        {
            result.Hotels,
            result.Sandbox,
            result.FetchedAt,
            request.Nights,
            request.Rooms,
            request.RadiusMeters,
        });
    }
}
