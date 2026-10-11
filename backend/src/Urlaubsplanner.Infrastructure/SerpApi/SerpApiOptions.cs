namespace Urlaubsplanner.Infrastructure.SerpApi;

public sealed class SerpApiOptions
{
    public const string Section = "SerpApi";

    /// <summary>Kommt aus den User Secrets (<c>SerpApi:ApiKey</c>), nie aus dem Repo.</summary>
    public string? ApiKey { get; set; }

    public string BaseUrl { get; set; } = "https://serpapi.com/";

    public string Currency { get; set; } = "EUR";

    public string Language { get; set; } = "de";

    public string Country { get; set; } = "de";

    /// <summary>Auch Flüge hinter „Weitere Flüge anzeigen“ – deutlich mehr Ergebnisse, gleiche Anzahl Suchen.</summary>
    public bool ShowHidden { get; set; } = true;

    /// <summary>Gleiche Ergebnisse wie Google Flights im Browser, dafür langsamer (einige Sekunden mehr).</summary>
    public bool DeepSearch { get; set; } = true;
}
