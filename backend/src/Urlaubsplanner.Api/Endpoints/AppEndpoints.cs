using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Infrastructure.Activities;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Api.Endpoints;

public sealed record SerpApiKeyBody(string? ApiKey);

/// <param name="FromApp">In der App eingetragen (dort änderbar) – sonst über User Secrets oder Umgebung gesetzt.</param>
public sealed record SerpApiKeyStatus(bool Configured, string? Hint, bool FromApp);

public sealed record WindowsResponse(int Open, bool Starting);

public sealed record OpenUrlBody(string? Url);

public sealed record UninstallBody(bool KeepData);

public sealed record PdfSaved(string Path, string FileName);

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

        // Links aus der App im Standardbrowser öffnen (mit den Logins der Person) statt im App-Fenster.
        group.MapPost("/open-url", (AppPaths paths, OpenUrlBody body) =>
        {
            if (!paths.Desktop)
            {
                return Results.Conflict();
            }

            if (!Uri.TryCreate(body.Url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["url"] = ["Nur http- und https-Adressen."] });
            }

            return DefaultBrowser.OpenUrl(uri.AbsoluteUri) ? Results.NoContent() : Results.Problem("Der Browser ließ sich nicht öffnen.");
        });

        // Reiseplan-PDF (im Browser erzeugt): im Downloads-Ordner speichern und öffnen.
        group.MapPost("/pdf", async (AppPaths paths, HttpRequest request, string? title) =>
        {
            if (!paths.Desktop)
            {
                return Results.Conflict();
            }

            if (!string.Equals(request.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
            {
                return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            }

            using var buffer = new MemoryStream();
            await request.Body.CopyToAsync(buffer).ConfigureAwait(false);
            var pdf = buffer.ToArray();
            if (pdf.Length < 5 || !pdf.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["pdf"] = ["Keine PDF-Datei."] });
            }

            try
            {
                var path = PdfExport.SaveAndOpen(pdf, title ?? "Reise");
                return Results.Ok(new PdfSaved(path, Path.GetFileName(path)));
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                return Results.Problem(e.Message, title: "Die PDF konnte nicht gespeichert werden");
            }
        });

        // Installation: Dock (Mac) und Deinstallieren.
        group.MapGet("/installation", (AppInstallation installation) => TypedResults.Ok(installation.Status()));
        group.MapPost("/installation/dock", (AppInstallation installation) =>
        {
            try
            {
                return installation.AddToDock() ? Results.Ok(installation.Status()) : Results.Conflict();
            }
            catch (Exception e) when (e is IOException or InvalidOperationException or System.Xml.XmlException or System.ComponentModel.Win32Exception)
            {
                return Results.Problem(e.Message, title: "Ins Dock legen hat nicht geklappt");
            }
        });
        group.MapPost("/installation/uninstall", (AppInstallation installation, UninstallBody body) =>
            installation.Status().CanUninstall && installation.RequestUninstall(body.KeepData) ? Results.Accepted() : Results.Conflict());

        // Für den zweiten Klick aufs App-Icon: Ist schon ein Fenster offen, wird es nach vorne geholt statt ein neues zu öffnen.
        group.MapGet("/windows", (IServiceProvider services) =>
        {
            var lifetime = services.GetService<DesktopLifetime>();
            return TypedResults.Ok(new WindowsResponse(lifetime?.OpenWindows ?? 0, lifetime?.WaitingForFirstWindow ?? false));
        });

        // Automatische Updates: Stand abfragen und bereitliegendes Update sofort installieren.
        group.MapGet("/update", (AppUpdater updater) => TypedResults.Ok(updater.Status));
        group.MapPost("/update/check", (AppUpdater updater) =>
            updater.RequestCheck()
                ? Results.Accepted()
                : Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Gerade nicht möglich", detail: "Es wird schon gesucht, ein Update liegt bereit oder Updates sind aus."));
        group.MapPost("/update/restart", (AppUpdater updater) =>
            updater.RequestRestart()
                ? Results.Accepted()
                : Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Kein Update bereit", detail: "Es liegt gerade kein Update zum Installieren bereit."));

        // „Verbindung prüfen“: erreicht die App die Dienste für die Suchen? (Hilft bei Antivirus/Firewall)
        group.MapGet("/connectivity", async (IHttpClientFactory factory, IConfiguration configuration, IOptions<ActivityOptions> activities, CancellationToken ct) =>
            TypedResults.Ok(await ConnectivityCheck.RunAsync(factory.CreateClient(ConnectivityCheck.HttpClientName), configuration, ct, activities.Value.OverpassUrls)));

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
