using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Tests.Domain;

public sealed class PackingAndPartyTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid Anna = Guid.NewGuid();
    private static readonly Guid Ben = Guid.NewGuid();

    [Fact]
    public void Packliste_wird_bereinigt_gespeichert()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        trip.SetPacking(
            new PackingList(
                [new PackingItem(Guid.NewGuid(), "  Reisepass ", "Dokumente", false, "pass"), new PackingItem(Guid.NewGuid(), "Sonnencreme", " ", true)],
                ["regenjacke", "regenjacke"]),
            Now);

        Assert.Equal("Reisepass", trip.Packing.Items[0].Text);
        Assert.Equal("Sonstiges", trip.Packing.Items[1].Category);
        Assert.True(trip.Packing.Items[1].Packed);
        Assert.Equal(["regenjacke"], trip.Packing.Dismissed);
    }

    [Fact]
    public void Packliste_ohne_Text_wird_abgelehnt()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        var error = Assert.Throws<DomainException>(() => trip.SetPacking(new PackingList([new PackingItem(Guid.NewGuid(), " ", "X", false)], []), Now));
        Assert.Equal("text", error.Field);
    }

    [Fact]
    public void Mitreisende_bestimmen_die_Personenzahl()
    {
        var trip = Trip.Create(new TripData("Portugal", 4), Now);
        trip.SetParty(new TripParty([new TripMember(Anna, "Anna"), new TripMember(Ben, "Ben")], [], []), Now);

        Assert.Equal(2, trip.Travelers);
        Assert.Throws<DomainException>(() => trip.Update(new TripData("Portugal", 5), Now));
        trip.Update(new TripData("Portugal am Meer", 2), Now);
        Assert.Equal("Portugal am Meer", trip.Name);
    }

    [Fact]
    public void Unbekannte_Personen_und_geloeschte_Buchungen_fallen_weg()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        var hotel = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", OptionStatus.Selected, Price: 600m), Now);
        var stranger = Guid.NewGuid();
        trip.SetParty(
            new TripParty(
                [new TripMember(Anna, "Anna"), new TripMember(Ben, "Ben")],
                [new Expense(Guid.NewGuid(), "Abendessen", 84.5m, stranger, [Anna, stranger, Anna])],
                [new OptionShare(hotel.Id, Anna, []), new OptionShare(Guid.NewGuid(), Ben, [])]),
            Now);

        var expense = Assert.Single(trip.Party.Expenses);
        Assert.Null(expense.PaidBy);
        Assert.Equal([Anna], expense.For);
        var share = Assert.Single(trip.Party.OptionShares);
        Assert.Equal(Anna, share.PaidBy);

        trip.RemoveOption(hotel.Id, Now);
        Assert.Empty(trip.Party.OptionShares);
    }

    [Fact]
    public void Negative_Betraege_werden_abgelehnt()
    {
        var trip = Trip.Create(new TripData("Portugal", 2), Now);
        Assert.Throws<DomainException>(() =>
            trip.SetParty(new TripParty([new TripMember(Anna, "Anna")], [new Expense(Guid.NewGuid(), "X", -5m, Anna, [])], []), Now));
    }
}
