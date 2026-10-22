using System.Text.Json;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Api.PriceWatch;

/// <summary>
/// Ein beobachteter Flug. <paramref name="LastPrice"/> ist der zuletzt gefundene Preis; <paramref name="DropFrom"/> ist
/// gesetzt, wenn er seitdem gefallen ist (bis man den Hinweis wegklickt).
/// </summary>
public sealed record PriceWatchEntry(
    Guid TripId,
    Guid OptionId,
    string Title,
    string Signature,
    int Adults,
    decimal StartPrice,
    decimal? LastPrice,
    decimal? DropFrom,
    bool Unavailable,
    DateTimeOffset? CheckedAt,
    string? Problem,
    DateTimeOffset CreatedAt);

/// <summary>Preiswächter als preiswaechter.json im Datenordner – höchstens <see cref="MaxWatches"/> Flüge.</summary>
public sealed class PriceWatchStore(AppPaths paths)
{
    /// <summary>Jede Prüfung kostet eine Suche aus dem kostenlosen SerpApi-Kontingent – deshalb eine feste Grenze.</summary>
    public const int MaxWatches = 3;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly Lock _gate = new();

    private string FilePath => Path.Combine(paths.DataDirectory, "preiswaechter.json");

    public IReadOnlyList<PriceWatchEntry> List()
    {
        lock (_gate)
        {
            return Read();
        }
    }

    public PriceWatchEntry Add(PriceWatchEntry entry)
    {
        lock (_gate)
        {
            var all = Read();
            all.RemoveAll(w => w.OptionId == entry.OptionId);
            if (all.Count >= MaxWatches)
            {
                throw new DomainException("optionId", $"Höchstens {MaxWatches} Flüge gleichzeitig beobachten – jede Prüfung kostet eine Google-Suche.");
            }

            all.Add(entry);
            Write(all);
            return entry;
        }
    }

    public bool Remove(Guid optionId)
    {
        lock (_gate)
        {
            var all = Read();
            var removed = all.RemoveAll(w => w.OptionId == optionId) > 0;
            if (removed)
            {
                Write(all);
            }

            return removed;
        }
    }

    /// <summary>Eintrag ändern (z. B. nach einer Prüfung); fehlt er inzwischen, passiert nichts.</summary>
    public PriceWatchEntry? Update(Guid optionId, Func<PriceWatchEntry, PriceWatchEntry> change)
    {
        ArgumentNullException.ThrowIfNull(change);
        lock (_gate)
        {
            var all = Read();
            var index = all.FindIndex(w => w.OptionId == optionId);
            if (index < 0)
            {
                return null;
            }

            all[index] = change(all[index]);
            Write(all);
            return all[index];
        }
    }

    private List<PriceWatchEntry> Read()
    {
        try
        {
            return File.Exists(FilePath) ? JsonSerializer.Deserialize<List<PriceWatchEntry>>(File.ReadAllText(FilePath), Json) ?? [] : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private void Write(List<PriceWatchEntry> entries)
    {
        Directory.CreateDirectory(paths.DataDirectory);
        var temp = FilePath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(entries, Json));
        File.Move(temp, FilePath, overwrite: true);
    }
}
