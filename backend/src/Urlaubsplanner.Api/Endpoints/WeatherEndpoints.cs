using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Weather;

namespace Urlaubsplanner.Api.Endpoints;

public static class WeatherEndpoints
{
    public static IEndpointRouteBuilder MapWeatherEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/weather", Get).WithTags("Wetter");
        return app;
    }

    /// <summary>
    /// GET /api/weather?lat=38.72&amp;lon=-9.14&amp;from=2027-05-12&amp;to=2027-05-17
    /// Wetter pro Tag (Open-Meteo, kostenlos): Vorhersage für die nächsten 16 Tage, sonst typisches Wetter der letzten 5 Jahre.
    /// </summary>
    private static async Task<IResult> Get(double? lat, double? lon, DateOnly? from, DateOnly? to, IWeatherService weather, CancellationToken ct)
    {
        var at = Coordinates.TryCreate(lat, lon);
        if (at is null || from is null || to is null)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { [at is null ? "lat" : "from"] = ["Ort und Zeitraum werden gebraucht."] },
                title: "Eingabe ungültig");
        }

        return TypedResults.Ok(await weather.GetAsync(at.Value, from.Value, to.Value, ct));
    }
}
