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
}
