namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Beendet die Desktop-App, wenn ihr Fenster geschlossen wurde. Das Fenster meldet sich regelmäßig
/// (<see cref="Heartbeat"/>) und beim Schließen (<see cref="Closing"/>). Kommt nach dem Schließen innerhalb
/// kurzer Zeit kein Lebenszeichen mehr (ein Neuladen meldet sich sofort wieder), fährt der Server herunter.
/// Sicherheitsnetz: ganz ohne Lebenszeichen (z. B. Browser abgestürzt) nach <see cref="IdleTimeout"/>.
/// </summary>
public sealed partial class DesktopLifetime(
    IHostApplicationLifetime lifetime,
    TimeProvider clock,
    ILogger<DesktopLifetime> logger) : BackgroundService
{
    /// <summary>So lange nach dem Schließen warten – reicht für ein Neuladen der Seite.</summary>
    public static readonly TimeSpan CloseGrace = TimeSpan.FromSeconds(8);

    /// <summary>
    /// Ohne jedes Lebenszeichen. Großzügig, weil Browser Timer in minimierten Fenstern stark drosseln.
    /// </summary>
    public static readonly TimeSpan IdleTimeout = TimeSpan.FromMinutes(30);

    private readonly Lock _gate = new();
    private DateTimeOffset _lastSeen = clock.GetUtcNow();
    private DateTimeOffset? _closingSince;

    public void Heartbeat()
    {
        lock (_gate)
        {
            _lastSeen = clock.GetUtcNow();
            _closingSince = null;
        }
    }

    public void Closing()
    {
        lock (_gate)
        {
            _closingSince = clock.GetUtcNow();
        }
    }

    /// <summary>Ob jetzt beendet werden soll (für Tests ohne Warten aufrufbar).</summary>
    public bool ShouldStop()
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            return (_closingSince is { } closing && now - closing >= CloseGrace) || now - _lastSeen >= IdleTimeout;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            if (ShouldStop())
            {
                LogStopping();
                lifetime.StopApplication();
                return;
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Fenster geschlossen – Urlaubsplanner wird beendet")]
    private partial void LogStopping();
}
