namespace Urlaubsplanner.Domain.Trips;

/// <summary>
/// Eine Reise (Aggregat-Wurzel). Etappen und Optionen werden nur über die Reise verändert,
/// damit Regeln wie "Option muss zu einer Etappe dieser Reise gehören" an einer Stelle gelten.
/// </summary>
public sealed class Trip
{
    public const int MaxTravelers = 50;

    private readonly List<Stage> _stages;
    private readonly List<TripOption> _options;

    private Trip(Guid id, DateTimeOffset createdAt, List<Stage> stages, List<TripOption> options)
    {
        Id = id;
        CreatedAt = createdAt;
        UpdatedAt = createdAt;
        Name = string.Empty;
        _stages = stages;
        _options = options;
    }

    public Guid Id { get; }

    public string Name { get; private set; }

    public int Travelers { get; private set; }

    /// <summary>
    /// Der Reisezeitraum – der eine Zeitraum, nach dem sich alles richtet (Kopfzeile, Flugsuche, Wetter, PDF).
    /// Ohne Etappen darf er offen sein; mit Etappen umfasst er immer alle Etappen (Lücken dazwischen sind erlaubt).
    /// </summary>
    public DateOnly? StartDate { get; private set; }

    public DateOnly? EndDate { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>Für spätere Accounts vorgesehen; in Phase 1 immer <c>null</c>.</summary>
    public string? OwnerId { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public IReadOnlyList<Stage> Stages => _stages.OrderBy(s => s.StartDate).ThenBy(s => s.Name, StringComparer.OrdinalIgnoreCase).ToList();

    public IReadOnlyList<TripOption> Options => _options;

    public PackingList Packing { get; private set; } = PackingList.Empty;

    public TripParty Party { get; private set; } = TripParty.Empty;

    public static Trip Create(TripData data, DateTimeOffset now)
    {
        var trip = new Trip(Guid.NewGuid(), now, [], []);
        trip.Update(data, now);
        return trip;
    }

    public static Trip Restore(
        Guid id,
        string name,
        int travelers,
        DateOnly? startDate,
        DateOnly? endDate,
        string? notes,
        string? ownerId,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        IEnumerable<Stage> stages,
        IEnumerable<TripOption> options,
        PackingList? packing = null,
        TripParty? party = null) =>
        new Trip(id, createdAt, stages.ToList(), options.ToList())
        {
            Packing = packing ?? PackingList.Empty,
            Party = party ?? TripParty.Empty,
            Name = name,
            Travelers = travelers,
            StartDate = startDate,
            EndDate = endDate,
            Notes = notes,
            OwnerId = ownerId,
            UpdatedAt = updatedAt,
        }.CoverStages();

    public void Update(TripData data, DateTimeOffset now)
    {
        var name = Guard.RequiredText(data.Name, "name", 120);
        var travelers = Guard.InRange(data.Travelers, "travelers", 1, MaxTravelers);
        if (Party.Members.Count > 0 && travelers != Party.Members.Count)
        {
            throw new DomainException("travelers", "Die Personenzahl richtet sich nach den eingetragenen Mitreisenden – dort hinzufügen oder entfernen.");
        }

        Guard.DateOrder(data.StartDate, data.EndDate, "endDate");
        var notes = Guard.OptionalText(data.Notes, "notes", 4000);

        if (_stages.Count > 0)
        {
            // Mit Etappen gilt: ein Zeitraum. Neue Daten verschieben erste und letzte Etappe; fehlende Daten lassen ihn, wie er ist.
            if (data.StartDate is { } start && data.EndDate is { } end && (start != StartDate || end != EndDate))
            {
                ChangePeriod(start, end, now);
            }
        }
        else
        {
            StartDate = data.StartDate;
            EndDate = data.EndDate;
        }

        Name = name;
        Travelers = travelers;
        Notes = notes;
        Touch(now);
    }

    public Stage AddStage(StageData data, DateTimeOffset now)
    {
        var stage = Stage.Create(data);
        _stages.Add(stage);
        CoverStages();
        Touch(now);
        return stage;
    }

    public Stage UpdateStage(Guid stageId, StageData data, DateTimeOffset now)
    {
        var stage = FindStage(stageId);
        stage.Update(data);
        CoverStages();
        Touch(now);
        return stage;
    }

    /// <summary>
    /// Neuer Reisezeitraum (z. B. weil der gebuchte Flug früher oder später fliegt): Die erste Etappe beginnt am neuen
    /// Startdatum, die letzte endet am neuen Enddatum. Etappen dazwischen bleiben unverändert.
    /// </summary>
    public void ChangePeriod(DateOnly start, DateOnly end, DateTimeOffset now)
    {
        Guard.DateOrder(start, end, "endDate");
        var ordered = Stages;
        if (ordered.Count > 0)
        {
            var first = ordered[0];
            var last = ordered[^1];
            if (start >= first.EndDate && ordered.Count > 1)
            {
                throw new DomainException("startDate", $"Der neue Beginn liegt nach dem Ende der ersten Etappe ({first.Name}) – diese Etappe zuerst anpassen oder löschen.");
            }

            if (end <= last.StartDate && ordered.Count > 1)
            {
                throw new DomainException("endDate", $"Das neue Ende liegt vor dem Beginn der letzten Etappe ({last.Name}) – diese Etappe zuerst anpassen oder löschen.");
            }

            if (ordered.Count == 1)
            {
                first.ChangeDates(start, end);
            }
            else
            {
                first.ChangeDates(start, first.EndDate);
                last.ChangeDates(last.StartDate, end);
            }
        }

        StartDate = start;
        EndDate = end;
        Touch(now);
    }

    /// <summary>
    /// Entfernt eine Etappe. Ihre Optionen bleiben erhalten und gelten danach für die ganze Reise,
    /// damit keine gespeicherten Links verloren gehen. Der Reisezeitraum bleibt, wie er ist.
    /// </summary>
    public void RemoveStage(Guid stageId, DateTimeOffset now)
    {
        var stage = FindStage(stageId);
        _stages.Remove(stage);
        foreach (var option in _options.Where(o => o.StageId == stageId))
        {
            option.DetachFromStage(now);
        }

        Touch(now);
    }

    public TripOption AddOption(OptionData data, DateTimeOffset now)
    {
        EnsureStageExists(data.StageId);
        var option = TripOption.Create(data, now);
        _options.Add(option);
        Touch(now);
        return option;
    }

    public TripOption UpdateOption(Guid optionId, OptionData data, DateTimeOffset now)
    {
        EnsureStageExists(data.StageId);
        var option = FindOption(optionId);
        option.Update(data, now);
        Touch(now);
        return option;
    }

    public TripOption ChangeOptionStatus(Guid optionId, OptionStatus status, DateTimeOffset now)
    {
        var option = FindOption(optionId);
        option.ChangeStatus(status, now);
        Touch(now);
        return option;
    }

    public TripOption ConfirmOptionPrice(Guid optionId, decimal price, DateTimeOffset now)
    {
        var option = FindOption(optionId);
        option.ConfirmPrice(price, now);
        Touch(now);
        return option;
    }

    public void RemoveOption(Guid optionId, DateTimeOffset now)
    {
        _options.Remove(FindOption(optionId));
        Party = Party.WithoutOption(optionId);
        Touch(now);
    }

    /// <summary>Ersetzt die Packliste (die App schickt immer die ganze Liste).</summary>
    public void SetPacking(PackingList packing, DateTimeOffset now)
    {
        Packing = PackingList.Validate(packing);
        Touch(now);
    }

    /// <summary>
    /// Ersetzt Mitreisende, Ausgaben und wer welche Buchung bezahlt hat. Sind Mitreisende eingetragen,
    /// richtet sich die Personenzahl nach ihnen – so stimmen Preise pro Person und die Aufteilung überein.
    /// </summary>
    public void SetParty(TripParty party, DateTimeOffset now)
    {
        Party = TripParty.Validate(party, _options.Select(o => o.Id).ToHashSet());
        if (Party.Members.Count > 0)
        {
            Travelers = Party.Members.Count;
        }

        Touch(now);
    }

    /// <summary>
    /// Liegt eine Etappe außerhalb des Reisezeitraums, wird er verlängert (nie verkürzt). Hat die Reise noch keinen
    /// Zeitraum, ergibt er sich aus den Etappen. Gilt auch beim Laden – ältere Reisen werden so angeglichen.
    /// </summary>
    private Trip CoverStages()
    {
        if (_stages.Count == 0)
        {
            return this;
        }

        var first = _stages.Min(s => s.StartDate);
        var last = _stages.Max(s => s.EndDate);
        StartDate = StartDate is { } start && start < first ? start : first;
        EndDate = EndDate is { } end && end > last ? end : last;
        return this;
    }

    private Stage FindStage(Guid stageId) =>
        _stages.Find(s => s.Id == stageId) ?? throw new NotFoundException("Etappe", stageId);

    private TripOption FindOption(Guid optionId) =>
        _options.Find(o => o.Id == optionId) ?? throw new NotFoundException("Option", optionId);

    private void EnsureStageExists(Guid? stageId)
    {
        if (stageId is { } id && !_stages.Exists(s => s.Id == id))
        {
            throw new DomainException("stageId", "Diese Etappe gibt es in der Reise nicht.");
        }
    }

    private void Touch(DateTimeOffset now) => UpdatedAt = now;
}

public sealed record TripData(string Name, int Travelers, DateOnly? StartDate = null, DateOnly? EndDate = null, string? Notes = null);
