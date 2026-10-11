using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Tests.Domain;

public sealed class ActivityPagingTests
{
    private static ActivitySuggestion Activity(string name, ActivityCategory category, double km, string? description = null) =>
        new($"node/{name}", name, category, 38.7, -9.1, km, description, null, null, null, null, null, 0, null);

    // Reihenfolge = Bekanntheit (so liefert sie die Suche)
    private static readonly List<ActivitySuggestion> All =
    [
        .. Enumerable.Range(1, 23).Select(i => Activity($"Museum {i}", ActivityCategory.Museum, 30 - i)),
        Activity("Turm von Belém", ActivityCategory.Castle, 6, "Wehrturm am Tejo"),
        Activity("Miradouro", ActivityCategory.Viewpoint, 0.5),
    ];

    [Fact]
    public void Erste_Seite_hat_zehn_Vorschlaege_und_die_Gesamtzahl()
    {
        var page = ActivityPaging.Page(All, null, null, ActivitySort.Popular, 0, 10);

        Assert.Equal(10, page.Activities.Count);
        Assert.Equal(25, page.Total);
        Assert.Equal("Museum 1", page.Activities[0].Name);
        Assert.Equal([new CategoryCount(ActivityCategory.Museum, 23), new CategoryCount(ActivityCategory.Viewpoint, 1), new CategoryCount(ActivityCategory.Castle, 1)], page.Categories.ToArray());
    }

    [Fact]
    public void Weitere_Seiten_schliessen_lueckenlos_an()
    {
        var names = Enumerable.Range(0, 3)
            .SelectMany(p => ActivityPaging.Page(All, null, null, ActivitySort.Popular, p * 10, 10).Activities)
            .Select(a => a.Name)
            .ToList();

        Assert.Equal(All.Select(a => a.Name), names);
    }

    [Fact]
    public void Kategorie_Suche_und_Entfernung()
    {
        var castles = ActivityPaging.Page(All, ActivityCategory.Castle, null, ActivitySort.Popular, 0, 10);
        Assert.Equal(1, castles.Total);
        Assert.Equal(3, castles.Categories.Count); // Chips bleiben vollständig

        var search = ActivityPaging.Page(All, null, "tejo", ActivitySort.Popular, 0, 10);
        Assert.Equal("Turm von Belém", Assert.Single(search.Activities).Name);
        Assert.Equal(ActivityCategory.Castle, Assert.Single(search.Categories).Category);

        var nearest = ActivityPaging.Page(All, null, null, ActivitySort.Distance, 0, 2);
        Assert.Equal(["Miradouro", "Turm von Belém"], nearest.Activities.Select(a => a.Name).ToArray());
    }

    [Fact]
    public void Ungueltige_Seitenangaben_werden_abgelehnt()
    {
        Assert.Equal("limit", Assert.Throws<DomainException>(() => ActivityPaging.Page(All, null, null, ActivitySort.Popular, 0, 500)).Field);
        Assert.Equal("offset", Assert.Throws<DomainException>(() => ActivityPaging.Page(All, null, null, ActivitySort.Popular, -1, 10)).Field);
    }
}
