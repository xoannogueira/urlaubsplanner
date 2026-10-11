using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Trips;

namespace Urlaubsplanner.Tests.Domain;

public sealed class TripTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 9, 12, 0, 0, TimeSpan.Zero);

    private static Trip NewTrip(int travelers = 4) => Trip.Create(new TripData("Portugal", travelers), Now);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_ohne_Namen_wird_abgelehnt(string name)
    {
        var e = Assert.Throws<DomainException>(() => Trip.Create(new TripData(name, 2), Now));
        Assert.Equal("name", e.Field);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(51)]
    public void Create_mit_ungueltiger_Personenzahl_wird_abgelehnt(int travelers)
    {
        var e = Assert.Throws<DomainException>(() => Trip.Create(new TripData("Reise", travelers), Now));
        Assert.Equal("travelers", e.Field);
    }

    [Fact]
    public void Create_trimmt_den_Namen()
    {
        var trip = Trip.Create(new TripData("  Japan 2027  ", 2), Now);
        Assert.Equal("Japan 2027", trip.Name);
    }

    [Fact]
    public void Etappe_mit_Ende_vor_Start_wird_abgelehnt()
    {
        var trip = NewTrip();
        var e = Assert.Throws<DomainException>(() =>
            trip.AddStage(new StageData("Lissabon", new DateOnly(2027, 5, 16), new DateOnly(2027, 5, 12)), Now));
        Assert.Equal("endDate", e.Field);
    }

    [Fact]
    public void Etappen_werden_nach_Startdatum_sortiert()
    {
        var trip = NewTrip();
        trip.AddStage(new StageData("Porto", new DateOnly(2027, 5, 16), new DateOnly(2027, 5, 19)), Now);
        trip.AddStage(new StageData("Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16)), Now);

        Assert.Equal(new[] { "Lissabon", "Porto" }, trip.Stages.Select(s => s.Name));
        Assert.Equal(4, trip.Stages[0].Nights);
    }

    [Fact]
    public void Option_mit_unbekannter_Etappe_wird_abgelehnt()
    {
        var trip = NewTrip();
        var e = Assert.Throws<DomainException>(() =>
            trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", StageId: Guid.NewGuid()), Now));
        Assert.Equal("stageId", e.Field);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://example.com/datei")]
    [InlineData("keine url")]
    public void Nur_http_und_https_Links_sind_erlaubt(string url)
    {
        var trip = NewTrip();
        var e = Assert.Throws<DomainException>(() => trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Url: url), Now));
        Assert.Equal("url", e.Field);
    }

    [Fact]
    public void Gueltiger_Link_wird_gespeichert()
    {
        var trip = NewTrip();
        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Url: "https://www.booking.com/hotel/pt/x.html"), Now);
        Assert.Equal("https://www.booking.com/hotel/pt/x.html", option.Url);
    }

    [Fact]
    public void Preis_wird_auf_Cent_gerundet_und_negative_Preise_abgelehnt()
    {
        var trip = NewTrip();
        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Price: 99.999m), Now);
        Assert.Equal(100.00m, option.Price);

        Assert.Throws<DomainException>(() => trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Price: -1m), Now));
    }

    [Fact]
    public void Preis_pro_Person_wird_mit_Personenzahl_multipliziert()
    {
        var trip = NewTrip(travelers: 4);
        var option = trip.AddOption(new OptionData(OptionKind.Flight, "STR → LIS", Price: 189m, PricePerPerson: true), Now);
        Assert.Equal(756m, option.TotalPrice(trip.Travelers));
    }

    [Fact]
    public void Preisdatum_aendert_sich_nur_wenn_sich_der_Preis_aendert()
    {
        var trip = NewTrip();
        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Price: 100m), Now);
        Assert.Equal(Now, option.PriceCheckedAt);

        var later = Now.AddDays(2);
        trip.UpdateOption(option.Id, new OptionData(OptionKind.Hotel, "Hotel umbenannt", Price: 100m), later);
        Assert.Equal(Now, option.PriceCheckedAt);

        trip.UpdateOption(option.Id, new OptionData(OptionKind.Hotel, "Hotel umbenannt", Price: 120m), later);
        Assert.Equal(later, option.PriceCheckedAt);
    }

    [Fact]
    public void Etappe_loeschen_behaelt_ihre_Optionen()
    {
        var trip = NewTrip();
        var stage = trip.AddStage(new StageData("Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16)), Now);
        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", StageId: stage.Id), Now);

        trip.RemoveStage(stage.Id, Now);

        Assert.Empty(trip.Stages);
        Assert.Single(trip.Options);
        Assert.Null(option.StageId);
    }

    [Fact]
    public void Unbekannte_Option_meldet_NotFound()
    {
        var trip = NewTrip();
        Assert.Throws<NotFoundException>(() => trip.ChangeOptionStatus(Guid.NewGuid(), OptionStatus.Booked, Now));
    }

    [Fact]
    public void Preis_bestaetigen_setzt_Pruefzeitpunkt_auch_ohne_Aenderung()
    {
        var trip = NewTrip();
        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Price: 612m), Now);
        var later = Now.AddDays(30);

        trip.ConfirmOptionPrice(option.Id, 612m, later);

        Assert.Equal(612m, option.Price);
        Assert.Equal(later, option.PriceCheckedAt);
        Assert.Throws<DomainException>(() => trip.ConfirmOptionPrice(option.Id, -5m, later));
    }

    [Fact]
    public void Koordinaten_nur_zusammen_und_im_gueltigen_Bereich()
    {
        var trip = NewTrip();
        Assert.Throws<DomainException>(() => trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Latitude: 38.7), Now));
        Assert.Throws<DomainException>(() => trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Latitude: 91, Longitude: 0), Now));

        var option = trip.AddOption(new OptionData(OptionKind.Hotel, "Hotel", Latitude: 38.72, Longitude: -9.14), Now);
        Assert.Equal(38.72, option.Latitude);
    }
}
