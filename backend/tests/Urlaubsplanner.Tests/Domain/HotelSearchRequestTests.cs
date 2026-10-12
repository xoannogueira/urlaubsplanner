using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Hotels;

namespace Urlaubsplanner.Tests.Domain;

public sealed class HotelSearchRequestTests
{
    private static readonly DateOnly Today = new(2026, 10, 11);

    private static HotelSearchRequest Create(
        int adults = 4,
        int rooms = 2,
        int radius = 3000,
        DateOnly? checkin = null,
        DateOnly? checkout = null) =>
        HotelSearchRequest.Create(38.72, -9.14, radius, checkin ?? new DateOnly(2027, 5, 12), checkout ?? new DateOnly(2027, 5, 16), adults, rooms, Today);

    [Theory]
    [InlineData(4, 2, new[] { 2, 2 })]
    [InlineData(5, 2, new[] { 3, 2 })]
    [InlineData(3, 1, new[] { 3 })]
    [InlineData(7, 3, new[] { 3, 2, 2 })]
    public void Personen_werden_gleichmaessig_auf_Zimmer_verteilt(int adults, int rooms, int[] expected)
    {
        Assert.Equal(expected, Create(adults, rooms).AdultsPerRoom().ToArray());
    }

    [Fact]
    public void Naechte_werden_berechnet()
    {
        Assert.Equal(4, Create().Nights);
    }

    [Theory]
    [InlineData(10, 500)]
    [InlineData(3000, 3000)]
    [InlineData(100_000, 30_000)]
    public void Radius_wird_begrenzt(int radius, int expected)
    {
        Assert.Equal(expected, Create(radius: radius).RadiusMeters);
    }

    [Fact]
    public void Abreise_vor_Anreise_wird_abgelehnt()
    {
        var e = Assert.Throws<DomainException>(() => Create(checkin: new DateOnly(2027, 5, 16), checkout: new DateOnly(2027, 5, 16)));
        Assert.Equal("checkout", e.Field);
    }

    [Fact]
    public void Anreise_in_der_Vergangenheit_wird_abgelehnt()
    {
        var e = Assert.Throws<DomainException>(() => Create(checkin: Today.AddDays(-1), checkout: Today.AddDays(2)));
        Assert.Equal("checkin", e.Field);
    }

    [Fact]
    public void Mehr_als_30_Naechte_werden_abgelehnt()
    {
        var e = Assert.Throws<DomainException>(() => Create(checkin: new DateOnly(2027, 5, 1), checkout: new DateOnly(2027, 6, 5)));
        Assert.Equal("checkout", e.Field);
    }

    [Fact]
    public void Mehr_Zimmer_als_Personen_werden_abgelehnt()
    {
        var e = Assert.Throws<DomainException>(() => Create(adults: 2, rooms: 3));
        Assert.Equal("rooms", e.Field);
    }

    [Fact]
    public void Booking_Link_ist_vorausgefuellt_und_kodiert()
    {
        var url = HotelBookingLinks.BookingCom("Hotel Miradouro & Spa", "Lissabon", Create());

        Assert.Contains("ss=Hotel%20Miradouro%20%26%20Spa%2C%20Lissabon", url, StringComparison.Ordinal);
        Assert.Contains("checkin=2027-05-12", url, StringComparison.Ordinal);
        Assert.Contains("checkout=2027-05-16", url, StringComparison.Ordinal);
        Assert.Contains("group_adults=4", url, StringComparison.Ordinal);
        Assert.Contains("no_rooms=2", url, StringComparison.Ordinal);
    }

    [Fact]
    public void White_Label_Link_wird_genutzt_wenn_eingerichtet()
    {
        var url = HotelBookingLinks.For("lp1897", "Hotel", "Lissabon", Create(), "reisen.example.com");

        Assert.StartsWith("https://reisen.example.com/hotels/lp1897?checkin=2027-05-12&checkout=2027-05-16&occupancies=", url, StringComparison.Ordinal);
        var encoded = Uri.UnescapeDataString(url[(url.IndexOf("occupancies=", StringComparison.Ordinal) + 12)..]);
        var json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
        Assert.Equal("[{\"adults\":2,\"children\":[]},{\"adults\":2,\"children\":[]}]", json);
    }

    [Fact]
    public void Suche_nach_IDs_bereinigt_und_begrenzt_die_Liste()
    {
        var request = HotelSearchRequest.ForHotels([" lp1 ", "lp1", "", "lp2"], new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 2, 1, Today);
        Assert.Equal(["lp1", "lp2"], request.HotelIds.ToArray());
        Assert.Null(request.Center);

        Assert.Equal("hotelIds", Assert.Throws<DomainException>(() =>
            HotelSearchRequest.ForHotels([], new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 2, 1, Today)).Field);
        var tooMany = Enumerable.Range(0, HotelSearchRequest.MaxHotelIds + 1).Select(i => $"lp{i}");
        Assert.Equal("hotelIds", Assert.Throws<DomainException>(() =>
            HotelSearchRequest.ForHotels(tooMany, new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 2, 1, Today)).Field);
    }

    [Fact]
    public void Ausweichdaten_behalten_die_Naechte_und_starten_nah_am_Wunschtermin()
    {
        var windows = HotelDateAlternatives.Windows(new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), Today);

        Assert.Equal([-1, 1, -2, 2, -3, 3], windows.Select(w => w.ShiftDays).ToArray());
        Assert.All(windows, w => Assert.Equal(4, w.Checkout.DayNumber - w.Checkin.DayNumber));
        Assert.Equal(new DateOnly(2027, 5, 9), windows[4].Checkin);
    }

    [Fact]
    public void Ausweichdaten_in_der_Vergangenheit_fallen_weg()
    {
        var windows = HotelDateAlternatives.Windows(Today.AddDays(1), Today.AddDays(3), Today);

        Assert.Equal([-1, 1, 2, 3], windows.Select(w => w.ShiftDays).ToArray());
    }

    [Fact]
    public void Google_Link_sucht_nach_Hotel_und_Stadt()
    {
        Assert.Equal(
            "https://www.google.com/travel/search?q=Hotel%20A%20%26%20B%2C%20Lissabon&hl=de&gl=de",
            HotelBookingLinks.Google("Hotel A & B", "Lissabon"));
    }

    [Fact]
    public void Google_Link_kodiert_die_Reisedaten_wie_Google()
    {
        // Referenzwert aus einer echten Google-Hotels-URL (15.–20. März 2026, 5 Nächte).
        Assert.Equal("CAEaIAoCGgASGhIUCgcI6g8QAxgPEgcI6g8QAxgUGAUyAggB", HotelBookingLinks.GoogleDates(new DateOnly(2026, 3, 15), new DateOnly(2026, 3, 20)));

        var url = HotelBookingLinks.Google("Hotel", "Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16));
        Assert.Contains("&qs=CAE4AA&ts=", url, StringComparison.Ordinal);
    }

    [Fact]
    public void Google_Hotelseite_fuehrt_direkt_zum_Hotel()
    {
        var url = HotelBookingLinks.GoogleHotel("ChgI2pHwwsKssrZY", "Hotel A", "Lissabon", new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16));

        Assert.StartsWith("https://www.google.com/travel/hotels/entity/ChgI2pHwwsKssrZY/prices?q=Hotel%20A%2C%20Lissabon&hl=de&gl=de", url, StringComparison.Ordinal);
        Assert.Contains("&ts=", url, StringComparison.Ordinal);
    }

    [Fact]
    public void Google_Link_uebergibt_die_Personenzahl()
    {
        // Wie in echten Google-URLs: „CAESCgoCCAMKAggDEAA…“ = 2 Erwachsene, danach unverändert die Reisedaten.
        var two = HotelBookingLinks.GoogleDates(new DateOnly(2026, 3, 15), new DateOnly(2026, 3, 20), 2);
        Assert.Equal("CAESCgoCCAMKAggDEAAaIAoCGgASGhIUCgcI6g8QAxgPEgcI6g8QAxgUGAUyAggB", two);

        var four = Convert.FromBase64String(HotelBookingLinks.GoogleDates(new DateOnly(2026, 3, 15), new DateOnly(2026, 3, 20), 4) + "=");
        Assert.Equal(new byte[] { 0x08, 0x01, 0x12, 0x12 }, four[..4]);

        var url = HotelBookingLinks.GoogleHotel("tok", "Hotel", null, new DateOnly(2027, 5, 12), new DateOnly(2027, 5, 16), 4);
        Assert.Contains("&ts=CAESEgoC", url, StringComparison.Ordinal);
    }
}
