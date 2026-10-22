using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Json;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Infrastructure.Activities;

public sealed class ActivityOptions
{
    public const string Section = "Activities";

    /// <summary>
    /// Öffentliche Overpass-Server, der Reihe nach probiert: Ist einer überlastet oder bricht ab, kommt der nächste dran.
    /// </summary>
    public IList<string> OverpassUrls { get; } =
    [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];

    public string WikidataSparqlUrl { get; set; } = "https://query.wikidata.org/sparql";

    /// <summary>So viele Vorschläge werden höchstens vorgehalten (die bekanntesten zuerst); angezeigt wird seitenweise.</summary>
    public int MaxResults { get; set; } = 200;

    /// <summary>
    /// Ordner, in dem Ergebnisse dauerhaft gespeichert werden (null = nur im Speicher). Sehenswürdigkeiten ändern sich
    /// kaum – so sind Vorschläge auch nach einem Neustart sofort da.
    /// </summary>
    public string? CacheDirectory { get; set; }

    /// <summary>So lange gelten gespeicherte Ergebnisse.</summary>
    public int CacheDays { get; set; } = 30;
}

/// <summary>
/// Vorschläge aus freien Daten, ohne API-Key:
/// OpenStreetMap (Overpass) liefert Orte mit Art, Öffnungszeiten, Eintritt und Website;
/// Wikidata ergänzt deutsche Beschreibung, Foto (Wikimedia Commons), Wikipedia-Link und wie bekannt ein Ort ist.
/// Ergebnisse werden im Speicher und (wenn eingestellt) 30 Tage auf der Festplatte gehalten – beide Dienste sind
/// freiwillig betrieben und sollen geschont werden, und Overpass braucht oft 5–30 Sekunden.
/// </summary>
public sealed partial class OsmActivitySearch(
    HttpClient http,
    IMemoryCache cache,
    IOptions<ActivityOptions> options,
    TimeProvider clock,
    ILogger<OsmActivitySearch> logger) : IActivitySearch
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromDays(1);
    private static readonly Lock PendingGate = new();
    private static readonly ConcurrentDictionary<string, byte> TlsFailedHosts = new(StringComparer.OrdinalIgnoreCase);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { NumberHandling = JsonNumberHandling.AllowReadingFromString };
    private readonly ActivityOptions _options = options.Value;

    public async Task<ActivitySearchResult> SearchAsync(ActivitySearchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        // Auf ~100 m runden: kleine Verschiebungen derselben Etappe nutzen denselben Cache.
        var cacheKey = CacheKey(request);
        if (cache.TryGetValue(cacheKey, out ActivitySearchResult? cached) && cached is not null)
        {
            return cached;
        }

        if (ReadFromDisk(request) is { } stored)
        {
            cache.Set(cacheKey, stored, CacheDuration);
            return stored;
        }

        // Läuft dieselbe Suche schon (z. B. weil im Frontend Filter oder Seiten gewechselt wurden, während sie lädt),
        // warten alle auf diese eine Abfrage. Sonst landen viele gleiche Anfragen gleichzeitig bei Overpass – und der
        // Server lehnt ab (504), weil er pro Absender nur wenige gleichzeitig erlaubt.
        var pendingKey = "pending:" + cacheKey;
        Lazy<Task<ActivitySearchResult>>? pending;
        lock (PendingGate)
        {
            if (!cache.TryGetValue(pendingKey, out pending) || pending is null)
            {
                pending = new Lazy<Task<ActivitySearchResult>>(() => LoadAsync(request, cacheKey, pendingKey));
                cache.Set(pendingKey, pending, TimeSpan.FromMinutes(5));
            }
        }

        // Bricht ein Aufrufer ab (Frontend wechselt den Filter), läuft die Suche für die anderen und den Cache weiter.
        return await pending.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task<ActivitySearchResult> LoadAsync(ActivitySearchRequest request, string cacheKey, string pendingKey)
    {
        try
        {
            var elements = await QueryOverpassAsync(request, CancellationToken.None).ConfigureAwait(false);
            var candidates = ToCandidates(elements, request.Center, request.Theme)
                .Where(c => c.DistanceKm * 1000 <= request.RadiusMeters) // Rechteck → Kreis
                .ToList();

            // Alle Orte mit Wikidata-Eintrag abfragen (früher nur die ersten 150 – in Großstädten fehlten dann viele Fotos),
            // in Paketen, damit die einzelne Abfrage klein bleibt.
            // Restaurants & Cafés haben selten Wikidata – dort keine Abfrage.
            var wikidataIds = request.Theme == ActivityTheme.Food
                ? []
                : candidates.Select(c => c.WikidataId).OfType<string>().Distinct().Take(MaxWikidataIds).ToList();
            var wikidata = new Dictionary<string, WikidataInfo>(StringComparer.Ordinal);
            var complete = true;
            foreach (var chunk in wikidataIds.Chunk(WikidataChunk))
            {
                var part = await QueryWikidataAsync([.. chunk], CancellationToken.None).ConfigureAwait(false);
                complete &= part is not null;
                foreach (var (id, info) in part ?? [])
                {
                    wikidata[id] = info;
                }
            }

            var result = new ActivitySearchResult(Rank(candidates, wikidata, _options.MaxResults), clock.GetUtcNow());
            // Ohne vollständige Wikidata-Antwort (Fotos, Beschreibungen) nur kurz merken und nicht auf die Festplatte –
            // sonst bleiben die Vorschläge 30 Tage ohne Bilder.
            cache.Set(cacheKey, result, complete ? CacheDuration : TimeSpan.FromMinutes(10));
            if (result.Activities.Count > 0 && complete)
            {
                WriteToDisk(request, result);
            }

            return result;
        }
        finally
        {
            // Fertig oder fehlgeschlagen: Nächste Anfrage liest den Cache bzw. versucht es neu.
            cache.Remove(pendingKey);
        }
    }

    /// <summary>Gibt es für diese Suche schon ein Ergebnis (Speicher oder Festplatte)? Für das Vorladen im Hintergrund.</summary>
    public bool IsCached(ActivitySearchRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return cache.TryGetValue(CacheKey(request), out ActivitySearchResult? _) || CacheFile(request) is { } file && IsFresh(file);
    }

    private static string CacheKey(ActivitySearchRequest request) => string.Create(
        CultureInfo.InvariantCulture,
        $"activities:{request.Theme}:{request.Center.Latitude:F3},{request.Center.Longitude:F3}:{request.RadiusMeters}");

    private string? CacheFile(ActivitySearchRequest request) => string.IsNullOrWhiteSpace(_options.CacheDirectory)
        ? null
        : Path.Combine(
            _options.CacheDirectory,
            string.Create(
                CultureInfo.InvariantCulture,
                $"{(request.Theme == ActivityTheme.Food ? "essen_" : string.Empty)}{request.Center.Latitude:F3}_{request.Center.Longitude:F3}_{request.RadiusMeters}.json"));

    private bool IsFresh(string file) =>
        File.Exists(file) && clock.GetUtcNow() - File.GetLastWriteTimeUtc(file) < TimeSpan.FromDays(_options.CacheDays);

    private ActivitySearchResult? ReadFromDisk(ActivitySearchRequest request)
    {
        if (CacheFile(request) is not { } file || !IsFresh(file))
        {
            return null;
        }

        try
        {
            using var stream = File.OpenRead(file);
            return JsonSerializer.Deserialize<ActivitySearchResult>(stream, Json);
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            LogFailed("Aktivitäten-Speicher", e);
            return null;
        }
    }

    private void WriteToDisk(ActivitySearchRequest request, ActivitySearchResult result)
    {
        if (CacheFile(request) is not { } file)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            var temp = file + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(result, Json));
            File.Move(temp, file, overwrite: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            LogFailed("Aktivitäten-Speicher", e);
        }
    }

    /// <summary>
    /// Overpass-Abfrage: Sehenswürdigkeiten, Museen, Aussichtspunkte, Burgen, Strände, Parks …
    /// Gesucht wird in einem Rechteck um den Mittelpunkt (globales [bbox]) – das nutzt den räumlichen Index des Servers
    /// und ist bei großem Umkreis viel schneller als „around“. Was außerhalb des Kreises liegt, fällt danach heraus.
    /// </summary>
    internal static string BuildQuery(ActivitySearchRequest request)
    {
        var (south, west, north, east) = BoundingBox(request);
        var bbox = string.Create(CultureInfo.InvariantCulture, $"[bbox:{south:F5},{west:F5},{north:F5},{east:F5}]");
        if (request.Theme == ActivityTheme.Food)
        {
            // Restaurants, Cafés, Bars und Eisdielen mit Namen (ohne Imbissketten/Fast Food).
            return $"[out:json][timeout:25]{bbox};(nwr[\"amenity\"~\"^(restaurant|cafe|bar|pub|biergarten|ice_cream)$\"][\"name\"];);out center tags 800;";
        }

        var parts = new[]
        {
            "nwr[\"tourism\"~\"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$\"][\"name\"];",
            "nwr[\"historic\"~\"^(castle|fort|palace|monument|ruins|archaeological_site|city_gate)$\"][\"name\"];",
            "nwr[\"natural\"=\"beach\"][\"name\"];",
            "nwr[\"leisure\"=\"water_park\"][\"name\"];",
            // Häufige Arten nur, wenn sie einen Wikidata-Eintrag haben (sonst jede kleine Kapelle und jeder Spielplatz).
            "nwr[\"leisure\"~\"^(park|garden|nature_reserve)$\"][\"name\"][\"wikidata\"];",
            "nwr[\"amenity\"=\"place_of_worship\"][\"name\"][\"wikidata\"];",
            "nwr[\"historic\"=\"memorial\"][\"name\"][\"wikidata\"];",
            "nwr[\"natural\"=\"peak\"][\"name\"][\"wikidata\"];",
        };
        return $"[out:json][timeout:25]{bbox};({string.Concat(parts)});out center tags 800;";
    }

    internal static (double South, double West, double North, double East) BoundingBox(ActivitySearchRequest request)
    {
        var dLat = request.RadiusMeters / 111_320.0;
        var dLon = request.RadiusMeters / (111_320.0 * Math.Max(0.05, Math.Cos(request.Center.Latitude * Math.PI / 180)));
        return (
            Math.Max(-90, request.Center.Latitude - dLat),
            Math.Max(-180, request.Center.Longitude - dLon),
            Math.Min(90, request.Center.Latitude + dLat),
            Math.Min(180, request.Center.Longitude + dLon));
    }

    /// <summary>Probiert die Overpass-Server nacheinander; gemeldet wird nur, wenn keiner antwortet.</summary>
    private async Task<List<OverpassElement>> QueryOverpassAsync(ActivitySearchRequest request, CancellationToken cancellationToken)
    {
        var query = BuildQuery(request);
        var problems = new List<string>();
        // Server, mit denen keine verschlüsselte Verbindung zustande kam (z. B. nur TLS 1.3 auf einem System ohne TLS 1.3),
        // kommen ans Ende – so kostet nicht jede Suche erst einen Fehlversuch.
        var urls = _options.OverpassUrls.Where(u => !string.IsNullOrWhiteSpace(u)).OrderBy(u => TlsFailedHosts.ContainsKey(HostOf(u))).ToList();
        foreach (var url in urls)
        {
            var host = HostOf(url);
            try
            {
                using var content = new FormUrlEncodedContent([new KeyValuePair<string, string>("data", query)]);
                using var response = await http.PostAsync(url, content, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    LogFailedStatus($"Overpass ({host})", (int)response.StatusCode);
                    problems.Add((int)response.StatusCode == 429 ? "ausgelastet" : $"Fehler {(int)response.StatusCode}");
                    continue;
                }

                var body = await response.Content.ReadFromJsonAsync<OverpassResponse>(Json, cancellationToken).ConfigureAwait(false);
                // Bei Zeitüberschreitung antwortet Overpass mit 200 und einem „remark“ statt Daten.
                if (body?.Remark is { } remark && remark.Contains("error", StringComparison.OrdinalIgnoreCase) && (body.Elements?.Count ?? 0) == 0)
                {
                    LogRemark(host, remark);
                    problems.Add("Zeitüberschreitung");
                    continue;
                }

                TlsFailedHosts.TryRemove(host, out _);
                return body?.Elements ?? [];
            }
            catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
            {
                LogFailed($"Overpass ({host})", e);
                if (e.InnerException is AuthenticationException)
                {
                    TlsFailedHosts[host] = 0;
                }

                problems.Add(e is TaskCanceledException ? "Zeitüberschreitung" : "nicht erreichbar");
            }
        }

        throw new ActivitySearchUnavailableException(
            problems.Count > 0 && problems.All(p => p == "ausgelastet")
                ? "Die OpenStreetMap-Server sind gerade ausgelastet. Bitte in einer Minute nochmal versuchen."
                : $"OpenStreetMap ist gerade nicht erreichbar ({string.Join(", ", problems.Distinct())}). Kleinerer Umkreis oder später nochmal versuchen.");
    }

    internal const int WikidataChunk = 100;

    internal const int MaxWikidataIds = 600;

    /// <summary>
    /// Holt Beschreibung, Foto, Wikipedia-Link und Bekanntheit. Fehler sind nicht schlimm – dann eben ohne;
    /// <c>null</c> heißt „Abfrage fehlgeschlagen“ (Ergebnis dann nicht dauerhaft speichern).
    /// </summary>
    private async Task<Dictionary<string, WikidataInfo>?> QueryWikidataAsync(List<string> ids, CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return new Dictionary<string, WikidataInfo>();
        }

        try
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, _options.WikidataSparqlUrl)
            {
                Content = new FormUrlEncodedContent([new KeyValuePair<string, string>("query", BuildSparql(ids))]),
            };
            message.Headers.Accept.ParseAdd("application/sparql-results+json");
            using var response = await http.SendAsync(message, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                LogFailedStatus("Wikidata", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<SparqlResponse>(Json, cancellationToken).ConfigureAwait(false);
            return ParseWikidata(body);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogFailed("Wikidata", e);
            return null;
        }
    }

    internal static string BuildSparql(IEnumerable<string> ids) =>
        $$"""
        SELECT ?item ?label ?desc ?descEn ?image ?links ?dewiki ?enwiki WHERE {
          VALUES ?item { {{string.Join(' ', ids.Where(IsWikidataId).Select(id => "wd:" + id))}} }
          OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "de") }
          OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "de") }
          OPTIONAL { ?item schema:description ?descEn FILTER(LANG(?descEn) = "en") }
          OPTIONAL { ?item wdt:P18 ?image }
          OPTIONAL { ?item wikibase:sitelinks ?links }
          OPTIONAL { ?dewiki schema:about ?item; schema:isPartOf <https://de.wikipedia.org/> }
          OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
        }
        """;

    internal static Dictionary<string, WikidataInfo> ParseWikidata(SparqlResponse? body)
    {
        var result = new Dictionary<string, WikidataInfo>(StringComparer.Ordinal);
        foreach (var row in body?.Results?.Bindings ?? [])
        {
            var uri = Value(row, "item");
            var id = uri?[(uri.LastIndexOf('/') + 1)..];
            if (id is null || !IsWikidataId(id) || result.ContainsKey(id))
            {
                continue; // mehrere Fotos → mehrere Zeilen; das erste reicht
            }

            var image = Value(row, "image");
            result[id] = new WikidataInfo(
                Value(row, "label"),
                Value(row, "desc") ?? Value(row, "descEn"),
                image is null ? null : image.Replace("http://", "https://", StringComparison.Ordinal) + "?width=480",
                int.TryParse(Value(row, "links"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var links) ? links : 0,
                Value(row, "dewiki") ?? Value(row, "enwiki"));
        }

        return result;
    }

    internal static List<Candidate> ToCandidates(IEnumerable<OverpassElement> elements, Coordinates center, ActivityTheme theme = ActivityTheme.Sights)
    {
        var list = new List<Candidate>();
        foreach (var e in elements)
        {
            var tags = e.Tags ?? new Dictionary<string, string>();
            var name = Tag(tags, "name:de") ?? Tag(tags, "name");
            var lat = e.Lat ?? e.Center?.Lat;
            var lon = e.Lon ?? e.Center?.Lon;
            var kind = theme == ActivityTheme.Food ? ClassifyFood(tags) : Classify(tags);
            if (name is null || lat is null || lon is null || kind is not { } category)
            {
                continue;
            }

            var wikidata = Tag(tags, "wikidata");
            list.Add(new Candidate(
                $"{e.Type}/{e.Id}",
                name,
                category,
                lat.Value,
                lon.Value,
                Math.Round(GeoMath.DistanceKm(center, new Coordinates(lat.Value, lon.Value)), 2),
                wikidata is not null && IsWikidataId(wikidata) ? wikidata : null,
                WikipediaUrl(Tag(tags, "wikipedia")),
                CommonsImage(Tag(tags, "wikimedia_commons")) ?? WebUrl(Tag(tags, "image")),
                WebUrl(Tag(tags, "website") ?? Tag(tags, "contact:website")),
                Tag(tags, "opening_hours"),
                Tag(tags, "fee") switch
                {
                    "no" => true,
                    "yes" => false,
                    _ => null,
                },
                theme == ActivityTheme.Food ? FoodTags.Cuisine(Tag(tags, "cuisine")) : null,
                theme == ActivityTheme.Food ? FoodTags.Diet(tags) : null,
                theme == ActivityTheme.Food ? Tag(tags, "phone") ?? Tag(tags, "contact:phone") : null));
        }

        // Doppelte zusammenfassen: gleicher Wikidata-Eintrag, oder gleicher Name in unmittelbarer Nähe (Gebäude + Punkt).
        var unique = new List<Candidate>();
        foreach (var c in list.OrderBy(c => c.Id.StartsWith("node/", StringComparison.Ordinal) ? 1 : 0))
        {
            var duplicate = unique.Any(u =>
                (c.WikidataId is not null && c.WikidataId == u.WikidataId) ||
                (string.Equals(c.Name, u.Name, StringComparison.OrdinalIgnoreCase) &&
                    GeoMath.DistanceKm(new Coordinates(c.Latitude, c.Longitude), new Coordinates(u.Latitude, u.Longitude)) < 0.3));
            if (!duplicate)
            {
                unique.Add(c);
            }
        }

        return unique;
    }

    /// <summary>Bekannte Orte (viele Wikipedia-Sprachen), mit Foto und nah am Zentrum kommen zuerst.</summary>
    internal static List<ActivitySuggestion> Rank(List<Candidate> candidates, Dictionary<string, WikidataInfo> wikidata, int max) =>
    [
        .. candidates
            .Select(c =>
            {
                var info = c.WikidataId is null ? null : wikidata.GetValueOrDefault(c.WikidataId);
                var popularity = info?.Sitelinks ?? 0;
                var image = c.ImageUrl ?? info?.ImageUrl;
                var wikipedia = info?.WikipediaUrl ?? c.WikipediaUrl;
                // Essen & Trinken: Nähe zählt viel mehr, dazu ob man etwas über den Ort weiß (Küche, Öffnungszeiten, Website).
                var food = FoodTags.IsFood(c.Category);
                var score = food
                    ? (c.Cuisine is null ? 0 : 2) + (c.OpeningHours is null ? 0 : 1) + (c.Website is null ? 0 : 1) + (c.Diet is null ? 0 : 1) - (c.DistanceKm * 4)
                    : (10 * Math.Log2(1 + popularity)) + Weight(c.Category) + (image is null ? 0 : 4) + (wikipedia is null ? 0 : 3) - (c.DistanceKm * 0.5);
                var suggestion = new ActivitySuggestion(
                    c.Id,
                    c.Name,
                    c.Category,
                    c.Latitude,
                    c.Longitude,
                    c.DistanceKm,
                    Capitalize(info?.Description),
                    image,
                    wikipedia,
                    c.Website,
                    c.OpeningHours,
                    c.FreeEntry,
                    popularity,
                    c.WikidataId,
                    c.Cuisine,
                    c.Diet,
                    c.Phone);
                return (suggestion, score);
            })
            .OrderByDescending(x => x.score)
            .ThenBy(x => x.suggestion.DistanceKm)
            .Take(max)
            .Select(x => x.suggestion),
    ];

    internal static ActivityCategory? Classify(IReadOnlyDictionary<string, string> tags)
    {
        var tourism = Tag(tags, "tourism");
        var historic = Tag(tags, "historic");
        var leisure = Tag(tags, "leisure");
        var natural = Tag(tags, "natural");
        return true switch
        {
            _ when tourism is "museum" or "gallery" => ActivityCategory.Museum,
            _ when tourism is "zoo" or "aquarium" => ActivityCategory.Zoo,
            _ when tourism is "theme_park" || leisure is "water_park" => ActivityCategory.ThemePark,
            _ when tourism is "viewpoint" => ActivityCategory.Viewpoint,
            _ when historic is "castle" or "fort" or "palace" => ActivityCategory.Castle,
            _ when Tag(tags, "amenity") is "place_of_worship" => ActivityCategory.Religious,
            _ when natural is "beach" => ActivityCategory.Beach,
            _ when leisure is "park" or "garden" or "nature_reserve" || natural is "peak" => ActivityCategory.Nature,
            _ when tourism is "attraction" || historic is not null => ActivityCategory.Sight,
            _ => null,
        };
    }

    internal static ActivityCategory? ClassifyFood(IReadOnlyDictionary<string, string> tags) => Tag(tags, "amenity") switch
    {
        "restaurant" => ActivityCategory.Restaurant,
        "cafe" => ActivityCategory.Cafe,
        "bar" or "pub" or "biergarten" => ActivityCategory.Bar,
        "ice_cream" => ActivityCategory.IceCream,
        _ => null,
    };

    private static int Weight(ActivityCategory category) => category switch
    {
        ActivityCategory.Museum or ActivityCategory.Castle => 6,
        ActivityCategory.Sight or ActivityCategory.Viewpoint or ActivityCategory.Zoo or ActivityCategory.ThemePark => 5,
        ActivityCategory.Nature or ActivityCategory.Beach => 4,
        _ => 3,
    };

    private static string? Tag(IReadOnlyDictionary<string, string> tags, string key) =>
        tags.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;

    private static string? Value(Dictionary<string, SparqlValue> row, string key) =>
        row.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v.Value) ? v.Value : null;

    private static bool IsWikidataId(string id) => id.Length > 1 && id[0] == 'Q' && id[1..].All(char.IsAsciiDigit);

    /// <summary>OSM-Tag „pt:Mosteiro dos Jerónimos“ → https://pt.wikipedia.org/wiki/Mosteiro_dos_Jerónimos</summary>
    internal static string? WikipediaUrl(string? tag)
    {
        var colon = tag?.IndexOf(':', StringComparison.Ordinal) ?? -1;
        if (tag is null || colon is < 2 or > 3)
        {
            return null; // Sprachcodes wie „de“ oder „pt“; „https://…“ ist kein Wikipedia-Tag
        }

        var lang = tag[..colon];
        var title = tag[(colon + 1)..].Trim().Replace(' ', '_');
        return lang.All(char.IsAsciiLetterLower) && title.Length > 0 && !title.StartsWith('/')
            ? $"https://{lang}.wikipedia.org/wiki/{Uri.EscapeDataString(title)}"
            : null;
    }

    /// <summary>OSM-Tag „File:Belém Tower.jpg“ → Vorschaubild über Wikimedia Commons.</summary>
    private static string? CommonsImage(string? tag) =>
        tag is not null && tag.StartsWith("File:", StringComparison.OrdinalIgnoreCase)
            ? $"https://commons.wikimedia.org/wiki/Special:FilePath/{Uri.EscapeDataString(tag[5..].Trim().Replace(' ', '_'))}?width=480"
            : null;

    private static string? WebUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp) ? uri.ToString() : null;

    private static string? Capitalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var builder = new StringBuilder(text.Trim());
        builder[0] = char.ToUpperInvariant(builder[0]);
        return builder.ToString();
    }

    private static string HostOf(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : url;

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Service} antwortete mit {Status}")]
    private partial void LogFailedStatus(string service, int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Overpass ({Host}) meldet: {Remark}")]
    private partial void LogRemark(string host, string remark);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Service}-Anfrage fehlgeschlagen")]
    private partial void LogFailed(string service, Exception exception);
}

internal sealed record Candidate(
    string Id,
    string Name,
    ActivityCategory Category,
    double Latitude,
    double Longitude,
    double DistanceKm,
    string? WikidataId,
    string? WikipediaUrl,
    string? ImageUrl,
    string? Website,
    string? OpeningHours,
    bool? FreeEntry,
    string? Cuisine = null,
    string? Diet = null,
    string? Phone = null);

internal sealed record WikidataInfo(string? Label, string? Description, string? ImageUrl, int Sitelinks, string? WikipediaUrl);

// Overpass: { "elements": [ { "type": "way", "id": 1, "center": { "lat": …, "lon": … }, "tags": { … } } ] }
internal sealed record OverpassResponse(List<OverpassElement>? Elements, string? Remark);

internal sealed record OverpassElement(string Type, long Id, double? Lat, double? Lon, OverpassCenter? Center, Dictionary<string, string>? Tags);

internal sealed record OverpassCenter(double Lat, double Lon);

// SPARQL JSON: { "results": { "bindings": [ { "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q1" }, … } ] } }
internal sealed record SparqlResponse(SparqlResults? Results);

internal sealed record SparqlResults(List<Dictionary<string, SparqlValue>>? Bindings);

internal sealed record SparqlValue(string? Value);
