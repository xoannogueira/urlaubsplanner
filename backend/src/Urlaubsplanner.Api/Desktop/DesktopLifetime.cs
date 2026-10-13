namespace Urlaubsplanner.Api.Desktop;

/// <summary>
/// Beendet die Desktop-App, wenn ihr letztes Fenster geschlossen wurde. Jedes Fenster meldet sich mit seiner Kennung
/// regelmäßig (<see cref="Heartbeat"/>) und beim Schließen (<see cref="Closing"/>). Ist danach kein Fenster mehr offen
/// und kommt innerhalb kurzer Zeit kein Lebenszeichen (ein Neuladen meldet sich sofort wieder), fährt der Server herunter.
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

    /// <summary>
    /// Bis wann ein Fenster als offen gilt. Minimierte Fenster melden sich höchstens einmal pro Minute.
    /// </summary>
    public static readonly TimeSpan WindowAlive = TimeSpan.FromMinutes(3);

    private readonly Lock _gate = new();
    private readonly Dictionary<string, DateTimeOffset> _windows = new(StringComparer.Ordinal);
    private DateTimeOffset _lastSeen = clock.GetUtcNow();
    private DateTimeOffset? _closingSince;

    /// <summary>Lebenszeichen eines Fensters (ältere Seiten ohne Kennung zählen als ein gemeinsames Fenster).</summary>
    public void Heartbeat(string? window = null)
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            _windows[window ?? string.Empty] = now;
            _lastSeen = now;
            _closingSince = null;
        }
    }

    /// <summary>Ein Fenster wurde geschlossen (oder lädt neu). War es das letzte, beginnt die Wartezeit.</summary>
    public void Closing(string? window = null)
    {
        lock (_gate)
        {
            _windows.Remove(window ?? string.Empty);
            if (_windows.Count == 0)
            {
                _closingSince = clock.GetUtcNow();
            }
        }
    }

    /// <summary>Wie viele Fenster gerade offen sind.</summary>
    public int OpenWindows
    {
        get
        {
            var now = clock.GetUtcNow();
            lock (_gate)
            {
                return _windows.Values.Count(seen => now - seen < WindowAlive);
            }
        }
    }

    /// <summary>Ob jetzt beendet werden soll (für Tests ohne Warten aufrufbar).</summary>
    public bool ShouldStop()
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            return (_closingSince is { } closing && _windows.Count == 0 && now - closing >= CloseGrace) || now - _lastSeen >= IdleTimeout;
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
