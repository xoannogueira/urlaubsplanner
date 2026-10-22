using Urlaubsplanner.Api.PriceWatch;

namespace Urlaubsplanner.Tests.PriceWatch;

public sealed class PriceWatcherTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 12, 0, 0, TimeSpan.Zero);

    private static PriceWatchEntry Watch(decimal start, decimal? last = null, decimal? drop = null) =>
        new(Guid.NewGuid(), Guid.NewGuid(), "STR → BCN", "STR-BCN@2026-11-13:VY1817#Basic", 2, start, last, drop, false, null, null, Now);

    [Fact]
    public void Gefallener_Preis_merkt_sich_den_alten()
    {
        var w = PriceWatcher.Apply(Watch(372), true, 329, Now);
        Assert.Equal((329m, 372m), (w.LastPrice!.Value, w.DropFrom!.Value));
        Assert.Equal(Now, w.CheckedAt);
    }

    [Fact]
    public void Gleicher_oder_hoeherer_Preis_kein_Hinweis()
    {
        Assert.Null(PriceWatcher.Apply(Watch(372), true, 372, Now).DropFrom);
        Assert.Null(PriceWatcher.Apply(Watch(372), true, 400, Now).DropFrom);
        // Erst gefallen, dann wieder über den alten Preis: Hinweis weg.
        Assert.Null(PriceWatcher.Apply(Watch(372, 329, 372), true, 380, Now).DropFrom);
        // Weiter gefallen: Hinweis bleibt mit dem letzten Preis vorher
        Assert.Equal(329m, PriceWatcher.Apply(Watch(372, 329, 372), true, 300, Now).DropFrom);
    }

    [Fact]
    public void Nicht_mehr_buchbar()
    {
        var w = PriceWatcher.Apply(Watch(372), false, null, Now);
        Assert.True(w.Unavailable);
        Assert.Null(w.LastPrice);
    }
}
