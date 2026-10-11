using System.Text;
using System.Text.Json;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Infrastructure.Flights;

/// <summary>
/// Flughäfen mit Linienverkehr aus OurAirports (gemeinfrei, ourairports.com), eingebettet als airports.json:
/// [Code, Name, Stadt, Land, Breite, Länge, "L"=groß/"M"=mittel, Stichworte].
/// </summary>
public sealed class AirportDirectory : IAirportDirectory
{
    private readonly Dictionary<string, Airport> _byCode;
    private readonly List<Entry> _entries;

    public AirportDirectory()
        : this(LoadEmbedded())
    {
    }

    internal AirportDirectory(IEnumerable<(Airport Airport, string Keywords)> airports)
    {
        _entries = [.. airports.Select(a => new Entry(a.Airport, Normalize(a.Airport.City), Normalize(a.Airport.Name), Normalize(a.Keywords)))];
        _byCode = _entries.ToDictionary(e => e.Airport.Code, e => e.Airport, StringComparer.OrdinalIgnoreCase);
    }

    public int Count => _entries.Count;

    public Airport? Find(string code) => _byCode.GetValueOrDefault(code?.Trim() ?? string.Empty);

    public IReadOnlyList<Airport> Search(string query, int limit)
    {
        var q = Normalize(query);
        if (q.Length < 2)
        {
            return [];
        }

        return
        [
            .. _entries
                .Select(e => (e.Airport, Score: Score(e, q)))
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Airport.City, StringComparer.Ordinal)
                .Take(limit)
                .Select(x => x.Airport),
        ];
    }

    public IReadOnlyList<NearbyAirport> Near(Coordinates center, double radiusKm, int limit) =>
    [
        .. _entries
            .Select(e => new NearbyAirport(e.Airport, Math.Round(GeoMath.DistanceKm(center, e.Airport.Position), 1)))
            .Where(n => n.DistanceKm <= radiusKm)
            .OrderBy(n => n.DistanceKm)
            .Take(limit),
    ];

    private static int Score(Entry e, string q)
    {
        var score = 0;
        if (q.Length == 3 && string.Equals(e.Airport.Code, q, StringComparison.OrdinalIgnoreCase))
        {
            score = 100;
        }
        else if (e.City.StartsWith(q, StringComparison.Ordinal))
        {
            score = 60;
        }
        else if (e.Name.StartsWith(q, StringComparison.Ordinal))
        {
            score = 50;
        }
        else if (e.City.Contains(q, StringComparison.Ordinal) || e.Name.Contains(q, StringComparison.Ordinal))
        {
            score = 30;
        }
        else if (e.Keywords.Contains(q, StringComparison.Ordinal))
        {
            score = 20;
        }

        return score == 0 ? 0 : score + (e.Airport.Major ? 5 : 0);
    }

    /// <summary>
    /// "Lisboa, Açores" → "lisboa, acores". Eigene Tabelle, weil die App mit InvariantGlobalization läuft
    /// (dort entfernt string.Normalize keine Akzente).
    /// </summary>
    internal static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var c in value.Trim().ToLowerInvariant())
        {
            if (c < 128)
            {
                builder.Append(c);
            }
            else if (c == 'ß')
            {
                builder.Append("ss");
            }
            else
            {
                var i = Accented.IndexOf(c, StringComparison.Ordinal);
                builder.Append(i >= 0 ? Plain[i] : c);
            }
        }

        return builder.ToString();
    }

    private const string Accented = "àáâãäåāăąçćčďèéêëēėęěìíîïīįłñńňòóôõöøōőŕřśšşťţùúûüūůűųýÿźżžđ";
    private const string Plain = "aaaaaaaaaccc" + "deeeeeeeeiiiiiilnnnoooooooorrssstt" + "uuuuuuuuyyzzzd";

    private static List<(Airport, string)> LoadEmbedded()
    {
        using var stream = typeof(AirportDirectory).Assembly.GetManifestResourceStream("Urlaubsplanner.Infrastructure.Flights.airports.json")
            ?? throw new InvalidOperationException("airports.json fehlt als eingebettete Ressource.");
        using var json = JsonDocument.Parse(stream);
        var list = new List<(Airport, string)>();
        foreach (var row in json.RootElement.EnumerateArray())
        {
            list.Add((
                new Airport(
                    row[0].GetString()!,
                    row[1].GetString()!,
                    row[2].GetString() ?? string.Empty,
                    row[3].GetString() ?? string.Empty,
                    row[4].GetDouble(),
                    row[5].GetDouble(),
                    row[6].GetString() == "L"),
                row[7].GetString() ?? string.Empty));
        }

        return list;
    }

    private sealed record Entry(Airport Airport, string City, string Name, string Keywords);
}
