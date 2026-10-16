namespace Urlaubsplanner.Domain.Trips;

/// <summary>Jemand, der mitreist.</summary>
public sealed record TripMember(Guid Id, string Name);

/// <summary>
/// Eine zusätzliche Ausgabe (z. B. Abendessen, Tanken). <see cref="PaidBy"/>: wer bezahlt hat (<c>null</c> = noch offen);
/// <see cref="For"/>: für wen – leer heißt für alle.
/// </summary>
public sealed record Expense(Guid Id, string Title, decimal Amount, Guid? PaidBy, IReadOnlyList<Guid> For, DateOnly? Date = null);

/// <summary>Wer eine gespeicherte Buchung (Flug, Hotel …) bezahlt hat und für wen sie ist. Leeres <see cref="For"/> = für alle.</summary>
public sealed record OptionShare(Guid OptionId, Guid? PaidBy, IReadOnlyList<Guid> For);

/// <summary>Mitreisende und wer was bezahlt – Grundlage für „wer schuldet wem“.</summary>
public sealed record TripParty(IReadOnlyList<TripMember> Members, IReadOnlyList<Expense> Expenses, IReadOnlyList<OptionShare> OptionShares)
{
    public const int MaxExpenses = 500;

    public static TripParty Empty { get; } = new([], [], []);

    internal static TripParty Validate(TripParty party, IReadOnlyCollection<Guid> optionIds)
    {
        ArgumentNullException.ThrowIfNull(party);
        var members = (party.Members ?? [])
            .Select(m => m with { Name = Guard.RequiredText(m.Name, "name", 60) })
            .ToList();
        if (members.Count > Trip.MaxTravelers)
        {
            throw new DomainException("members", $"Höchstens {Trip.MaxTravelers} Mitreisende.");
        }

        if (members.Select(m => m.Id).Distinct().Count() != members.Count)
        {
            throw new DomainException("members", "Doppelte Mitreisende.");
        }

        var ids = members.Select(m => m.Id).ToHashSet();
        var expenses = party.Expenses ?? [];
        if (expenses.Count > MaxExpenses)
        {
            throw new DomainException("expenses", $"Höchstens {MaxExpenses} Ausgaben.");
        }

        var cleanedExpenses = expenses
            .Select(e => e with
            {
                Title = Guard.RequiredText(e.Title, "title", 120),
                Amount = Guard.OptionalPrice(e.Amount, "amount") ?? 0,
                PaidBy = KnownOrNull(e.PaidBy, ids),
                For = Known(e.For, ids),
            })
            .ToList();

        // Anteile gelöschter Buchungen fallen still weg; unbekannte Personen ebenso.
        var shares = (party.OptionShares ?? [])
            .Where(s => optionIds.Contains(s.OptionId))
            .GroupBy(s => s.OptionId)
            .Select(g => g.Last())
            .Select(s => s with { PaidBy = KnownOrNull(s.PaidBy, ids), For = Known(s.For, ids) })
            .ToList();
        return new TripParty(members, cleanedExpenses, shares);
    }

    internal TripParty WithoutOption(Guid optionId) => this with { OptionShares = OptionShares.Where(s => s.OptionId != optionId).ToList() };

    private static Guid? KnownOrNull(Guid? id, HashSet<Guid> ids) => id is { } value && ids.Contains(value) ? value : null;

    private static List<Guid> Known(IReadOnlyList<Guid>? list, HashSet<Guid> ids) => (list ?? []).Where(ids.Contains).Distinct().ToList();
}
