using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Infrastructure.Travelpayouts;

/// <summary>
/// Kostenlose Richtpreise von Aviasales (Travelpayouts Data API). Der Token geht im Header mit, nie in der Adresse –
/// so landet er auch nicht im Log.
/// Genutzt wird <c>v2/prices/month-matrix</c>: günstigster einfacher Flug pro Abflugtag eines Monats.
/// </summary>
public sealed class TravelpayoutsFares(HttpClient http, IOptionsMonitor<TravelpayoutsOptions> options) : IIndicativeFares
{
    private TravelpayoutsOptions Options => options.CurrentValue;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Options.Token);

    public async Task<IndicativeSourceState> CheckAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return IndicativeSourceState.Missing;
        }

        try
        {
            // Kleinste Abfrage: eine viel geflogene Strecke, nächster Monat. Leere Daten sind auch in Ordnung.
            var month = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(1);
            await MonthAsync("FRA", "BCN", month, cancellationToken).ConfigureAwait(false);
            return IndicativeSourceState.Ok;
        }
        catch (IndicativeFaresException e)
        {
            return e.State;
        }
    }

    public async Task<IReadOnlyList<IndicativeFare>> MonthAsync(string origin, string destination, DateOnly month, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new IndicativeFaresException(IndicativeSourceState.Missing, "Kein Travelpayouts-Token hinterlegt.");
        }

        var first = new DateOnly(month.Year, month.Month, 1);
        var common = $"origin={Uri.EscapeDataString(origin)}&destination={Uri.EscapeDataString(destination)}&currency=eur&market={Uri.EscapeDataString(Options.Market)}";
        // limit=31: sonst fehlt in langen Monaten der letzte Tag.
        var url = $"v2/prices/month-matrix?{common}&month={first:yyyy-MM-dd}&limit=31&show_to_affiliates=true";
        using var document = await GetAsync(url, cancellationToken).ConfigureAwait(false);
        var data = document.RootElement.TryGetProperty("data", out var d) ? d : default;
        var fares = ParseMatrix(data);
        return [.. fares.Where(f => f.Date.Year == first.Year && f.Date.Month == first.Month && f.Price > 0).OrderBy(f => f.Date)];
    }

    public async Task<IReadOnlyList<IndicativeFlight>> DayAsync(string origin, string destination, DateOnly day, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new IndicativeFaresException(IndicativeSourceState.Missing, "Kein Travelpayouts-Token hinterlegt.");
        }

        var url = $"aviasales/v3/prices_for_dates?origin={Uri.EscapeDataString(origin)}&destination={Uri.EscapeDataString(destination)}"
            + $"&departure_at={day:yyyy-MM-dd}&one_way=true&direct=false&currency=eur&market={Uri.EscapeDataString(Options.Market)}"
            + "&sorting=price&unique=false&limit=5";
        using var document = await GetAsync(url, cancellationToken).ConfigureAwait(false);
        var data = document.RootElement.TryGetProperty("data", out var d) ? d : default;
        return [.. ParseFlights(data).Where(f => f.Departure.StartsWith(day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), StringComparison.Ordinal)).OrderBy(f => f.Price)];
    }

    private async Task<JsonDocument> GetAsync(string url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Access-Token", Options.Token);
        HttpResponseMessage response;
        string text;
        try
        {
            response = await http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            throw new IndicativeFaresException(IndicativeSourceState.Unreachable, "Aviasales ist gerade nicht erreichbar – bist du online?", e);
        }

        using (response)
        {
            switch (response.StatusCode)
            {
                case HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden:
                    throw new IndicativeFaresException(IndicativeSourceState.Rejected, "Aviasales lehnt den Token ab (ungültig oder gesperrt).");
                case HttpStatusCode.TooManyRequests:
                    throw new IndicativeFaresException(IndicativeSourceState.Limited, "Zu viele Abfragen bei Aviasales – bitte später nochmal.");
                case >= HttpStatusCode.InternalServerError:
                    throw new IndicativeFaresException(IndicativeSourceState.Unreachable, $"Aviasales hat mit Fehler {(int)response.StatusCode} geantwortet.");
                default:
                    break;
            }

            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(text);
            }
            catch (JsonException e)
            {
                throw new IndicativeFaresException(IndicativeSourceState.Unreachable, "Aviasales hat keine lesbare Antwort geschickt.", e);
            }

            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.False)
            {
                var error = root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String ? err.GetString() : null;
                document.Dispose();
                var rejected = error is not null && (error.Contains("token", StringComparison.OrdinalIgnoreCase) || error.Contains("unauthorized", StringComparison.OrdinalIgnoreCase));
                throw new IndicativeFaresException(
                    rejected ? IndicativeSourceState.Rejected : IndicativeSourceState.Unreachable,
                    rejected ? "Aviasales lehnt den Token ab (ungültig oder gesperrt)." : $"Aviasales meldet einen Fehler: {error ?? "unbekannt"}");
            }

            if (!response.IsSuccessStatusCode)
            {
                document.Dispose();
                throw new IndicativeFaresException(IndicativeSourceState.Unreachable, $"Aviasales hat mit Fehler {(int)response.StatusCode} geantwortet.");
            }

            return document;
        }
    }

    /// <summary>month-matrix: <c>data</c> ist eine Liste mit <c>depart_date</c>, <c>value</c>, <c>number_of_changes</c>.</summary>
    private static IEnumerable<IndicativeFare> ParseMatrix(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Array)
        {
            yield break;
        }

        foreach (var x in data.EnumerateArray())
        {
            // „actual: false“ = Angebot gilt laut Aviasales nicht mehr.
            if (x.TryGetProperty("actual", out var actual) && actual.ValueKind == JsonValueKind.False)
            {
                continue;
            }

            if (Date(x, "depart_date") is { } date && Number(x, "value") is { } price)
            {
                yield return new IndicativeFare(date, price, Text(x, "airline"), (int?)Number(x, "number_of_changes"), Date(x, "found_at"));
            }
        }
    }

    /// <summary>prices_for_dates: Liste mit departure_at, price, airline, flight_number, transfers, duration_to, link.</summary>
    private static IEnumerable<IndicativeFlight> ParseFlights(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Array)
        {
            yield break;
        }

        foreach (var x in data.EnumerateArray())
        {
            if (Text(x, "departure_at") is not { Length: >= 16 } departure || Number(x, "price") is not { } price)
            {
                continue;
            }

            // Nur Pfade auf Aviasales selbst übernehmen – nie eine fremde Adresse aus der Antwort.
            var path = Text(x, "link");
            var link = path is not null && path.StartsWith("/search/", StringComparison.Ordinal) ? "https://www.aviasales.com" + path : null;
            yield return new IndicativeFlight(
                departure[..16],
                price,
                Text(x, "airline"),
                Text(x, "flight_number"),
                (int?)Number(x, "transfers"),
                (int?)(Number(x, "duration_to") ?? Number(x, "duration")),
                link,
                SearchDate(path));
        }
    }

    /// <summary>Im Link steht, wann gesucht wurde: „search_date=21102026“.</summary>
    private static DateOnly? SearchDate(string? link)
    {
        var at = link?.IndexOf("search_date=", StringComparison.Ordinal) ?? -1;
        return at >= 0 && link!.Length >= at + 20
            && DateOnly.TryParseExact(link.Substring(at + 12, 8), "ddMMyyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : null;
    }

    private static DateOnly? Date(JsonElement x, string name) =>
        x.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: >= 10 } s
            && DateOnly.TryParseExact(s[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : null;

    private static decimal? Number(JsonElement x, string name) =>
        x.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var n) ? n : null;

    private static string? Text(JsonElement x, string name) =>
        x.TryGetProperty(name, out var v)
            ? v.ValueKind switch
            {
                JsonValueKind.String => v.GetString() is { Length: > 0 } s ? s : null,
                JsonValueKind.Number => v.GetRawText(),
                _ => null,
            }
            : null;
}
