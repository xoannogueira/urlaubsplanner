using Urlaubsplanner.Api.Endpoints;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.PriceWatch;

/// <summary>
/// Prüft beobachtete Flüge höchstens einmal am Tag, solange die App läuft. Fällt der Preis, merkt er sich den alten
/// Preis für den Hinweis in der App. Ohne SerpApi-Key, bei leerem Kontingent oder Fehlern wird es später neu versucht.
/// </summary>
public sealed partial class PriceWatcher(
    PriceWatchStore store,
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<PriceWatcher> logger) : BackgroundService
{
    public static readonly TimeSpan CheckEvery = TimeSpan.FromHours(24);
    private static readonly TimeSpan Tick = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            // Erst die App in Ruhe starten lassen.
            await Task.Delay(TimeSpan.FromMinutes(1), clock, stoppingToken).ConfigureAwait(false);
            while (!stoppingToken.IsCancellationRequested)
            {
                await CheckDueAsync(stoppingToken).ConfigureAwait(false);
                await Task.Delay(Tick, clock, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // App wird beendet.
        }
    }

    /// <summary>Alle fälligen Flüge prüfen (einer nach dem anderen, um das Kontingent nicht auf einmal zu belasten).</summary>
    internal async Task CheckDueAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        foreach (var watch in store.List().Where(w => w.CheckedAt is null || now - w.CheckedAt >= CheckEvery))
        {
            // Flug oder Reise inzwischen gelöscht: nicht mehr beobachten.
            using (var scope = scopes.CreateScope())
            {
                var trip = await scope.ServiceProvider.GetRequiredService<Urlaubsplanner.Domain.Trips.ITripRepository>().GetAsync(watch.TripId, ct).ConfigureAwait(false);
                if (trip is null || trip.Options.All(o => o.Id != watch.OptionId))
                {
                    store.Remove(watch.OptionId);
                    continue;
                }
            }

            await CheckAsync(watch, ct).ConfigureAwait(false);
        }
    }

    private async Task CheckAsync(PriceWatchEntry watch, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var search = scope.ServiceProvider.GetRequiredService<IFlightSearch>();
        try
        {
            var (journey, fare, _) = await FlightEndpoints.RecheckAsync(search, watch.Signature, watch.Adults, CabinClass.Economy, FlightEndpoints.Today(clock), ct)
                .ConfigureAwait(false);
            store.Update(watch.OptionId, w => Apply(w, journey is not null, fare?.TotalPrice, clock.GetUtcNow()));
        }
        catch (Exception e) when (e is FlightSearchUnavailableException or FlightSearchNotConfiguredException or DomainException or HttpRequestException)
        {
            LogFailed(watch.Title, e);
            store.Update(watch.OptionId, w => w with { CheckedAt = clock.GetUtcNow(), Problem = Explain(e) });
        }
    }

    /// <summary>Neues Ergebnis eintragen: gefallener Preis → DropFrom = bisheriger Preis.</summary>
    internal static PriceWatchEntry Apply(PriceWatchEntry w, bool available, decimal? price, DateTimeOffset now)
    {
        if (!available || price is null)
        {
            return w with { Unavailable = true, CheckedAt = now, Problem = null };
        }

        var previous = w.LastPrice ?? w.StartPrice;
        var drop = price < previous ? previous : w.DropFrom;
        // Wieder teurer als vor dem Fallen: Hinweis zurücknehmen.
        if (drop is { } d && price >= d)
        {
            drop = null;
        }

        return w with { LastPrice = price, DropFrom = drop, Unavailable = false, CheckedAt = now, Problem = null };
    }

    private static string Explain(Exception e) => e switch
    {
        FlightSearchNotConfiguredException => "Kein SerpApi-Key eingetragen.",
        FlightSearchUnavailableException u => u.Message,
        _ => "Prüfung fehlgeschlagen – nächster Versuch morgen.",
    };

    [LoggerMessage(Level = LogLevel.Warning, Message = "Preiswächter: {Title} konnte nicht geprüft werden")]
    private partial void LogFailed(string title, Exception exception);
}
