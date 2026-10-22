using System.Text.Json.Serialization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Api;
using Urlaubsplanner.Api.Activities;
using Urlaubsplanner.Api.Desktop;
using Urlaubsplanner.Api.Endpoints;
using Urlaubsplanner.Infrastructure;
using Urlaubsplanner.Infrastructure.Persistence;

// Desktop-App (Doppelklick aufs Icon): Programmordner als Inhaltsordner, Daten im Benutzerordner, eigenes Fenster.
var desktop = AppPaths.IsDesktopRequested(args);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = desktop ? AppContext.BaseDirectory : null,
});

var paths = AppPaths.Resolve(desktop, builder.Configuration[$"{JsonStorageOptions.Section}:FilePath"]);
Directory.CreateDirectory(paths.DataDirectory);

// In der App eingetragene Einstellungen (z. B. der eigene SerpApi-Key) – überschreiben alles andere.
builder.Configuration.AddJsonFile(paths.SettingsFile, optional: true, reloadOnChange: true);

var port = 0;
var openWindow = !args.Contains("--no-window", StringComparer.OrdinalIgnoreCase);
if (desktop)
{
    // Läuft die App schon: offenes Fenster nach vorne holen (oder eins öffnen) – kein zweiter Server.
    using (var launchLog = new FileLoggerProvider(paths.LogFile))
    {
        if (await DesktopLauncher.TryActivateExistingAsync(paths, launchLog.CreateLogger("Urlaubsplanner.Start")))
        {
            return;
        }
    }

    // Liegt noch ein heruntergeladenes Update bereit (z. B. weil die App beim letzten Mal nicht sauber beendet wurde),
    // jetzt installieren und die neue Version starten.
    if (builder.Configuration.GetValue($"{UpdateOptions.Section}:Enabled", true))
    {
        using var startupLog = new FileLoggerProvider(paths.LogFile);
        var target = AppUpdater.DetectTarget(paths);
        if (AppUpdater.ApplyStaged(target, paths, startupLog.CreateLogger("Urlaubsplanner.Update")))
        {
            target!.Relaunch(args);
            return;
        }
    }

    port = DesktopLauncher.ChoosePort();
    builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        [$"{JsonStorageOptions.Section}:FilePath"] = paths.TripsFile,
    });
    builder.Logging.AddProvider(new FileLoggerProvider(paths.LogFile));
    builder.Services.AddSingleton<DesktopLifetime>();
    builder.Services.AddHostedService(sp => sp.GetRequiredService<DesktopLifetime>());
}

builder.Services.AddSingleton(paths);

// Aktivitäten-Vorschläge dauerhaft im Datenordner speichern und im Hintergrund vorladen.
if (string.IsNullOrWhiteSpace(builder.Configuration["Activities:CacheDirectory"]))
{
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Activities:CacheDirectory"] = Path.Combine(paths.DataDirectory, "aktivitaeten"),
    });
}

builder.Services.AddSingleton<ActivityPrefetcher>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ActivityPrefetcher>());
builder.Services.AddSingleton<AppSettingsStore>();
builder.Services.AddSingleton<SearchDefaultsStore>();
builder.Services.AddSingleton<Urlaubsplanner.Api.PriceWatch.PriceWatchStore>();
builder.Services.AddSingleton<Urlaubsplanner.Api.PriceStats.PriceArchive>();
builder.Services.AddHostedService<Urlaubsplanner.Api.PriceWatch.PriceWatcher>();
builder.Services.AddSingleton<Urlaubsplanner.Api.Packing.PackingTemplateStore>();
builder.Services.AddSingleton<AppInstallation>();

// Automatische Updates der Desktop-App von GitHub (beim Entwickeln ohne Wirkung).
builder.Services.Configure<UpdateOptions>(builder.Configuration.GetSection(UpdateOptions.Section));
builder.Services.AddHttpClient(ConnectivityCheck.HttpClientName, http =>
{
    http.Timeout = TimeSpan.FromSeconds(10);
    http.DefaultRequestHeaders.UserAgent.ParseAdd("Urlaubsplanner/1.0 (Verbindungstest; +https://github.com/xoannogueira/urlaubsplanner)");
});
builder.Services.AddHttpClient(AppUpdater.HttpClientName, (sp, http) => AppUpdater.ConfigureClient(http, sp.GetRequiredService<IOptions<UpdateOptions>>().Value));
builder.Services.AddSingleton<AppUpdater>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AppUpdater>());

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseResponseCompression();

// Nur Anfragen aus der App selbst dürfen etwas ändern (Schutz vor fremden Webseiten).
app.UseLocalRequestGuard();

app.MapGet("/api/health", () => TypedResults.Ok(new { status = "ok" }));
app.MapAppEndpoints();
app.MapTripEndpoints();
app.MapPlaceEndpoints();
app.MapHotelEndpoints();
app.MapFlightEndpoints();
app.MapAirportEndpoints();
app.MapActivityEndpoints();
app.MapTransitEndpoints();
app.MapWeatherEndpoints();
app.MapPackingTemplateEndpoints();
app.MapPriceWatchEndpoints();
app.MapPriceStatsEndpoints();

// Im Produktivbetrieb liefert die API auch das gebaute Frontend aus (frontend/dist → wwwroot).
// .mjs (z. B. der Web-Worker der Karte) kennt ASP.NET nicht von Haus aus – ohne Eintrag würde er nicht ausgeliefert.
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".mjs"] = "text/javascript";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

// Seiten-Pfade (ohne Dateiendung, nicht /api/...) landen in der React-App (Client-Routing).
// Fehlende Dateien und unbekannte API-Pfade bleiben ein sauberes 404 statt HTML.
app.MapFallbackToFile("{*path:nonfile:regex(^(?!api(/|$)).*$)}", "index.html");

if (desktop)
{
    await app.StartAsync();
    var url = $"http://127.0.0.1:{port}/";
    DesktopLauncher.WriteInstance(paths, port);
    if (openWindow)
    {
        var opened = DesktopLauncher.OpenWindow(url, paths);
        var startLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Urlaubsplanner.Start");
        DesktopLauncher.LogOpened(startLog, opened);
    }

    await app.WaitForShutdownAsync();
    DesktopLauncher.DeleteInstance(paths);

    // Deinstallieren angefordert: aufräumen lassen, sonst nichts mehr tun.
    if (app.Services.GetRequiredService<AppInstallation>().RunPendingUninstall())
    {
        return;
    }

    // Fenster geschlossen: bereitliegendes Update jetzt installieren – beim nächsten Start läuft die neue Version.
    // Bei „Jetzt neu starten“ gleich wieder starten; das offene Fenster lädt sich dann selbst neu.
    var updater = app.Services.GetRequiredService<AppUpdater>();
    updater.ApplyStaged();
    if (updater.RestartRequested)
    {
        updater.Relaunch(["--no-window"]);
    }
    else
    {
        // Mac: Browser ohne Fenster läuft sonst im Dock weiter.
        WindowFocus.CloseBrowser(paths);
    }
}
else
{
    await app.RunAsync();
}

/// <summary>Für spätere Integrationstests (WebApplicationFactory) sichtbar.</summary>
public partial class Program;
