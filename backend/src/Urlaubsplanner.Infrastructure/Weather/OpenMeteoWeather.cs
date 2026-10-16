using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Weather;

namespace Urlaubsplanner.Infrastructure.Weather;

public sealed class WeatherOptions
{
    public const string Section = "Weather";

    /// <summary>Open-Meteo: kostenlos ohne Key für nicht-kommerzielle Nutzung (unter 10.000 Abfragen/Tag), Daten CC BY 4.0.</summary>
    public string ForecastUrl { get; set; } = "https://api.open-meteo.com/v1/forecast";

    public string ArchiveUrl { get; set; } = "https://archive-api.open-meteo.com/v1/archive";
}

/// <summary>
/// Wetter pro Tag über Open-Meteo: Tage in den nächsten 16 Tagen aus der Vorhersage, alle anderen als typisches Wetter
/// (Mittel der letzten 5 Jahre am selben Kalendertag, aus dem Wetterarchiv).
/// </summary>
public sealed partial class OpenMeteoWeather(
    HttpClient http,
    IMemoryCache cache,
    IOptions<WeatherOptions> options,
    TimeProvider clock,
    ILogger<OpenMeteoWeather> logger) : IWeatherService
{
    /// <summary>Vorhersage reicht bis heute + 15 Tage.</summary>
    internal const int ForecastDays = 16;

    /// <summary>Das Archiv hängt ein paar Tage hinterher.</summary>
    internal const int ArchiveDelayDays = 7;

    internal const int ClimateYears = 5;

    internal const int MaxDays = 62;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<WeatherOutlook> GetAsync(Coordinates at, DateOnly firstDay, DateOnly lastDay, CancellationToken cancellationToken)
    {
        var (from, to) = (firstDay, lastDay);
        if (to < from)
        {
            (from, to) = (to, from);
        }

        if (to.DayNumber - from.DayNumber >= MaxDays)
        {
            to = from.AddDays(MaxDays - 1);
        }

        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var dates = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1).Select(from.AddDays).ToList();
        var forecastDates = dates.Where(d => IsForecastDay(d, today)).ToList();
        var climateDates = dates.Where(d => !IsForecastDay(d, today)).ToList();

        var result = new Dictionary<DateOnly, WeatherDay>();
        if (forecastDates.Count > 0)
        {
            var url = ForecastUrl(options.Value.ForecastUrl, at, forecastDates[0], forecastDates[^1]);
            var daily = await FetchAsync(url, TimeSpan.FromHours(1), cancellationToken).ConfigureAwait(false);
            foreach (var day in MapForecast(daily))
            {
                result[day.Date] = day;
            }
        }

        if (climateDates.Count > 0)
        {
            var samples = climateDates.ToDictionary(d => d, d => SampleDates(d, today));
            var all = samples.Values.SelectMany(s => s).ToList();
            if (all.Count > 0)
            {
                var url = ArchiveUrl(options.Value.ArchiveUrl, at, all.Min(), all.Max());
                var daily = await FetchAsync(url, TimeSpan.FromDays(30), cancellationToken).ConfigureAwait(false);
                foreach (var day in MapClimate(daily, samples))
                {
                    result[day.Date] = day;
                }
            }
        }

        return new WeatherOutlook(dates.Where(result.ContainsKey).Select(d => result[d]).ToList());
    }

    internal static bool IsForecastDay(DateOnly date, DateOnly today) => date >= today && date.DayNumber - today.DayNumber < ForecastDays;

    /// <summary>Derselbe Kalendertag in den letzten 5 Jahren, für die es schon Archivdaten gibt (29.2. → 28.2.).</summary>
    internal static List<DateOnly> SampleDates(DateOnly date, DateOnly today)
    {
        var latest = today.AddDays(-ArchiveDelayDays);
        return Enumerable.Range(1, ClimateYears + 3)
            .Select(y => date.AddYears(-y))
            .Where(d => d <= latest)
            .Take(ClimateYears)
            .ToList();
    }

    internal static string ForecastUrl(string baseUrl, Coordinates at, DateOnly from, DateOnly to) =>
        $"{baseUrl}?{Location(at)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&start_date={Iso(from)}&end_date={Iso(to)}";

    internal static string ArchiveUrl(string baseUrl, Coordinates at, DateOnly from, DateOnly to) =>
        $"{baseUrl}?{Location(at)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date={Iso(from)}&end_date={Iso(to)}";

    internal static IEnumerable<WeatherDay> MapForecast(DailyDto? daily)
    {
        if (daily?.Time is null)
        {
            yield break;
        }

        for (var i = 0; i < daily.Time.Count; i++)
        {
            if (At(daily.Temperature2mMax, i) is not { } max || At(daily.Temperature2mMin, i) is not { } min)
            {
                continue;
            }

            yield return new WeatherDay(
                daily.Time[i],
                WeatherSource.Forecast,
                (int)(At(daily.WeatherCode, i) ?? 0),
                Math.Round(max, 1),
                Math.Round(min, 1),
                Math.Round(At(daily.PrecipitationSum, i) ?? 0, 1),
                At(daily.PrecipitationProbabilityMax, i) is { } p ? (int)Math.Round(p) : null,
                null);
        }
    }

    internal static IEnumerable<WeatherDay> MapClimate(DailyDto? daily, IReadOnlyDictionary<DateOnly, List<DateOnly>> samples)
    {
        if (daily?.Time is null)
        {
            yield break;
        }

        var byDate = new Dictionary<DateOnly, int>();
        for (var i = 0; i < daily.Time.Count; i++)
        {
            byDate[daily.Time[i]] = i;
        }

        foreach (var (date, sampleDates) in samples)
        {
            var values = sampleDates
                .Where(byDate.ContainsKey)
                .Select(d => byDate[d])
                .Where(i => At(daily.Temperature2mMax, i) is not null && At(daily.Temperature2mMin, i) is not null)
                .Select(i => (
                    Max: At(daily.Temperature2mMax, i)!.Value,
                    Min: At(daily.Temperature2mMin, i)!.Value,
                    Rain: At(daily.PrecipitationSum, i) ?? 0,
                    Code: (int)(At(daily.WeatherCode, i) ?? 0)))
                .ToList();
            if (values.Count == 0)
            {
                continue;
            }

            var rainChance = (int)Math.Round(100.0 * values.Count(v => v.Rain >= 1) / values.Count);
            yield return new WeatherDay(
                date,
                WeatherSource.Climate,
                TypicalCode(values.Select(v => v.Code)),
                Math.Round(values.Average(v => v.Max), 1),
                Math.Round(values.Average(v => v.Min), 1),
                Math.Round(values.Average(v => v.Rain), 1),
                rainChance,
                values.Count);
        }
    }

    /// <summary>Häufigste Wetterlage der Vorjahre (zu Gruppen zusammengefasst), bei Gleichstand die freundlichere.</summary>
    internal static int TypicalCode(IEnumerable<int> codes) =>
        codes.Select(Group)
            .GroupBy(c => c)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => g.Key)
            .FirstOrDefault();

    /// <summary>WMO-Code → Vertreter der Gruppe: 0 klar, 2 wechselhaft, 3 bedeckt/Nebel, 61 Regen, 71 Schnee, 95 Gewitter.</summary>
    internal static int Group(int code) => code switch
    {
        <= 1 => 0,
        2 => 2,
        3 or 45 or 48 => 3,
        >= 71 and <= 77 or 85 or 86 => 71,
        >= 95 => 95,
        _ => 61,
    };

    private async Task<DailyDto?> FetchAsync(string url, TimeSpan cacheFor, CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(url, out DailyDto? cached))
        {
            return cached;
        }

        DailyDto? daily;
        try
        {
            using var message = await http.GetAsync(url, cancellationToken).ConfigureAwait(false);
            if (!message.IsSuccessStatusCode)
            {
                LogFailedStatus((int)message.StatusCode);
                throw new WeatherUnavailableException("Der Wetterdienst (Open-Meteo) antwortet gerade nicht.");
            }

            var response = await message.Content.ReadFromJsonAsync<ResponseDto>(Json, cancellationToken).ConfigureAwait(false);
            daily = response?.Daily;
        }
        catch (Exception e) when (e is HttpRequestException or JsonException || (e is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            LogFailed(e);
            throw new WeatherUnavailableException("Der Wetterdienst (Open-Meteo) ist gerade nicht erreichbar.", e);
        }

        cache.Set(url, daily, cacheFor);
        return daily;
    }

    private static double? At(List<double?>? values, int index) => values is not null && index < values.Count ? values[index] : null;

    private static string Location(Coordinates at) =>
        string.Create(CultureInfo.InvariantCulture, $"latitude={at.Latitude:F4}&longitude={at.Longitude:F4}");

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Open-Meteo antwortete mit {Status}")]
    private partial void LogFailedStatus(int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Open-Meteo-Anfrage fehlgeschlagen")]
    private partial void LogFailed(Exception exception);

    internal sealed record ResponseDto(DailyDto? Daily);

    internal sealed record DailyDto(
        List<DateOnly>? Time,
        [property: System.Text.Json.Serialization.JsonPropertyName("weather_code")] List<double?>? WeatherCode,
        [property: System.Text.Json.Serialization.JsonPropertyName("temperature_2m_max")] List<double?>? Temperature2mMax,
        [property: System.Text.Json.Serialization.JsonPropertyName("temperature_2m_min")] List<double?>? Temperature2mMin,
        [property: System.Text.Json.Serialization.JsonPropertyName("precipitation_sum")] List<double?>? PrecipitationSum,
        [property: System.Text.Json.Serialization.JsonPropertyName("precipitation_probability_max")] List<double?>? PrecipitationProbabilityMax);
}
