namespace Urlaubsplanner.Domain;

/// <summary>
/// Wird geworfen, wenn eine fachliche Regel verletzt wird (z. B. Enddatum vor Startdatum).
/// Die API übersetzt sie in eine 400-Antwort mit dem betroffenen Feld.
/// </summary>
public sealed class DomainException(string field, string message) : Exception(message)
{
    public string Field { get; } = field;
}
