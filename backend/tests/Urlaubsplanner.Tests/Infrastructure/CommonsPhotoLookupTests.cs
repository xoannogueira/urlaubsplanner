using Urlaubsplanner.Infrastructure.Activities;
using Hit = Urlaubsplanner.Infrastructure.Activities.CommonsPhotoLookup.GeoHit;

namespace Urlaubsplanner.Tests.Infrastructure;

public sealed class CommonsPhotoLookupTests
{
    [Fact]
    public void Nimmt_das_naechste_Foto_mit_passendem_Namen()
    {
        var url = CommonsPhotoLookup.Pick(
            [
                new Hit("File:Barcelona street 2019.jpg", 5),
                new Hit("File:Palau de la Generalitat.jpg", 20),
                new Hit("File:Palau Centelles - pati.JPG", 31),
                new Hit("File:Palau Centelles map.pdf", 2),
            ],
            "Palau Centelles");
        Assert.Equal("https://commons.wikimedia.org/wiki/Special:FilePath/Palau_Centelles_-_pati.JPG?width=480", url);
    }

    [Fact]
    public void Allgemeine_Woerter_allein_reichen_nicht()
    {
        // „Palau“ steht auch im Namen eines anderen Palasts – das wäre ein falsches Bild.
        Assert.Null(CommonsPhotoLookup.Pick([new Hit("File:Palau de la Generalitat.jpg", 10)], "Palau Episcopal"));
        Assert.Null(CommonsPhotoLookup.Pick([new Hit("File:Museu.jpg", 10)], "Museu"));
    }

    [Fact]
    public void Akzente_und_Grossschreibung_egal()
    {
        Assert.Equal(["salo", "del", "tinell"], CommonsPhotoLookup.Words("Saló del Tinell"));
        Assert.NotNull(CommonsPhotoLookup.Pick([new Hit("File:Salo del Tinell (Barcelona).jpg", 12)], "Saló del Tinell"));
    }
}
