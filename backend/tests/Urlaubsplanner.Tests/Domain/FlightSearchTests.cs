using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;

namespace Urlaubsplanner.Tests.Domain;

public sealed class FlightSearchTests
{
    private static readonly DateOnly Today = new(2026, 10, 11);
    private static readonly DateOnly May12 = new(2027, 5, 12);
    private static readonly DateOnly May19 = new(2027, 5, 19);

    private static FlightSearchRequest Create(params FlightLeg[] legs) => FlightSearchRequest.Create(legs, 2, CabinClass.Economy, Today);

    [Fact]
    public void Codes_werden_normalisiert_und_Hin_und_Rueckflug_erkannt()
    {
        var request = Create(new FlightLeg(" str", "lis ", May12), new FlightLeg("LIS", "STR", May19));

        Assert.Equal("STR", request.Legs[0].Origin);
        Assert.True(request.IsRoundTrip);
        Assert.False(Create(new FlightLeg("STR", "LIS", May12), new FlightLeg("OPO", "STR", May19)).IsRoundTrip); // Gabelflug
    }

    [Theory]
    [InlineData("ST", "LIS", "legs[0].origin")]
    [InlineData("STR", "STR", "legs[0].destination")]
    [InlineData("STR", "L1S", "legs[0].destination")]
    public void Ungueltige_Flughaefen_werden_abgelehnt(string origin, string destination, string field)
    {
        var e = Assert.Throws<DomainException>(() => Create(new FlightLeg(origin, destination, May12)));
        Assert.Equal(field, e.Field);
    }

    [Fact]
    public void Daten_muessen_in_der_Zukunft_liegen_und_aufeinander_folgen()
    {
        Assert.Equal("legs[0].date", Assert.Throws<DomainException>(() => Create(new FlightLeg("STR", "LIS", Today.AddDays(-1)))).Field);
        Assert.Equal("legs[0].date", Assert.Throws<DomainException>(() => Create(new FlightLeg("STR", "LIS", Today.AddDays(400)))).Field);
        Assert.Equal("legs[1].date", Assert.Throws<DomainException>(() =>
            Create(new FlightLeg("STR", "LIS", May19), new FlightLeg("LIS", "STR", May12))).Field);
    }

    [Fact]
    public void Mehrere_Flughaefen_ergeben_alle_Kombinationen()
    {
        var requests = FlightQuery.Expand(
            [new FlightLegOptions(["STR"], ["LIS", "OPO"], May12), new FlightLegOptions(["LIS", "OPO"], ["STR", "FRA"], May19)],
            2,
            CabinClass.Economy,
            Today);

        Assert.Equal(8, requests.Count);
        Assert.Contains(requests, r => r.Legs[0].Destination == "OPO" && r.Legs[1].Origin == "LIS" && r.Legs[1].Destination == "FRA");
    }

    [Fact]
    public void Zu_viele_Kombinationen_werden_abgelehnt()
    {
        var e = Assert.Throws<DomainException>(() => FlightQuery.Expand(
            [new FlightLegOptions(["STR", "FRA", "MUC"], ["LIS", "OPO", "FAO"], May12)], 2, CabinClass.Economy, Today));
        Assert.Contains("9 Suchen", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Verschieben_betrifft_alle_Strecken()
    {
        var shifted = Create(new FlightLeg("STR", "LIS", May12), new FlightLeg("OPO", "STR", May19)).ShiftedBy(-2);
        Assert.Equal(new DateOnly(2027, 5, 10), shifted.Legs[0].Date);
        Assert.Equal(new DateOnly(2027, 5, 17), shifted.Legs[1].Date);
    }

    [Fact]
    public void Kennung_laesst_sich_wieder_in_Strecken_zerlegen()
    {
        var legs = FlightSignature.ParseLegs("STR-LIS@2027-05-12:EW2042+EW7602|OPO-STR@2027-05-19:EW2713#Smart");

        Assert.NotNull(legs);
        Assert.Equal([new FlightLeg("STR", "LIS", May12), new FlightLeg("OPO", "STR", May19)], legs.ToArray());
        Assert.Null(FlightSignature.ParseLegs("kaputt"));
        Assert.Null(FlightSignature.ParseLegs(""));
    }

    [Fact]
    public void Kayak_Link_uebernimmt_Strecken_Daten_Personen_und_Klasse()
    {
        Assert.Equal(
            "https://www.kayak.de/flights/STR-LIS/2027-05-12/2027-05-19/2adults?sort=price_a",
            FlightBookingLinks.Kayak(Create(new FlightLeg("STR", "LIS", May12), new FlightLeg("LIS", "STR", May19))));
        Assert.Equal(
            "https://www.kayak.de/flights/STR-LIS/2027-05-12/OPO-STR/2027-05-19/1adult/business?sort=price_a",
            FlightBookingLinks.Kayak(FlightSearchRequest.Create(
                [new FlightLeg("STR", "LIS", May12), new FlightLeg("OPO", "STR", May19)], 1, CabinClass.Business, Today)));
    }

    [Fact]
    public void Google_Link_beschreibt_die_Suche()
    {
        var url = Uri.UnescapeDataString(FlightBookingLinks.Google(Create(new FlightLeg("STR", "LIS", May12), new FlightLeg("LIS", "STR", May19))));
        Assert.Contains("Flights from STR to LIS on 2027-05-12 through 2027-05-19 2 adults", url, StringComparison.Ordinal);
    }
}
