namespace Urlaubsplanner.Domain;

/// <summary>Restliche Suchen beim Anbieter (z. B. 250 kostenlose Google-Suchen pro Monat bei SerpApi).</summary>
public sealed record SearchQuota(int Left, int PerMonth);

/// <summary>Prüft einen API-Key beim Anbieter (kostenlos, zählt nicht als Suche).</summary>
public interface ISearchKeyCheck
{
    /// <summary>Restliche Suchen, oder null, wenn der Anbieter den Key nicht kennt.</summary>
    Task<SearchQuota?> CheckAsync(string apiKey, CancellationToken cancellationToken);
}

/// <summary>Der Anbieter war für die Prüfung nicht erreichbar – über den Key sagt das nichts.</summary>
public sealed class KeyCheckUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
