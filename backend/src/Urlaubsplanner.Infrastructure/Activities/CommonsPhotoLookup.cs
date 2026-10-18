using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Infrastructure.Activities;

/// <summary>
/// Foto für Orte, die über Wikidata keins haben: Dateien auf Wikimedia Commons, die bis 80 m entfernt aufgenommen
/// wurden und deren Dateiname zum Ortsnamen passt (z. B. „File:Palau Centelles 03.jpg“). Lieber kein Bild als ein falsches.
/// </summary>
public sealed partial class CommonsPhotoLookup(HttpClient http, IMemoryCache cache, ILogger<CommonsPhotoLookup> logger) : IActivityPhotos
{
    private static readonly string[] ImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    /// <summary>Wörter, die allein nichts über den Ort sagen („Palau“ passt sonst auf jeden Palast).</summary>
    private static readonly HashSet<string> Generic = new(StringComparer.Ordinal)
    {
        "palau", "palacio", "palast", "palace", "casa", "museu", "museo", "museum", "musee", "iglesia", "esglesia", "kirche", "church",
        "eglise", "chiesa", "igreja", "plaza", "placa", "praca", "place", "platz", "parc", "parque", "park", "jardin", "jardi", "jardim",
        "garten", "torre", "tower", "castell", "castillo", "castelo", "castle", "schloss", "burg", "monument", "monumento", "fundacio",
        "fundacion", "puente", "pont", "ponte", "bridge", "mercat", "mercado", "market", "catedral", "cathedral", "basilica",
        "convento", "convent", "kloster", "monasterio", "mosteiro", "santa", "santo", "sant", "saint", "sankt", "della", "dels", "with",
    };

    public async Task<string?> FindAsync(Coordinates at, string name, CancellationToken cancellationToken)
    {
        var key = string.Create(CultureInfo.InvariantCulture, $"photo:{at.Latitude:F4},{at.Longitude:F4}:{name}");
        if (cache.TryGetValue(key, out string? cached))
        {
            return cached;
        }

        var url = string.Create(
            CultureInfo.InvariantCulture,
            $"w/api.php?action=query&list=geosearch&gscoord={at.Latitude:F5}%7C{at.Longitude:F5}&gsradius=80&gsnamespace=6&gslimit=30&format=json");
        string? photo = null;
        try
        {
            var response = await http.GetFromJsonAsync<GeoSearchResponse>(url, cancellationToken).ConfigureAwait(false);
            photo = Pick(response?.Query?.Geosearch ?? [], name);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException || (e is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            LogFailed(e);
            return null; // nicht merken – beim nächsten Mal neu versuchen
        }

        cache.Set(key, photo, TimeSpan.FromDays(7));
        return photo;
    }

    /// <summary>Nächstgelegene Bilddatei, deren Name ein kennzeichnendes Wort des Ortsnamens enthält.</summary>
    internal static string? Pick(IEnumerable<GeoHit> hits, string name)
    {
        var words = Words(name);
        var specific = words.Where(w => w.Length >= 4 && !Generic.Contains(w)).ToList();
        if (specific.Count == 0 && words.Count < 2)
        {
            return null;
        }

        foreach (var hit in hits.OrderBy(h => h.Dist))
        {
            var title = hit.Title ?? string.Empty;
            if (!title.StartsWith("File:", StringComparison.Ordinal) || !ImageExtensions.Any(x => title.EndsWith(x, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            var titleWords = Words(title[5..]).ToHashSet(StringComparer.Ordinal);
            var match = specific.Count > 0 ? specific.Any(titleWords.Contains) : words.All(titleWords.Contains);
            if (match)
            {
                return $"https://commons.wikimedia.org/wiki/Special:FilePath/{Uri.EscapeDataString(title[5..].Replace(' ', '_'))}?width=480";
            }
        }

        return null;
    }

    /// <summary>Kleinbuchstaben ohne Akzente, nur Buchstabenfolgen ab 3 Zeichen.</summary>
    internal static List<string> Words(string text)
    {
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var plain = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                plain.Append(char.ToLowerInvariant(c));
            }
        }

        return WordRegex().Matches(plain.ToString()).Select(m => m.Value).Where(w => w.Length >= 3).ToList();
    }

    [System.Text.RegularExpressions.GeneratedRegex(@"\p{L}+")]
    private static partial System.Text.RegularExpressions.Regex WordRegex();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Wikimedia-Commons-Fotosuche fehlgeschlagen")]
    private partial void LogFailed(Exception exception);

    internal sealed record GeoSearchResponse(GeoQuery? Query);

    internal sealed record GeoQuery(List<GeoHit>? Geosearch);

    internal sealed record GeoHit(string? Title, double Dist);
}
