using System.Text.Json;
using System.Text.Json.Serialization;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.PriceStats;

/// <summary>Welche Abflugtage im Zeitraum gesucht werden – weniger Tage = weniger Google-Suchen.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CalendarPattern
{
    /// <summary>Jeder Tag.</summary>
    Daily,

    /// <summary>Jeder zweite Tag.</summary>
    EveryOther,

    /// <summary>Jeder dritte Tag.</summary>
    EveryThird,

    /// <summary>Nur Freitag und Samstag.</summary>
    Weekends,

    /// <summary>Einmal pro Woche, gleicher Wochentag wie der erste Tag.</summary>
    Weekly,
}

/// <summary>Woher die Preise kommen.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PriceSource
{
    /// <summary>Google Flights über SerpApi: genau und aktuell, kostet eine Suche pro Tag.</summary>
    Google,

    /// <summary>Aviasales über Travelpayouts: kostenlose Richtpreise (einige Tage alt), eine Abfrage pro Monat.</summary>
    Aviasales,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CalendarState
{
    Running,
    Done,
    Cancelled,
    Failed,
}

/// <param name="Nights">Reisedauer bei Hin & zurück; null = nur Hinflug.</param>
/// <param name="TripId">Reise, aus der der Kalender geladen wurde – er erscheint nur dort.</param>
public sealed record PriceCalendarRequest(
    IReadOnlyList<string> Origins,
    IReadOnlyList<string> Destinations,
    DateOnly From,
    DateOnly To,
    int? Nights,
    CalendarPattern Pattern,
    PriceSource Source = PriceSource.Google,
    Guid? TripId = null);

/// <summary>Ergebnis für einen Abflugtag: günstigster Preis pro Person mit Airline.</summary>
/// <param name="Route">Strecke des günstigsten Preises, z. B. „FRA-BCN“ (wichtig bei mehreren Flughäfen).</param>
/// <param name="Flight">Flugnummer(n) des günstigsten Hinflugs, z. B. „EW2520“ (nur Google).</param>
/// <param name="Found">Aviasales: wann der Preis gefunden wurde (bei Hin &amp; zurück der ältere der beiden).</param>
public sealed record CalendarDay(
    DateOnly Date,
    decimal? Cheapest,
    string? Airline,
    int? Stops,
    int Options,
    string? Problem,
    string? Route = null,
    string? Flight = null,
    DateOnly? Found = null);

/// <summary>Ein gespeicherter Preiskalender: Strecke, Zeitraum, Fortschritt und Tagespreise.</summary>
public sealed record PriceCalendar(
    Guid Id,
    IReadOnlyList<string> Origins,
    IReadOnlyList<string> Destinations,
    DateOnly From,
    DateOnly To,
    int? Nights,
    CalendarPattern Pattern,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastUsedAt,
    CalendarState State,
    int Total,
    IReadOnlyList<CalendarDay> Days,
    string? Problem,
    PriceSource Source = PriceSource.Google,
    Guid? TripId = null);

public static class PriceCalendarRules
{
    /// <summary>Höchstens ein halbes Jahr auf einmal …</summary>
    public const int MaxSpanDays = 186;

    /// <summary>… und höchstens so viele Suchen (Kontingent: 250 im Monat).</summary>
    public const int MaxSearches = 100;

    /// <summary>So viele Suchen bleiben für normale Suchen übrig.</summary>
    public const int KeepForNormalSearches = 10;

    public static IReadOnlyList<DateOnly> Dates(PriceCalendarRequest request, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.From <= today)
        {
            throw new DomainException("from", "Der Zeitraum muss in der Zukunft liegen.");
        }

        if (request.To < request.From)
        {
            throw new DomainException("to", "Das Ende muss nach dem Anfang liegen.");
        }

        if (request.To.DayNumber - request.From.DayNumber > MaxSpanDays)
        {
            throw new DomainException("to", "Höchstens 6 Monate auf einmal.");
        }

        var last = (request.Nights ?? 0) + request.To.DayNumber;
        if (last > today.AddDays(FlightSearchRequest.MaxDaysAhead).DayNumber)
        {
            throw new DomainException("to", "Airlines verkaufen nur etwa 11 Monate im Voraus.");
        }

        if (request.Nights is < 1 or > 60)
        {
            throw new DomainException("nights", "Reisedauer zwischen 1 und 60 Nächten (oder nur Hinflug).");
        }

        var dates = new List<DateOnly>();
        for (var d = request.From; d <= request.To; d = d.AddDays(1))
        {
            var offset = d.DayNumber - request.From.DayNumber;
            var take = request.Pattern switch
            {
                CalendarPattern.EveryOther => offset % 2 == 0,
                CalendarPattern.EveryThird => offset % 3 == 0,
                CalendarPattern.Weekends => d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday,
                CalendarPattern.Weekly => offset % 7 == 0,
                _ => true,
            };
            if (take)
            {
                dates.Add(d);
            }
        }

        // Nur Google-Suchen kosten etwas – Aviasales fragt einmal pro Monat ab.
        if (request.Source == PriceSource.Google && dates.Count > MaxSearches)
        {
            throw new DomainException("pattern", $"Das wären {dates.Count} Google-Suchen – höchstens {MaxSearches}. Kürzerer Zeitraum oder seltener suchen.");
        }

        return dates;
    }
}

/// <summary>Preiskalender als preiskalender.json im Datenordner.</summary>
public sealed class PriceCalendarStore(AppPaths paths)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly Lock _gate = new();

    private string FilePath => Path.Combine(paths.DataDirectory, "preiskalender.json");

    public IReadOnlyList<PriceCalendar> List()
    {
        lock (_gate)
        {
            return Read();
        }
    }

    public PriceCalendar? Get(Guid id) => List().FirstOrDefault(c => c.Id == id);

    public void Save(PriceCalendar calendar)
    {
        ArgumentNullException.ThrowIfNull(calendar);
        lock (_gate)
        {
            var all = Read();
            all.RemoveAll(c => c.Id == calendar.Id);
            all.Add(calendar);
            Write(all);
        }
    }

    public PriceCalendar? Update(Guid id, Func<PriceCalendar, PriceCalendar> change)
    {
        ArgumentNullException.ThrowIfNull(change);
        lock (_gate)
        {
            var all = Read();
            var i = all.FindIndex(c => c.Id == id);
            if (i < 0)
            {
                return null;
            }

            all[i] = change(all[i]);
            Write(all);
            return all[i];
        }
    }

    public bool Remove(Guid id)
    {
        lock (_gate)
        {
            var all = Read();
            var removed = all.RemoveAll(c => c.Id == id) > 0;
            if (removed)
            {
                Write(all);
            }

            return removed;
        }
    }

    /// <summary>Nach einem Neustart: angefangene Kalender gelten als abgebrochen (die Suche läuft nicht weiter).</summary>
    public void MarkInterrupted()
    {
        lock (_gate)
        {
            var all = Read();
            if (!all.Any(c => c.State == CalendarState.Running))
            {
                return;
            }

            Write([.. all.Select(c => c.State == CalendarState.Running ? c with { State = CalendarState.Cancelled, Problem = "Beim Beenden der App abgebrochen." } : c)]);
        }
    }

    private List<PriceCalendar> Read()
    {
        try
        {
            return File.Exists(FilePath) ? JsonSerializer.Deserialize<List<PriceCalendar>>(File.ReadAllText(FilePath), Json) ?? [] : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private void Write(List<PriceCalendar> all)
    {
        Directory.CreateDirectory(paths.DataDirectory);
        var temp = FilePath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(all.OrderByDescending(c => c.CreatedAt), Json));
        File.Move(temp, FilePath, overwrite: true);
    }
}
