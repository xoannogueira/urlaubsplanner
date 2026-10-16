using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Weather;
using Urlaubsplanner.Infrastructure.Weather;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class OpenMeteoWeatherTests
{
    private static readonly Coordinates Lisbon = Coordinates.TryCreate(38.72, -9.14)!.Value;
    private static readonly DateOnly Today = new(2026, 10, 16);

    private sealed class Clock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(Today.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero);
    }

    private sealed class FakeHandler(Func<Uri, Func<DateOnly, (int Code, double Max, double Min, double Rain)>?> day) : HttpMessageHandler
    {
        public List<Uri> Calls { get; } = [];

        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri!;
            Calls.Add(uri);
            if (Status != HttpStatusCode.OK)
            {
                return Task.FromResult(new HttpResponseMessage(Status));
            }

            var query = uri.Query.TrimStart('?').Split('&').Select(p => p.Split('=')).ToDictionary(p => p[0], p => p[1]);
            var start = DateOnly.Parse(query["start_date"], CultureInfo.InvariantCulture);
            var end = DateOnly.Parse(query["end_date"], CultureInfo.InvariantCulture);
            var values = day(uri)!;
            var dates = Enumerable.Range(0, end.DayNumber - start.DayNumber + 1).Select(start.AddDays).ToList();
            var forecast = uri.Host.StartsWith("forecast", StringComparison.Ordinal);
            var daily = new Dictionary<string, object>
            {
                ["time"] = dates.Select(d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                ["weather_code"] = dates.Select(d => values(d).Code),
                ["temperature_2m_max"] = dates.Select(d => values(d).Max),
                ["temperature_2m_min"] = dates.Select(d => values(d).Min),
                ["precipitation_sum"] = dates.Select(d => values(d).Rain),
            };
            if (forecast)
            {
                daily["precipitation_probability_max"] = dates.Select(_ => 40);
            }

            var body = JsonSerializer.Serialize(new { latitude = 38.72, longitude = -9.14, daily });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    private static (OpenMeteoWeather Weather, FakeHandler Handler) Create(Func<DateOnly, (int, double, double, double)> values)
    {
        var handler = new FakeHandler(_ => values);
        var options = Options.Create(new WeatherOptions { ForecastUrl = "https://forecast.test/v1/forecast", ArchiveUrl = "https://archive.test/v1/archive" });
        var weather = new OpenMeteoWeather(new HttpClient(handler), new MemoryCache(new MemoryCacheOptions()), options, new Clock(), NullLogger<OpenMeteoWeather>.Instance);
        return (weather, handler);
    }

    [Fact]
    public async Task Naechste_Tage_kommen_aus_der_Vorhersage()
    {
        var (weather, handler) = Create(_ => (3, 21.4, 14.2, 0.3));
        var result = await weather.GetAsync(Lisbon, Today.AddDays(2), Today.AddDays(4), CancellationToken.None);

        Assert.Equal(3, result.Days.Count);
        Assert.All(result.Days, d => Assert.Equal(WeatherSource.Forecast, d.Source));
        Assert.Equal(Today.AddDays(2), result.Days[0].Date);
        Assert.Equal(21.4, result.Days[0].TempMax);
        Assert.Equal(40, result.Days[0].RainChance);
        var call = Assert.Single(handler.Calls).ToString();
        Assert.Contains("latitude=38.7200&longitude=-9.1400", call, StringComparison.Ordinal);
        Assert.Contains("start_date=2026-10-18&end_date=2026-10-20", call, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Spaetere_Tage_sind_der_Schnitt_der_letzten_fuenf_Jahre()
    {
        // Jedes Jahr 2 °C wärmer, nur 2025 und 2026 regnerisch – Schnitt der Maitage 2022–2026.
        var (weather, handler) = Create(d => (d.Year >= 2025 ? 61 : 0, 20 + (d.Year - 2021) * 2, 12, d.Year >= 2025 ? 5 : 0));
        var day = new DateOnly(2027, 5, 12);
        var result = await weather.GetAsync(Lisbon, day, day, CancellationToken.None);

        var typical = Assert.Single(result.Days);
        Assert.Equal(WeatherSource.Climate, typical.Source);
        Assert.Equal(day, typical.Date);
        Assert.Equal(26, typical.TempMax);
        Assert.Equal(12, typical.TempMin);
        Assert.Equal(2, typical.PrecipitationMm);
        Assert.Equal(40, typical.RainChance);
        Assert.Equal(5, typical.Years);
        Assert.Equal(0, typical.Code);
        var call = Assert.Single(handler.Calls).ToString();
        Assert.StartsWith("https://archive.test/", call, StringComparison.Ordinal);
        Assert.Contains("start_date=2022-05-12&end_date=2026-05-12", call, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Reise_ueber_die_Vorhersagegrenze_nutzt_beide_Quellen()
    {
        var (weather, handler) = Create(_ => (2, 18, 10, 0));
        var result = await weather.GetAsync(Lisbon, Today.AddDays(14), Today.AddDays(17), CancellationToken.None);

        Assert.Equal(
            [WeatherSource.Forecast, WeatherSource.Forecast, WeatherSource.Climate, WeatherSource.Climate],
            result.Days.Select(d => d.Source));
        Assert.Equal(2, handler.Calls.Count);
    }

    [Fact]
    public void Archivtage_liegen_vor_der_Archivluecke()
    {
        // 20.10.2026 liegt erst in 4 Tagen – 2025 bis 2021 werden genommen; der 10.10.2026 ist noch nicht im Archiv.
        Assert.Equal(
            [new DateOnly(2025, 10, 20), new DateOnly(2024, 10, 20), new DateOnly(2023, 10, 20), new DateOnly(2022, 10, 20), new DateOnly(2021, 10, 20)],
            OpenMeteoWeather.SampleDates(new DateOnly(2026, 10, 20), Today));
        Assert.Equal(new DateOnly(2026, 2, 28), OpenMeteoWeather.SampleDates(new DateOnly(2028, 2, 29), Today)[0]);
        Assert.Equal(new DateOnly(2025, 10, 12), OpenMeteoWeather.SampleDates(new DateOnly(2027, 10, 12), Today)[0]);
    }

    [Theory]
    [InlineData(new[] { 0, 1, 2 }, 0)]
    [InlineData(new[] { 61, 63, 80, 0, 3 }, 61)]
    [InlineData(new[] { 71, 61, 73 }, 71)]
    [InlineData(new[] { 3, 45, 0, 0 }, 0)]
    public void Typische_Wetterlage(int[] codes, int expected) => Assert.Equal(expected, OpenMeteoWeather.TypicalCode(codes));

    [Fact]
    public async Task Gleiche_Abfrage_kommt_aus_dem_Speicher()
    {
        var (weather, handler) = Create(_ => (0, 25, 15, 0));
        await weather.GetAsync(Lisbon, Today.AddDays(1), Today.AddDays(3), CancellationToken.None);
        await weather.GetAsync(Lisbon, Today.AddDays(1), Today.AddDays(3), CancellationToken.None);

        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Ausfall_wird_zur_verstaendlichen_Meldung()
    {
        var (weather, handler) = Create(_ => (0, 25, 15, 0));
        handler.Status = HttpStatusCode.ServiceUnavailable;

        await Assert.ThrowsAsync<WeatherUnavailableException>(() => weather.GetAsync(Lisbon, Today, Today, CancellationToken.None));
    }
}
