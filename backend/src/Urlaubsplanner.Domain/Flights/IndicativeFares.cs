namespace Urlaubsplanner.Domain.Flights;

/// <summary>
/// Richtpreis für einen Abflugtag aus einer kostenlosen Quelle (Aviasales über Travelpayouts): zwischengespeicherte
/// Ergebnisse aus Suchen anderer Nutzer, einige Tage alt – gut für Trends, vor dem Buchen genau nachprüfen.
/// </summary>
public sealed record IndicativeFare(DateOnly Date, decimal Price, string? Airline, int? Stops);

/// <summary>Ist die kostenlose Preisquelle nutzbar?</summary>
public enum IndicativeSourceState
{
    /// <summary>Key gültig, Abfragen gehen.</summary>
    Ok,

    /// <summary>Kein Key hinterlegt.</summary>
    Missing,

    /// <summary>Key abgelehnt (ungültig oder gesperrt).</summary>
    Rejected,

    /// <summary>Zu viele Abfragen – später wieder.</summary>
    Limited,

    /// <summary>Dienst nicht erreichbar (offline, gestört).</summary>
    Unreachable,
}

public sealed class IndicativeFaresException(IndicativeSourceState state, string message, Exception? inner = null)
    : Exception(message, inner)
{
    public IndicativeSourceState State { get; } = state;
}

/// <summary>Kostenlose Richtpreise pro Tag eines Monats.</summary>
public interface IIndicativeFares
{
    bool IsConfigured { get; }

    /// <summary>Kurze Probeabfrage: Ist der Key gültig und der Dienst erreichbar?</summary>
    Task<IndicativeSourceState> CheckAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Günstigster einfacher Flug pro Abflugtag im Monat von <paramref name="month"/>. Tage ohne Daten fehlen.
    /// Hin &amp; zurück setzt der Aufrufer aus Hin- und Rückflug zusammen – Abfragen mit fester Reisedauer liefern
    /// bei Aviasales kaum Daten.
    /// </summary>
    /// <exception cref="IndicativeFaresException">Key abgelehnt, zu viele Abfragen oder nicht erreichbar.</exception>
    Task<IReadOnlyList<IndicativeFare>> MonthAsync(string origin, string destination, DateOnly month, CancellationToken cancellationToken);
}
