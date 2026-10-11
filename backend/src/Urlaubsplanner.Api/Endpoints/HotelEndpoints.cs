using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Hotels;

namespace Urlaubsplanner.Api.Endpoints;

/// <summary>
/// Entweder Umkreissuche (Latitude/Longitude/RadiusMeters) oder gezielt bestimmte Hotels (HotelIds).
/// </summary>
public sealed record HotelSearchBody(
    double? Latitude,
    double? Longitude,
    DateOnly Checkin,
    DateOnly Checkout,
    int Adults,
    int? Rooms,
    int? RadiusMeters,
    IReadOnlyList<string>? HotelIds = null);

/// <param name="ShiftDays">Wie viele Tage früher/später geprüft wird (Standard 3).</param>
public sealed record HotelAlternativesBody(
    IReadOnlyList<string> HotelIds,
    DateOnly Checkin,
    DateOnly Checkout,
    int Adults,
    int? Rooms,
    int? ShiftDays);

public static class HotelEndpoints
{
    /// <summary>LiteAPI-Sandbox erlaubt 5 Anfragen pro Sekunde – zwei parallel bleiben sicher darunter.</summary>
    private const int ParallelRequests = 2;

    public static IEndpointRouteBuilder MapHotelEndpoints(this IEndpointRouteBuilder app)
    {
        var hotels = app.MapGroup("/api/hotels").WithTags("Hotels");

        // Sagt dem Frontend, ob die Suche eingerichtet ist – ohne den Key preiszugeben.
        hotels.MapGet("/status", (IHotelSearch search) => TypedResults.Ok(new { configured = search.IsConfigured }));
        hotels.MapPost("/search", Search);
        hotels.MapPost("/nearby", Nearby);
        hotels.MapPost("/alternatives", Alternatives);

        return app;
    }

    private static async Task<IResult> Search(HotelSearchBody body, IHotelSearch search, TimeProvider clock, CancellationToken ct)
    {
        var request = ToRequest(body, Today(clock));
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

    /// <summary>Alle Hotels im Umkreis, auch ausgebuchte (für den Schalter „Ausgebuchte zeigen“).</summary>
    private static async Task<IResult> Nearby(HotelSearchBody body, IHotelSearch search, TimeProvider clock, CancellationToken ct)
    {
        var request = ToRequest(body with { HotelIds = null }, Today(clock));
        var hotels = await search.ListAsync(request, ct);
        return TypedResults.Ok(new { hotels });
    }

    /// <summary>
    /// Prüft die ausgewählten Hotels für verschobene Zeiträume (gleiche Nächteanzahl).
    /// Eine LiteAPI-Abfrage pro Zeitraum, egal wie viele Hotels.
    /// </summary>
    private static async Task<IResult> Alternatives(HotelAlternativesBody body, IHotelSearch search, TimeProvider clock, CancellationToken ct)
    {
        var today = Today(clock);
        var windows = HotelDateAlternatives.Windows(body.Checkin, body.Checkout, today, body.ShiftDays ?? HotelDateAlternatives.DefaultShiftDays);
        if (windows.Count == 0)
        {
            throw new DomainException("checkin", "Für diesen Zeitraum gibt es keine Ausweichdaten in der Zukunft.");
        }

        // Validiert Hotels, Personen und Zimmer einmal vorab; die Zeiträume selbst sind schon geprüft.
        var first = windows[0];
        var baseRequest = HotelSearchRequest.ForHotels(body.HotelIds, first.Checkin, first.Checkout, body.Adults, RoomsOrDefault(body.Rooms, body.Adults), today);

        using var gate = new SemaphoreSlim(ParallelRequests);
        var results = await Task.WhenAll(windows.Select(async window =>
        {
            await gate.WaitAsync(ct);
            try
            {
                var found = await search.SearchAsync(baseRequest.WithDates(window.Checkin, window.Checkout), ct);
                return (window, Result: found, Failed: false);
            }
            catch (HotelSearchUnavailableException)
            {
                return (window, Result: (HotelSearchResult?)null, Failed: true);
            }
            finally
            {
                gate.Release();
            }
        }));

        if (results.All(r => r.Failed))
        {
            throw new HotelSearchUnavailableException("Die Hotelsuche ist gerade nicht erreichbar.");
        }

        return TypedResults.Ok(new
        {
            Windows = results.Select(r => new
            {
                r.window.Checkin,
                r.window.Checkout,
                r.window.ShiftDays,
                Nights = r.window.Checkout.DayNumber - r.window.Checkin.DayNumber,
                r.Failed,
                Hotels = r.Result?.Hotels ?? [],
            }),
            Requests = windows.Count,
            Sandbox = results.Any(r => r.Result?.Sandbox == true),
        });
    }

    private static HotelSearchRequest ToRequest(HotelSearchBody body, DateOnly today)
    {
        var rooms = RoomsOrDefault(body.Rooms, body.Adults);
        if (body.HotelIds is { Count: > 0 })
        {
            return HotelSearchRequest.ForHotels(body.HotelIds, body.Checkin, body.Checkout, body.Adults, rooms, today);
        }

        if (body.Latitude is not { } lat || body.Longitude is not { } lng)
        {
            throw new DomainException("latitude", "Für die Suche fehlt der Ort.");
        }

        return HotelSearchRequest.Create(lat, lng, body.RadiusMeters ?? 3000, body.Checkin, body.Checkout, body.Adults, rooms, today);
    }

    private static int RoomsOrDefault(int? rooms, int adults) => Math.Max(1, rooms ?? (int)Math.Ceiling(adults / 2.0));

    private static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
}
