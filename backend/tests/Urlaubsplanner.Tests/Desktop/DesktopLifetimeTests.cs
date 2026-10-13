using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class DesktopLifetimeTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 13, 10, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class NoLifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;

        public CancellationToken ApplicationStopping => CancellationToken.None;

        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication()
        {
        }
    }

    private static (DesktopLifetime Lifetime, Clock Clock) Create()
    {
        var clock = new Clock();
        return (new DesktopLifetime(new NoLifetime(), clock, NullLogger<DesktopLifetime>.Instance), clock);
    }

    [Fact]
    public void Fenster_schliessen_beendet_nach_kurzer_Wartezeit()
    {
        var (lifetime, clock) = Create();
        lifetime.Closing();
        clock.Now += TimeSpan.FromSeconds(3);
        Assert.False(lifetime.ShouldStop());

        clock.Now += DesktopLifetime.CloseGrace;
        Assert.True(lifetime.ShouldStop());
    }

    [Fact]
    public void Neu_laden_nach_dem_Schliessen_haelt_die_App_am_Leben()
    {
        var (lifetime, clock) = Create();
        lifetime.Closing();
        clock.Now += TimeSpan.FromSeconds(1);
        lifetime.Heartbeat();
        clock.Now += DesktopLifetime.CloseGrace;

        Assert.False(lifetime.ShouldStop());
    }

    [Fact]
    public void Schliessen_eines_von_zwei_Fenstern_beendet_die_App_nicht()
    {
        var (lifetime, clock) = Create();
        lifetime.Heartbeat("a");
        lifetime.Heartbeat("b");
        Assert.Equal(2, lifetime.OpenWindows);

        lifetime.Closing("a");
        clock.Now += DesktopLifetime.CloseGrace * 3;
        Assert.False(lifetime.ShouldStop());
        Assert.Equal(1, lifetime.OpenWindows);

        lifetime.Closing("b");
        clock.Now += DesktopLifetime.CloseGrace;
        Assert.True(lifetime.ShouldStop());
        Assert.Equal(0, lifetime.OpenWindows);
    }

    [Fact]
    public void Neu_laden_behaelt_die_Fensterkennung()
    {
        var (lifetime, clock) = Create();
        lifetime.Heartbeat("a");
        lifetime.Closing("a");
        clock.Now += TimeSpan.FromSeconds(1);
        lifetime.Heartbeat("a");
        clock.Now += DesktopLifetime.CloseGrace;

        Assert.False(lifetime.ShouldStop());
        Assert.Equal(1, lifetime.OpenWindows);
    }

    [Fact]
    public void Fenster_ohne_Lebenszeichen_zaehlt_nicht_mehr_als_offen()
    {
        var (lifetime, clock) = Create();
        lifetime.Heartbeat("a");
        clock.Now += DesktopLifetime.WindowAlive;

        Assert.Equal(0, lifetime.OpenWindows);
    }

    [Fact]
    public void Direkt_nach_dem_Start_ist_das_erste_Fenster_unterwegs()
    {
        var (lifetime, _) = Create();
        Assert.True(lifetime.WaitingForFirstWindow);

        lifetime.Heartbeat("a");
        Assert.False(lifetime.WaitingForFirstWindow);
    }

    [Fact]
    public void Kommt_das_erste_Fenster_nie_gilt_es_nach_der_Wartezeit_nicht_mehr_als_unterwegs()
    {
        var (lifetime, clock) = Create();
        clock.Now += DesktopLifetime.FirstWindowWait;

        Assert.False(lifetime.WaitingForFirstWindow);
    }

    [Fact]
    public void Ganz_ohne_Lebenszeichen_beendet_nach_der_Sicherheitsfrist()
    {
        var (lifetime, clock) = Create();
        clock.Now += DesktopLifetime.IdleTimeout - TimeSpan.FromSeconds(1);
        Assert.False(lifetime.ShouldStop());

        clock.Now += TimeSpan.FromSeconds(2);
        Assert.True(lifetime.ShouldStop());
    }
}
