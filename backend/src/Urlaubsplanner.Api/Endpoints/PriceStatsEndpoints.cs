using Urlaubsplanner.Api.PriceStats;
using Urlaubsplanner.Domain;

namespace Urlaubsplanner.Api.Endpoints;

/// <summary>Preis-Statistik aus dem eigenen Preisarchiv und Googles Preisverlauf (nur Lesen).</summary>
public static class PriceStatsEndpoints
{
    public static IEndpointRouteBuilder MapPriceStatsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/price-stats").WithTags("Preis-Statistik");

        // Welche Strecken gibt es im Archiv? (für die Auswahl)
        group.MapGet("/routes", (PriceArchive archive) => TypedResults.Ok(
            archive.Records()
                .GroupBy(r => (r.Origin, r.Destination))
                .Select(g => new
                {
                    g.Key.Origin,
                    g.Key.Destination,
                    Count = g.Count(),
                    LastSearched = g.Max(r => r.SearchedAt),
                    Cheapest = g.Min(r => r.PricePerAdult),
                })
                .OrderByDescending(r => r.LastSearched)
                .ToList()));

        // Alle Einträge einer Strecke plus Preisverläufe – das Frontend rechnet die Diagramme daraus.
        group.MapGet("/", (string? origin, string? destination, PriceArchive archive, TimeProvider clock) =>
        {
            var from = Code(origin, "origin");
            var to = Code(destination, "destination");
            archive.Touch(from, to, clock.GetUtcNow());
            return TypedResults.Ok(new { Records = archive.Records(from, to), Histories = archive.Histories(from, to) });
        });
        return app;
    }

    private static string Code(string? value, string field)
    {
        var code = value?.Trim().ToUpperInvariant() ?? string.Empty;
        return code.Length == 3 && code.All(char.IsAsciiLetterUpper) ? code : throw new DomainException(field, "Flughafen als dreistelliger Code, z. B. STR.");
    }
}
