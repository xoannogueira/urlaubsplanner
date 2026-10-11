namespace Urlaubsplanner.Domain;

/// <summary>Restliche Suchen beim Anbieter (z. B. 250 kostenlose Google-Suchen pro Monat bei SerpApi).</summary>
public sealed record SearchQuota(int Left, int PerMonth);
