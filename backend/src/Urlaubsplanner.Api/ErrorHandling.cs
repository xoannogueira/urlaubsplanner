using Microsoft.AspNetCore.Diagnostics;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Domain.Places;

namespace Urlaubsplanner.Api;

/// <summary>
/// Übersetzt fachliche Fehler in passende HTTP-Antworten (RFC 9457 Problem Details).
/// </summary>
internal sealed class DomainExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        IResult? result = exception switch
        {
            DomainException e => TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { [e.Field] = [e.Message] },
                title: "Eingabe ungültig"),
            NotFoundException e => TypedResults.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: $"{e.Entity} nicht gefunden",
                detail: e.Message),
            PlaceSearchUnavailableException e => TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Ortssuche nicht erreichbar",
                detail: e.Message),
            HotelSearchNotConfiguredException e => TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Hotelsuche nicht eingerichtet",
                detail: e.Message,
                type: "urn:urlaubsplanner:hotel-search-not-configured"),
            HotelSearchUnavailableException e => TypedResults.Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Hotelsuche nicht erreichbar",
                detail: e.Message),
            FlightSearchNotConfiguredException e => TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Flugsuche nicht eingerichtet",
                detail: e.Message,
                type: "urn:urlaubsplanner:flight-search-not-configured"),
            FlightSearchUnavailableException e => TypedResults.Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Flugsuche nicht erreichbar",
                detail: e.Message),
            KeyCheckUnavailableException e => TypedResults.Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Prüfung nicht möglich",
                detail: e.Message),
            ActivitySearchUnavailableException e => TypedResults.Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Vorschläge nicht verfügbar",
                detail: e.Message),
            BadHttpRequestException e => TypedResults.Problem(
                statusCode: e.StatusCode,
                title: "Anfrage ungültig",
                detail: e.InnerException?.Message ?? e.Message),
            _ => null,
        };

        if (result is null)
        {
            return false;
        }

        await result.ExecuteAsync(httpContext);
        return true;
    }
}
