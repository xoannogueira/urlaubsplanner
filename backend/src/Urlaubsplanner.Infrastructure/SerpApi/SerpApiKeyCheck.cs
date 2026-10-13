using System.Net;
using System.Text.Json;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Infrastructure.SerpApi;

/// <summary>Prüft einen SerpApi-Key über die kostenlose Konto-Abfrage (account.json).</summary>
public sealed class SerpApiKeyCheck(HttpClient http) : ISearchKeyCheck
{
    public async Task<SearchQuota?> CheckAsync(string apiKey, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(apiKey);
        try
        {
            using var response = await http.GetAsync($"account.json?api_key={Uri.EscapeDataString(apiKey)}", cancellationToken).ConfigureAwait(false);
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ||
                text.Contains("Invalid API key", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new KeyCheckUnavailableException($"SerpApi hat mit Fehler {(int)response.StatusCode} geantwortet – bitte später nochmal versuchen.");
            }

            var account = JsonSerializer.Deserialize<Account>(text, SerpApiAccount.Json);
            var left = account?.TotalSearchesLeft ?? account?.PlanSearchesLeft;
            return new SearchQuota(left ?? 0, account?.SearchesPerMonth ?? 0);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            throw new KeyCheckUnavailableException("SerpApi ist gerade nicht erreichbar – bist du online?", e);
        }
    }

    private sealed record Account(int? PlanSearchesLeft, int? TotalSearchesLeft, int? SearchesPerMonth);
}
