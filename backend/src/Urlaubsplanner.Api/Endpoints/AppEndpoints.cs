using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record SerpApiKeyBody(string? ApiKey);

/// <param name="FromApp">In der App eingetragen (dort änderbar) – sonst über User Secrets oder Umgebung gesetzt.</param>
public sealed record SerpApiKeyStatus(bool Configured, string? Hint, bool FromApp);

public sealed record WindowsResponse(int Open);

public sealed record SettingsResponse(SerpApiKeyStatus SerpApi, string FlightsProvider, string HotelsProvider, string DataDirectory, bool Desktop);

/// <summary>App-Infos, Lebenszeichen des Fensters (Desktop-App) und Einstellungen wie der eigene API-Key.</summary>
public static partial class AppEndpoints
{
    public static IEndpointRouteBuilder MapAppEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/app").WithTags("App");
        group.MapGet("/info", (AppPaths paths) => TypedResults.Ok(new
        {
            App = AppPaths.AppId,
            paths.Desktop,
            Version = AppUpdater.CurrentVersionText,
            paths.DataDirectory,
        }));

        // Nur in der Desktop-App gibt es den Wächter, der den Server beim Schließen des Fensters beendet.
        // „fenster“ = Kennung des Fensters, damit beim Schließen eines von zwei Fenstern nicht die ganze App endet.
        group.MapPost("/heartbeat", (IServiceProvider services, string? fenster) =>
        {
            services.GetService<DesktopLifetime>()?.Heartbeat(fenster);
            return TypedResults.NoContent();
        });
        group.MapPost("/closing", (IServiceProvider services, string? fenster) =>
        {
            services.GetService<DesktopLifetime>()?.Closing(fenster);
            return TypedResults.NoContent();
        });

        // Für den zweiten Klick aufs App-Icon: Ist schon ein Fenster offen, wird es nach vorne geholt statt ein neues zu öffnen.
        group.MapGet("/windows", (IServiceProvider services) =>
            TypedResults.Ok(new WindowsResponse(services.GetService<DesktopLifetime>()?.OpenWindows ?? 0)));

        // Automatische Updates: Stand abfragen und bereitliegendes Update sofort installieren.
        group.MapGet("/update", (AppUpdater updater) => TypedResults.Ok(updater.Status));
        group.MapPost("/update/restart", (AppUpdater updater) =>
            updater.RequestRestart()
                ? Results.Accepted()
                : Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Kein Update bereit", detail: "Es liegt gerade kein Update zum Installieren bereit."));

        var settings = app.MapGroup("/api/settings").WithTags("Einstellungen");
        settings.MapGet("/", GetSettings);
        settings.MapPut("/serpapi", SetSerpApiKey);
        settings.MapDelete("/serpapi", RemoveSerpApiKey);
        return app;
    }

    private static Ok<SettingsResponse> GetSettings(
        AppPaths paths,
        AppSettingsStore store,
        IOptionsMonitor<SerpApiOptions> serpApi,
        IFlightSearch flights,
        IHotelSearch hotels)
    {
        var key = serpApi.CurrentValue.ApiKey;
        return TypedResults.Ok(new SettingsResponse(
            new SerpApiKeyStatus(!string.IsNullOrWhiteSpace(key), Hint(key), store.HasSerpApiKey()),
            flights.Provider,
            hotels.Provider,
            paths.DataDirectory,
            paths.Desktop));
    }

    /// <summary>Prüft den Key bei SerpApi (kostenlos) und speichert ihn nur, wenn er gültig ist.</summary>
    private static async Task<IResult> SetSerpApiKey(
        SerpApiKeyBody body,
        AppSettingsStore store,
        ISearchKeyCheck check,
        CancellationToken ct)
    {
        var key = (body.ApiKey ?? string.Empty).Trim();
        if (!KeyFormat().IsMatch(key))
        {
            throw new DomainException("apiKey", "Das sieht nicht wie ein SerpApi-Key aus – kopiere ihn genau aus deinem SerpApi-Konto (64 Zeichen, Buchstaben und Zahlen).");
        }

        var quota = await check.CheckAsync(key, ct)
            ?? throw new DomainException("apiKey", "SerpApi kennt diesen Key nicht. Kopiere ihn nochmal aus deinem Konto (serpapi.com → Your Account → API Key).");

        store.SetSerpApiKey(key);
        return TypedResults.Ok(new { Configured = true, Hint = Hint(key), Quota = quota });
    }

    private static NoContent RemoveSerpApiKey(AppSettingsStore store)
    {
        store.SetSerpApiKey(null);
        return TypedResults.NoContent();
    }

    /// <summary>Nur die letzten 4 Zeichen zeigen – der Key selbst verlässt das Backend nie.</summary>
    private static string? Hint(string? key) =>
        string.IsNullOrWhiteSpace(key) ? null : key.Length <= 4 ? "••••" : $"••••{key[^4..]}";

    [GeneratedRegex("^[A-Za-z0-9]{16,128}$")]
    private static partial Regex KeyFormat();
}
