namespace Urlaubsplanner.Domain;

public sealed class NotFoundException(string entity, Guid id) : Exception($"{entity} {id} wurde nicht gefunden.")
{
    public string Entity { get; } = entity;

    public Guid EntityId { get; } = id;
}
