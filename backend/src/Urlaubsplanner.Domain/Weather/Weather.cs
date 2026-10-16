using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Domain.Weather;

/// <summary>Woher ein Tageswert stammt: echte Vorhersage (bis ~16 Tage voraus) oder typisches Wetter der letzten Jahre.</summary>
public enum WeatherSource
{
    Forecast,
    Climate,
}

/// <summary>
/// Wetter eines Tages. <see cref="Code"/> ist der WMO-Wettercode (0 = klar, 3 = bedeckt, 61 = Regen, 71 = Schnee, 95 = Gewitter).
/// <see cref="RainChance"/>: Regenwahrscheinlichkeit in Prozent – bei <see cref="WeatherSource.Climate"/> der Anteil der
/// Vorjahre mit mindestens 1 mm Regen an diesem Tag. <see cref="Years"/>: Anzahl ausgewerteter Vorjahre.
/// </summary>
public sealed record WeatherDay(
    DateOnly Date,
    WeatherSource Source,
    int Code,
    double TempMax,
    double TempMin,
    double PrecipitationMm,
    int? RainChance,
    int? Years);

public sealed record WeatherOutlook(IReadOnlyList<WeatherDay> Days);

public interface IWeatherService
{
    /// <summary>Wetter für jeden Tag von <paramref name="firstDay"/> bis <paramref name="lastDay"/> (beide inklusive, max. 62 Tage).</summary>
    Task<WeatherOutlook> GetAsync(Coordinates at, DateOnly firstDay, DateOnly lastDay, CancellationToken cancellationToken);
}

public sealed class WeatherUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
