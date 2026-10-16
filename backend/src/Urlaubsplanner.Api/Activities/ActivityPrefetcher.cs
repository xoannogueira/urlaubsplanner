using System.Collections.Concurrent;
using System.Globalization;
using System.Threading.Channels;
using Urlaubsplanner.Api.Contracts;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Api.Activities;

/// <summary>
/// Lädt Aktivitäten-Vorschläge im Hintergrund, sobald eine Etappe mit Ort bekannt ist (Etappe angelegt, geändert
/// oder Reise geöffnet). Meist plant man erst Flüge und Hotels – bis man zu den Aktivitäten kommt, sind sie fertig.
/// Immer nur eine Abfrage zur Zeit, damit die freien Server nicht überlastet werden.
/// </summary>
public sealed partial class ActivityPrefetcher(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<ActivityPrefetcher> logger) : BackgroundService
{
    private readonly Channel<ActivitySearchRequest> _queue = Channel.CreateUnbounded<ActivitySearchRequest>(new UnboundedChannelOptions { SingleReader = true });
    private readonly ConcurrentDictionary<string, byte> _queued = new(StringComparer.Ordinal);

    /// <summary>Alle Etappen einer Reise vormerken, die einen Ort haben.</summary>
    public void Enqueue(TripResponse trip)
    {
        ArgumentNullException.ThrowIfNull(trip);
        foreach (var stage in trip.Stages)
        {
            if (stage.Latitude is { } lat && stage.Longitude is { } lon)
            {
                Enqueue(lat, lon);
            }
        }
    }

    public void Enqueue(double latitude, double longitude)
    {
        // Abschaltbar (z. B. in Tests): Activities:Prefetch=false
        if (string.Equals(configuration["Activities:Prefetch"], "false", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        ActivitySearchRequest request;
        try
        {
            request = ActivitySearchRequest.Create(latitude, longitude, ActivitySearchRequest.DefaultRadiusMeters);
        }
        catch (DomainException)
        {
            return;
        }

        var key = string.Create(CultureInfo.InvariantCulture, $"{request.Center.Latitude:F3},{request.Center.Longitude:F3}");
        if (_queued.TryAdd(key, 0))
        {
            _queue.Writer.TryWrite(request);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var request in _queue.Reader.ReadAllAsync(stoppingToken).ConfigureAwait(false))
        {
            var key = string.Create(CultureInfo.InvariantCulture, $"{request.Center.Latitude:F3},{request.Center.Longitude:F3}");
            try
            {
                using var scope = scopes.CreateScope();
                var search = scope.ServiceProvider.GetRequiredService<IActivitySearch>();
                if (!search.IsCached(request))
                {
                    var result = await search.SearchAsync(request, stoppingToken).ConfigureAwait(false);
                    LogPrefetched(key, result.Activities.Count);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // Nicht schlimm – beim Öffnen des Tabs wird es noch einmal versucht.
                LogPrefetchFailed(key, e.Message);
            }
            finally
            {
                _queued.TryRemove(key, out _);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Aktivitäten für {Place} vorgeladen ({Count} Vorschläge)")]
    private partial void LogPrefetched(string place, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "Vorladen der Aktivitäten für {Place} fehlgeschlagen: {Reason}")]
    private partial void LogPrefetchFailed(string place, string reason);
}
