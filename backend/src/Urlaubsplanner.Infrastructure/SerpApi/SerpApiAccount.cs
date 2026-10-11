using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Infrastructure.SerpApi;

/// <summary>
/// Kontingent des SerpApi-Kontos (gilt für Flüge und Hotels zusammen). Die Konto-Abfrage ist kostenlos
/// und zählt nicht als Suche; das Ergebnis wird kurz gecacht und nach jeder echten Suche verworfen.
/// </summary>
internal static class SerpApiAccount
{
    private const string CacheKey = "serpapi:quota";

    internal static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public static async Task<SearchQuota?> GetQuotaAsync(
        HttpClient http,
        IMemoryCache cache,
        string apiKey,
        Action<Exception> logFailed,
        CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out SearchQuota? cached))
        {
            return cached;
        }

        try
        {
            using var response = await http.GetAsync($"account.json?api_key={Uri.EscapeDataString(apiKey)}", cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            var account = await JsonSerializer.DeserializeAsync<AccountResponse>(stream, Json, cancellationToken).ConfigureAwait(false);
            var left = account?.TotalSearchesLeft ?? account?.PlanSearchesLeft;
            var quota = left is null ? null : new SearchQuota(left.Value, account?.SearchesPerMonth ?? 0);
            cache.Set(CacheKey, quota, TimeSpan.FromSeconds(15));
            return quota;
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logFailed(e);
            return null;
        }
    }

    public static void ForgetQuota(IMemoryCache cache) => cache.Remove(CacheKey);

    private sealed record AccountResponse(int? PlanSearchesLeft, int? TotalSearchesLeft, int? SearchesPerMonth);
}
