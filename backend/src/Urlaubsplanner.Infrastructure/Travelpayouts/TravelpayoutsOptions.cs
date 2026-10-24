namespace Urlaubsplanner.Infrastructure.Travelpayouts;

public sealed class TravelpayoutsOptions
{
    public const string Section = "Travelpayouts";

    /// <summary>
    /// API-Token: beim Entwickeln aus den User Secrets (<c>Travelpayouts:Token</c>), in der Desktop-App beim Bauen
    /// mitgeliefert (bundled.json). Nie im Repo.
    /// </summary>
    public string? Token { get; set; }

    public string BaseUrl { get; set; } = "https://api.travelpayouts.com/";

    /// <summary>Markt der Preise (Standard bei Aviasales wäre Russland).</summary>
    public string Market { get; set; } = "de";
}
