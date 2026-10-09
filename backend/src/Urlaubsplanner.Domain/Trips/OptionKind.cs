namespace Urlaubsplanner.Domain.Trips;

public enum OptionKind
{
    Flight,
    Hotel,
    Activity,
    Transport,
    Other,
}

/// <summary>
/// Lebenszyklus einer Option: Idee → Favorit → Ausgewählt → Gebucht.
/// Nur "Ausgewählt" und "Gebucht" zählen in die Kosten und in die Checkliste.
/// </summary>
public enum OptionStatus
{
    Idea,
    Favorite,
    Selected,
    Booked,
}

public static class OptionStatusExtensions
{
    public static bool IsChosen(this OptionStatus status) =>
        status is OptionStatus.Selected or OptionStatus.Booked;
}
