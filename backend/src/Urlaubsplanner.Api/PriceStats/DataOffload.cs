using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Api.PriceStats;

/// <summary>Was an Preisdaten gespeichert ist, mit Größe und letzter Nutzung.</summary>
public sealed record StoredData(string Kind, string Key, string Label, int Entries, DateTimeOffset LastUsed);

/// <summary>Ausgelagerte Datei im Ordner „ausgelagert“.</summary>
public sealed record OffloadedData(string Name, string Kind, string Label, int Entries, long Bytes, DateTimeOffset OffloadedAt);

/// <summary>
/// Was endgültig gelöscht werden soll: ausgewählte gespeicherte Daten (<paramref name="Stored"/> als „art:schlüssel“,
/// z. B. „strecke:STR-BCN“), ausgewählte ausgelagerte Dateien und – wenn <paramref name="UnusedDays"/> gesetzt ist –
/// zusätzlich alles, was so lange nicht benutzt wurde.
/// </summary>
public sealed record DeleteDataRequest(IReadOnlyList<string>? Stored, IReadOnlyList<string>? Offloaded, int? UnusedDays);

/// <summary>
/// Preisdaten, die länger nicht benutzt wurden, komprimiert in den Unterordner „ausgelagert“ verschieben. So bleibt
/// die App schnell, nichts geht verloren: zurückholen oder endgültig löschen geht jederzeit.
/// </summary>
public sealed partial class DataOffload(AppPaths paths, PriceArchive archive, PriceCalendarStore calendars)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private string Folder => Path.Combine(paths.DataDirectory, "ausgelagert");

    public IReadOnlyList<StoredData> Stored()
    {
        var routes = archive.Routes().Select(r => new StoredData("strecke", $"{r.Origin}-{r.Destination}", $"Preisarchiv {r.Origin} → {r.Destination}", r.Count, r.LastUsed));
        var cals = calendars.List().Select(c => new StoredData("kalender", c.Id.ToString(), Label(c), c.Days.Count, c.LastUsedAt));
        return [.. routes.Concat(cals).OrderBy(d => d.LastUsed)];
    }

    public IReadOnlyList<OffloadedData> Offloaded()
    {
        if (!Directory.Exists(Folder))
        {
            return [];
        }

        return [.. Directory.EnumerateFiles(Folder, "*.json.gz")
            .Select(f => ReadPackage(f) is { } p ? new OffloadedData(Path.GetFileName(f), p.Kind, p.Label, p.Entries, new FileInfo(f).Length, p.OffloadedAt) : null)
            .OfType<OffloadedData>()
            .OrderByDescending(o => o.OffloadedAt)];
    }

    /// <summary>Alles auslagern, was seit <paramref name="days"/> Tagen nicht benutzt wurde. Gibt die Anzahl zurück.</summary>
    public int OffloadUnused(int days, DateTimeOffset now)
    {
        if (days is < 1 or > 3650)
        {
            throw new DomainException("days", "Zwischen 1 und 3650 Tagen.");
        }

        var limit = now.AddDays(-days);
        var count = 0;
        foreach (var item in Stored().Where(d => d.LastUsed < limit))
        {
            if (item.Kind == "strecke")
            {
                var parts = item.Key.Split('-');
                var (records, histories) = archive.TakeRoute(parts[0], parts[1]);
                Write(new Package("strecke", item.Label, records.Count, now, records, histories, null), $"strecke_{item.Key}_{now:yyyyMMddHHmmss}");
                count++;
            }
            else if (calendars.Get(Guid.Parse(item.Key)) is { State: not CalendarState.Running } calendar)
            {
                Write(new Package("kalender", item.Label, calendar.Days.Count, now, null, null, calendar), $"kalender_{calendar.Id:N}");
                calendars.Remove(calendar.Id);
                count++;
            }
        }

        return count;
    }

    public void Restore(string name)
    {
        var file = FileFor(name);
        var package = ReadPackage(file) ?? throw new DomainException("name", "Die Datei lässt sich nicht lesen.");
        if (package.Calendar is { } calendar)
        {
            calendars.Save(calendar);
        }
        else
        {
            archive.Restore(package.Records ?? [], package.Histories ?? []);
        }

        File.Delete(file);
    }

    public void Delete(string name) => File.Delete(FileFor(name));

    /// <summary>
    /// Ausgewähltes endgültig löschen, auf Wunsch samt allem, was seit <see cref="DeleteDataRequest.UnusedDays"/> Tagen
    /// ungenutzt ist (gespeichert: zuletzt benutzt; ausgelagert: seit dem Auslagern). Gibt die Anzahl zurück.
    /// Ein laufender Preiskalender wird nicht gelöscht.
    /// </summary>
    public int DeleteSelected(DeleteDataRequest request, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.UnusedDays is < 1 or > 3650)
        {
            throw new DomainException("unusedDays", "Zwischen 1 und 3650 Tagen.");
        }

        var stored = Stored();
        var offloaded = Offloaded();
        var storedKeys = new HashSet<string>(request.Stored ?? [], StringComparer.Ordinal);
        var names = new HashSet<string>(request.Offloaded ?? [], StringComparer.Ordinal);
        if (request.UnusedDays is { } days)
        {
            var limit = now.AddDays(-days);
            storedKeys.UnionWith(stored.Where(d => d.LastUsed < limit).Select(d => $"{d.Kind}:{d.Key}"));
            names.UnionWith(offloaded.Where(o => o.OffloadedAt < limit).Select(o => o.Name));
        }

        var count = 0;
        foreach (var item in stored.Where(d => storedKeys.Contains($"{d.Kind}:{d.Key}")))
        {
            if (item.Kind == "strecke")
            {
                var parts = item.Key.Split('-');
                archive.TakeRoute(parts[0], parts[1]);
                count++;
            }
            else if (Guid.TryParse(item.Key, out var id) && calendars.Get(id) is { State: not CalendarState.Running } && calendars.Remove(id))
            {
                count++;
            }
        }

        // Nur Namen, die wirklich im Ordner liegen – FileFor prüft zusätzlich das Muster.
        foreach (var name in names.Where(n => offloaded.Any(o => o.Name == n)))
        {
            File.Delete(FileFor(name));
            count++;
        }

        return count;
    }

    private static string Label(PriceCalendar c) =>
        $"Preiskalender {string.Join("/", c.Origins)} → {string.Join("/", c.Destinations)}, {c.From:dd.MM.yy}–{c.To:dd.MM.yy}";

    /// <summary>Nur Dateien aus dem Ordner „ausgelagert“ mit harmlosem Namen – kein Zugriff auf andere Pfade.</summary>
    private string FileFor(string name)
    {
        if (string.IsNullOrEmpty(name) || !SafeName().IsMatch(name))
        {
            throw new DomainException("name", "Ungültiger Name.");
        }

        var file = Path.Combine(Folder, name);
        return File.Exists(file) ? file : throw new NotFoundException("Ausgelagerte Datei", Guid.Empty);
    }

    private void Write(Package package, string baseName)
    {
        Directory.CreateDirectory(Folder);
        var file = Path.Combine(Folder, baseName + ".json.gz");
        using var stream = File.Create(file);
        using var gzip = new GZipStream(stream, CompressionLevel.SmallestSize);
        JsonSerializer.Serialize(gzip, package, Json);
    }

    private static Package? ReadPackage(string file)
    {
        try
        {
            using var stream = File.OpenRead(file);
            using var gzip = new GZipStream(stream, CompressionMode.Decompress);
            return JsonSerializer.Deserialize<Package>(gzip, Json);
        }
        catch (Exception e) when (e is IOException or JsonException or InvalidDataException)
        {
            return null;
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+\\.json\\.gz$")]
    private static partial Regex SafeName();

    private sealed record Package(
        string Kind,
        string Label,
        int Entries,
        DateTimeOffset OffloadedAt,
        List<PriceRecord>? Records,
        List<PriceHistoryEntry>? Histories,
        PriceCalendar? Calendar);
}
