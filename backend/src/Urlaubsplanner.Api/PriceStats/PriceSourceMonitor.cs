using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Api.PriceStats;

/// <summary>Stand der kostenlosen Preisquelle, wie ihn die Oberfläche anzeigt.</summary>
public sealed record PriceSourceStatus(IndicativeSourceState State, DateTimeOffset? CheckedAt, string Message)
{
    public bool Usable => State == IndicativeSourceState.Ok;
}

/// <summary>
/// Prüft beim Start der App (und danach alle paar Stunden), ob der Aviasales-Token noch gilt. Davon hängt ab, welche
/// Quellen der Preiskalender anbietet: kostenlose Richtpreise oder nur die Google-Suche als Ersatz.
/// </summary>
public sealed partial class PriceSourceMonitor(IServiceScopeFactory scopes, TimeProvider clock, ILogger<PriceSourceMonitor> logger)
    : BackgroundService
{
    public static TimeSpan StartDelay { get; set; } = TimeSpan.FromSeconds(3);

    public static TimeSpan Interval { get; set; } = TimeSpan.FromHours(6);

    private readonly SemaphoreSlim _checking = new(1, 1);

    public PriceSourceStatus Current { get; private set; } = new(IndicativeSourceState.Unreachable, null, "Wird gerade geprüft …");

    public async Task<PriceSourceStatus> CheckAsync(CancellationToken ct)
    {
        await _checking.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            using var scope = scopes.CreateScope();
            var fares = scope.ServiceProvider.GetRequiredService<IIndicativeFares>();
            var state = await fares.CheckAsync(ct).ConfigureAwait(false);
            Current = new PriceSourceStatus(state, clock.GetUtcNow(), Describe(state));
            LogChecked(state);
            return Current;
        }
        finally
        {
            _checking.Release();
        }
    }

    /// <summary>Ein Fehler beim Laden (z. B. Token gesperrt) gilt sofort – nicht erst bei der nächsten Prüfung.</summary>
    public void Report(IndicativeSourceState state) => Current = new PriceSourceStatus(state, clock.GetUtcNow(), Describe(state));

    public static string Describe(IndicativeSourceState state) => state switch
    {
        IndicativeSourceState.Ok => "Kostenlose Richtpreise von Aviasales sind verfügbar.",
        IndicativeSourceState.Missing => "Kein Aviasales-Token in dieser App – nur die Google-Suche geht.",
        IndicativeSourceState.Rejected => "Aviasales lehnt den Token ab (ungültig oder gesperrt) – nur die Google-Suche geht.",
        IndicativeSourceState.Limited => "Zu viele Abfragen bei Aviasales – später nochmal versuchen, solange geht die Google-Suche.",
        _ => "Aviasales ist gerade nicht erreichbar – bist du online? Solange geht nur die Google-Suche.",
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartDelay, clock, stoppingToken).ConfigureAwait(false);
            while (!stoppingToken.IsCancellationRequested)
            {
                await CheckAsync(stoppingToken).ConfigureAwait(false);
                await Task.Delay(Interval, clock, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // App wird beendet.
        }
    }

    public override void Dispose()
    {
        _checking.Dispose();
        base.Dispose();
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Aviasales-Preisquelle geprüft: {State}")]
    private partial void LogChecked(IndicativeSourceState state);
}
