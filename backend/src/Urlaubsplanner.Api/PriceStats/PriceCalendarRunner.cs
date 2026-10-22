using Urlaubsplanner.Api.Endpoints;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.PriceStats;

/// <summary>
/// Lädt einen Preiskalender: eine Google-Suche pro Abflugtag, nacheinander mit kurzer Pause (schont Kontingent und
/// Server). Jeder Tag wird sofort gespeichert und landet auch im Preisarchiv. Es läuft immer nur ein Kalender.
/// </summary>
public sealed partial class PriceCalendarRunner(
    PriceCalendarStore store,
    PriceArchive archive,
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<PriceCalendarRunner> logger) : IDisposable
{
    /// <summary>Pause zwischen zwei Suchen.</summary>
    public static TimeSpan Pause { get; set; } = TimeSpan.FromSeconds(1.5);

    private readonly Lock _gate = new();
    private CancellationTokenSource? _running;
    private Guid? _runningId;

    public async Task<PriceCalendar> StartAsync(PriceCalendarRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        var today = FlightEndpoints.Today(clock);
        var dates = PriceCalendarRules.Dates(request, today);
        // Flughäfen wie bei der normalen Suche prüfen (Codes, höchstens 4 pro Seite).
        FlightQuery.Combine(Legs(request, dates[0]), 1, CabinClass.Economy, today);

        using (var scope = scopes.CreateScope())
        {
            var search = scope.ServiceProvider.GetRequiredService<IFlightSearch>();
            if (search is not IMultiAirportFlightSearch || !search.IsConfigured)
            {
                throw new DomainException("origins", "Preiskalender gehen nur mit der Google-Flugsuche (SerpApi-Key in den Einstellungen).");
            }

            if (search is IFlightSearchQuota q && await q.GetQuotaAsync(ct).ConfigureAwait(false) is { } quota
                && dates.Count > quota.Left - PriceCalendarRules.KeepForNormalSearches)
            {
                throw new DomainException("pattern", $"Das wären {dates.Count} Google-Suchen, übrig sind noch {quota.Left} diesen Monat. Kürzerer Zeitraum oder seltener suchen.");
            }
        }

        lock (_gate)
        {
            if (_running is not null)
            {
                throw new DomainException("origins", "Es lädt schon ein Preiskalender – erst warten oder abbrechen.");
            }

            var now = clock.GetUtcNow();
            var calendar = new PriceCalendar(
                Guid.NewGuid(),
                [.. request.Origins.Select(FlightSearchRequest.NormalizeCode)],
                [.. request.Destinations.Select(FlightSearchRequest.NormalizeCode)],
                request.From,
                request.To,
                request.Nights,
                request.Pattern,
                now,
                now,
                CalendarState.Running,
                dates.Count,
                [],
                null);
            store.Save(calendar);
            _running = new CancellationTokenSource();
            _runningId = calendar.Id;
            var token = _running.Token;
            _ = Task.Run(() => RunAsync(calendar, request, dates, token), CancellationToken.None);
            return calendar;
        }
    }

    public bool Cancel(Guid id)
    {
        lock (_gate)
        {
            if (_runningId != id || _running is null)
            {
                return false;
            }

            _running.Cancel();
            return true;
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _running?.Cancel();
            _running?.Dispose();
        }
    }

    private static List<FlightLegOptions> Legs(PriceCalendarRequest r, DateOnly date) =>
        r.Nights is { } nights
            ? [new(r.Origins, r.Destinations, date), new(r.Destinations, r.Origins, date.AddDays(nights))]
            : [new(r.Origins, r.Destinations, date)];

    private async Task RunAsync(PriceCalendar calendar, PriceCalendarRequest request, IReadOnlyList<DateOnly> dates, CancellationToken ct)
    {
        var failures = 0;
        try
        {
            foreach (var date in dates)
            {
                ct.ThrowIfCancellationRequested();
                var day = await SearchDayAsync(request, date, ct).ConfigureAwait(false);
                failures = day.Problem is null ? 0 : failures + 1;
                store.Update(calendar.Id, c => c with { Days = [.. c.Days, day] });
                if (failures >= 3)
                {
                    store.Update(calendar.Id, c => c with { State = CalendarState.Failed, Problem = day.Problem });
                    return;
                }

                await Task.Delay(Pause, clock, ct).ConfigureAwait(false);
            }

            store.Update(calendar.Id, c => c with { State = CalendarState.Done });
        }
        catch (OperationCanceledException)
        {
            store.Update(calendar.Id, c => c with { State = CalendarState.Cancelled, Problem = "Abgebrochen." });
        }
        finally
        {
            lock (_gate)
            {
                _running?.Dispose();
                _running = null;
                _runningId = null;
            }
        }
    }

    private async Task<CalendarDay> SearchDayAsync(PriceCalendarRequest request, DateOnly date, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var search = scope.ServiceProvider.GetRequiredService<IFlightSearch>();
        try
        {
            var multi = (IMultiAirportFlightSearch)search;
            var query = FlightQuery.Combine(Legs(request, date), 1, CabinClass.Economy, FlightEndpoints.Today(clock));
            var result = await multi.SearchAsync(query, ct).ConfigureAwait(false);
            var returnDate = request.Nights is { } n ? date.AddDays(n) : (DateOnly?)null;
            archive.Record(result.Journeys, returnDate, "kalender", clock.GetUtcNow());
            var cheapest = result.Journeys.Where(j => j.Fares.Count > 0).MinBy(j => j.Fares[0].PricePerAdult);
            if (cheapest is not null)
            {
                archive.RecordHistory(cheapest.Legs[0].Origin, cheapest.Legs[0].Destination, date, returnDate, result.Insights, clock.GetUtcNow());
            }

            var airline = cheapest?.Legs[0].Segments.Select(s => s.CarrierName ?? s.CarrierCode).FirstOrDefault();
            return new CalendarDay(date, cheapest?.Fares[0].PricePerAdult, airline, cheapest?.Legs[0].Stops, result.Journeys.Count, null);
        }
        catch (Exception e) when (e is FlightSearchUnavailableException or FlightSearchNotConfiguredException or DomainException or HttpRequestException)
        {
            LogFailed(date, e);
            return new CalendarDay(date, null, null, null, 0, e.Message);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Preiskalender: Suche für {Date} fehlgeschlagen")]
    private partial void LogFailed(DateOnly date, Exception exception);
}
