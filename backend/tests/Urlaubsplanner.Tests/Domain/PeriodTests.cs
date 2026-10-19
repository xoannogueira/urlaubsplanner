using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Tests.Domain;

public sealed class PeriodTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

    private static DateOnly May(int day) => new(2027, 5, day);

    [Fact]
    public void Erste_und_letzte_Etappe_wandern_mit()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        var lisbon = trip.AddStage(new StageData("Lissabon", May(12), May(16)), Now);
        var middle = trip.AddStage(new StageData("Coimbra", May(16), May(17)), Now);
        var porto = trip.AddStage(new StageData("Porto", May(17), May(20)), Now);

        trip.ChangePeriod(May(11), May(21), Now);

        Assert.Equal(May(11), trip.Stages.Single(s => s.Id == lisbon.Id).StartDate);
        Assert.Equal(May(16), trip.Stages.Single(s => s.Id == lisbon.Id).EndDate);
        Assert.Equal(May(16), trip.Stages.Single(s => s.Id == middle.Id).StartDate);
        Assert.Equal(May(21), trip.Stages.Single(s => s.Id == porto.Id).EndDate);
        Assert.Equal(May(11), trip.StartDate);
        Assert.Equal(May(21), trip.EndDate);
    }

    [Fact]
    public void Eine_Etappe_bekommt_den_ganzen_Zeitraum()
    {
        var trip = Trip.Create(new TripData("Barcelona", 2), Now);
        var stage = trip.AddStage(new StageData("Barcelona", May(12), May(16), Description: "Strand & Gaudí"), Now);

        trip.ChangePeriod(May(13), May(19), Now);

        var changed = Assert.Single(trip.Stages);
        Assert.Equal((May(13), May(19)), (changed.StartDate, changed.EndDate));
        Assert.Equal(stage.Id, changed.Id);
        Assert.Equal("Strand & Gaudí", changed.Description);
    }

    [Fact]
    public void Zu_kurzer_Zeitraum_wird_abgelehnt()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        trip.AddStage(new StageData("Lissabon", May(12), May(16)), Now);
        trip.AddStage(new StageData("Porto", May(16), May(20)), Now);

        var error = Assert.Throws<DomainException>(() => trip.ChangePeriod(May(17), May(21), Now));
        Assert.Equal("startDate", error.Field);
        Assert.Throws<DomainException>(() => trip.ChangePeriod(May(10), May(9), Now));
    }

    [Fact]
    public void Ohne_Etappen_nur_der_Zeitraum()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        trip.ChangePeriod(May(1), May(8), Now);
        Assert.Equal((May(1), May(8)), (trip.StartDate!.Value, trip.EndDate!.Value));
    }

    [Fact]
    public void Etappe_ausserhalb_verlaengert_den_Reisezeitraum()
    {
        var trip = Trip.Create(new TripData("Portugal", 2, May(10), May(15)), Now);
        trip.AddStage(new StageData("Lissabon", May(10), May(13)), Now);
        var porto = trip.AddStage(new StageData("Porto", May(13), May(17)), Now);

        Assert.Equal((May(10), May(17)), (trip.StartDate!.Value, trip.EndDate!.Value));

        trip.UpdateStage(porto.Id, new StageData("Porto", May(13), May(15)), Now);
        Assert.Equal(May(17), trip.EndDate); // wird nie still verkürzt
    }

    [Fact]
    public void Ohne_Reisedaten_ergibt_sich_der_Zeitraum_aus_den_Etappen()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        trip.AddStage(new StageData("Porto", May(16), May(20)), Now);
        trip.AddStage(new StageData("Lissabon", May(12), May(16)), Now);

        Assert.Equal((May(12), May(20)), (trip.StartDate!.Value, trip.EndDate!.Value));
    }

    [Fact]
    public void Aeltere_Reisen_werden_beim_Laden_angeglichen()
    {
        var stage = Stage.Restore(Guid.NewGuid(), "Lissabon", May(12), May(16), null, null);
        var trip = Trip.Restore(Guid.NewGuid(), "Alt", 2, May(13), May(14), null, null, Now, Now, [stage], []);

        Assert.Equal((May(12), May(16)), (trip.StartDate!.Value, trip.EndDate!.Value));
    }

    [Fact]
    public void Reise_bearbeiten_mit_Etappen_verschiebt_erste_und_letzte_Etappe()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        trip.AddStage(new StageData("Lissabon", May(12), May(16)), Now);
        trip.AddStage(new StageData("Porto", May(16), May(20)), Now);

        trip.Update(new TripData("Portugal", 3, May(11), May(21)), Now);
        Assert.Equal((May(11), May(21)), (trip.Stages[0].StartDate, trip.Stages[^1].EndDate));

        // Ohne Daten bleibt der Zeitraum, wie er ist.
        trip.Update(new TripData("Portugal", 3), Now);
        Assert.Equal((May(11), May(21)), (trip.StartDate!.Value, trip.EndDate!.Value));
    }
}
