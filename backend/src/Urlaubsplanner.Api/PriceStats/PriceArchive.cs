using System.Globalization;
using System.Text;
using System.Text.Json;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.PriceStats;

/// <summary>Ein gesehener Flugpreis: wann gesucht, welche Strecke, welcher Abflugtag, welche Airline, welcher Preis.</summary>
public sealed record PriceRecord(
    DateTimeOffset SearchedAt,
    string Origin,
    string Destination,
    DateOnly DepartureDate,
    string DepartureTime,
    DateOnly? ReturnDate,
    string Airline,
    int Stops,
    int Minutes,
    decimal PricePerAdult,
    decimal TotalPrice,
    string Currency,
    string Source);

/// <summary>Letzter Preisverlauf von Google für eine Strecke und Reisedaten.</summary>
public sealed record PriceHistoryEntry(
    string Origin,
    string Destination,
    DateOnly DepartureDate,
    DateOnly? ReturnDate,
    DateTimeOffset FetchedAt,
    decimal? Lowest,
    string? Level,
    decimal? TypicalLow,
    decimal? TypicalHigh,
    IReadOnlyList<PricePoint> Points);

/// <summary>
/// Eigenes Preisarchiv: Jede Flugsuche (und jede Prüfung des Preiswächters) legt die gefundenen Preise lokal ab –
/// ohne zusätzliche Suche. Daraus entstehen mit der Zeit Diagramme pro Strecke. Dazu der Preisverlauf, den Google
/// bei jeder Suche mitliefert. Alles bleibt im Datenordner (preisarchiv.jsonl, preisverlauf.json).
/// </summary>
public sealed partial class PriceArchive(AppPaths paths, ILogger<PriceArchive> logger)
{
    /// <summary>Wird die Datei größer, bleiben die neueren Hälfte der Einträge.</summary>
    internal const long MaxBytes = 20 * 1024 * 1024;

    private const int MaxHistories = 200;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions Indented = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly Lock _gate = new();
    private HashSet<string>? _seenToday;
    private DateOnly _seenDay;

    private string RecordsFile => Path.Combine(paths.DataDirectory, "preisarchiv.jsonl");

    private string HistoryFile => Path.Combine(paths.DataDirectory, "preisverlauf.json");

    private string UsageFile => Path.Combine(paths.DataDirectory, "preisarchiv-nutzung.json");

    /// <summary>Strecke wurde angesehen – zählt fürs Auslagern („seit 30 Tagen nicht benutzt“).</summary>
    public void Touch(string origin, string destination, DateTimeOffset now)
    {
        try
        {
            lock (_gate)
            {
                var usage = ReadUsage();
                usage[$"{origin}-{destination}"] = now;
                Directory.CreateDirectory(paths.DataDirectory);
                File.WriteAllText(UsageFile, JsonSerializer.Serialize(usage, Indented));
            }
        }
        catch (IOException e)
        {
            LogFailed(e);
        }
    }

    /// <summary>Strecken im Archiv mit Anzahl und wann zuletzt benutzt (angesehen oder neue Preise).</summary>
    public IReadOnlyList<(string Origin, string Destination, int Count, DateTimeOffset LastUsed)> Routes()
    {
        lock (_gate)
        {
            var usage = ReadUsage();
            return ReadRecords()
                .GroupBy(r => (r.Origin, r.Destination))
                .Select(g =>
                {
                    var recorded = g.Max(r => r.SearchedAt);
                    var viewed = usage.GetValueOrDefault($"{g.Key.Origin}-{g.Key.Destination}");
                    return (g.Key.Origin, g.Key.Destination, g.Count(), viewed > recorded ? viewed : recorded);
                })
                .ToList();
        }
    }

    /// <summary>Alle Daten einer Strecke herausnehmen (zum Auslagern).</summary>
    public (List<PriceRecord> Records, List<PriceHistoryEntry> Histories) TakeRoute(string origin, string destination)
    {
        lock (_gate)
        {
            var records = ReadRecords();
            var taken = records.Where(r => r.Origin == origin && r.Destination == destination).ToList();
            WriteRecords(records.Where(r => !(r.Origin == origin && r.Destination == destination)));
            var histories = ReadHistories();
            var takenHistories = histories.Where(h => h.Origin == origin && h.Destination == destination).ToList();
            WriteHistories(histories.Where(h => !(h.Origin == origin && h.Destination == destination)));
            return (taken, takenHistories);
        }
    }

    /// <summary>Ausgelagerte Daten zurückholen.</summary>
    public void Restore(IEnumerable<PriceRecord> records, IEnumerable<PriceHistoryEntry> histories)
    {
        lock (_gate)
        {
            WriteRecords(ReadRecords().Concat(records).OrderBy(r => r.SearchedAt));
            var all = ReadHistories();
            foreach (var h in histories)
            {
                all.RemoveAll(x => x.Origin == h.Origin && x.Destination == h.Destination && x.DepartureDate == h.DepartureDate && x.ReturnDate == h.ReturnDate);
                all.Add(h);
            }

            WriteHistories(all);
        }
    }

    private Dictionary<string, DateTimeOffset> ReadUsage()
    {
        try
        {
            return File.Exists(UsageFile)
                ? JsonSerializer.Deserialize<Dictionary<string, DateTimeOffset>>(File.ReadAllText(UsageFile), Json) ?? []
                : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private void WriteRecords(IEnumerable<PriceRecord> records)
    {
        Directory.CreateDirectory(paths.DataDirectory);
        var temp = RecordsFile + ".tmp";
        File.WriteAllLines(temp, records.Select(r => JsonSerializer.Serialize(r, Json)));
        File.Move(temp, RecordsFile, overwrite: true);
    }

    private void WriteHistories(IEnumerable<PriceHistoryEntry> histories)
    {
        Directory.CreateDirectory(paths.DataDirectory);
        var temp = HistoryFile + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(histories.ToList(), Indented));
        File.Move(temp, HistoryFile, overwrite: true);
    }

    /// <summary>Verbindungen aus einer Suche ablegen. Gleiche Verbindung zum gleichen Preis am selben Tag nur einmal.</summary>
    public void Record(IEnumerable<FlightJourney> journeys, DateOnly? returnDate, string source, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(journeys);
        try
        {
            var lines = new StringBuilder();
            lock (_gate)
            {
                var today = DateOnly.FromDateTime(now.UtcDateTime);
                if (_seenToday is null || _seenDay != today)
                {
                    _seenToday = new HashSet<string>(StringComparer.Ordinal);
                    _seenDay = today;
                }

                foreach (var j in journeys)
                {
                    if (j.Legs.Count == 0 || j.Fares.Count == 0)
                    {
                        continue;
                    }

                    var fare = j.Fares[0];
                    if (!_seenToday.Add($"{j.Signature}|{fare.TotalPrice}"))
                    {
                        continue;
                    }

                    var leg = j.Legs[0];
                    var airlines = leg.Segments
                        .Select(s => string.IsNullOrWhiteSpace(s.CarrierName) ? s.CarrierCode : s.CarrierName!)
                        .Distinct(StringComparer.OrdinalIgnoreCase);
                    var record = new PriceRecord(
                        now,
                        leg.Origin,
                        leg.Destination,
                        DateOnly.FromDateTime(leg.Departure),
                        leg.Departure.ToString("HH:mm", CultureInfo.InvariantCulture),
                        j.Legs.Count > 1 ? DateOnly.FromDateTime(j.Legs[^1].Departure) : returnDate,
                        string.Join(" + ", airlines),
                        leg.Stops,
                        leg.DurationMinutes,
                        fare.PricePerAdult,
                        fare.TotalPrice,
                        fare.Currency,
                        source);
                    lines.AppendLine(JsonSerializer.Serialize(record, Json));
                }

                if (lines.Length == 0)
                {
                    return;
                }

                Directory.CreateDirectory(paths.DataDirectory);
                File.AppendAllText(RecordsFile, lines.ToString());
                TrimIfLarge();
            }
        }
        catch (IOException e)
        {
            LogFailed(e);
        }
    }

    /// <summary>Preisverlauf zu Strecke und Datum speichern (ersetzt den älteren zu denselben Daten).</summary>
    public void RecordHistory(string origin, string destination, DateOnly departure, DateOnly? returnDate, FlightPriceInsights? insights, DateTimeOffset now)
    {
        if (insights is null || insights.History.Count == 0)
        {
            return;
        }

        try
        {
            lock (_gate)
            {
                var all = ReadHistories();
                all.RemoveAll(h => h.Origin == origin && h.Destination == destination && h.DepartureDate == departure && h.ReturnDate == returnDate);
                all.Add(new PriceHistoryEntry(origin, destination, departure, returnDate, now, insights.Lowest, insights.Level, insights.TypicalLow, insights.TypicalHigh, insights.History));
                var keep = all.OrderByDescending(h => h.FetchedAt).Take(MaxHistories).ToList();
                Directory.CreateDirectory(paths.DataDirectory);
                var temp = HistoryFile + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(keep, Indented));
                File.Move(temp, HistoryFile, overwrite: true);
            }
        }
        catch (Exception e) when (e is IOException or JsonException)
        {
            LogFailed(e);
        }
    }

    /// <summary>Alle Einträge einer Strecke (ohne Angabe: alle).</summary>
    public IReadOnlyList<PriceRecord> Records(string? origin = null, string? destination = null)
    {
        lock (_gate)
        {
            return ReadRecords()
                .Where(r => (origin is null || r.Origin == origin) && (destination is null || r.Destination == destination))
                .ToList();
        }
    }

    public IReadOnlyList<PriceHistoryEntry> Histories(string origin, string destination)
    {
        lock (_gate)
        {
            return ReadHistories().Where(h => h.Origin == origin && h.Destination == destination).OrderByDescending(h => h.FetchedAt).ToList();
        }
    }

    private List<PriceRecord> ReadRecords()
    {
        if (!File.Exists(RecordsFile))
        {
            return [];
        }

        var list = new List<PriceRecord>();
        foreach (var line in File.ReadLines(RecordsFile))
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                if (JsonSerializer.Deserialize<PriceRecord>(line, Json) is { } r)
                {
                    list.Add(r);
                }
            }
            catch (JsonException)
            {
                // Kaputte Zeile (z. B. Absturz beim Schreiben) überspringen.
            }
        }

        return list;
    }

    private List<PriceHistoryEntry> ReadHistories()
    {
        try
        {
            return File.Exists(HistoryFile) ? JsonSerializer.Deserialize<List<PriceHistoryEntry>>(File.ReadAllText(HistoryFile), Json) ?? [] : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private void TrimIfLarge()
    {
        if (new FileInfo(RecordsFile).Length <= MaxBytes)
        {
            return;
        }

        var lines = File.ReadAllLines(RecordsFile);
        var temp = RecordsFile + ".tmp";
        File.WriteAllLines(temp, lines.Skip(lines.Length / 2));
        File.Move(temp, RecordsFile, overwrite: true);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Preisarchiv konnte nicht geschrieben werden")]
    private partial void LogFailed(Exception exception);
}
