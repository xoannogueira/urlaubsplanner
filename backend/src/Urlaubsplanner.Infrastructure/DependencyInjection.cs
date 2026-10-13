using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Urlaubsplanner.Domain;
using Urlaubsplanner.Domain.Activities;
using Urlaubsplanner.Domain.Flights;
using Urlaubsplanner.Domain.Hotels;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Trips;
using Urlaubsplanner.Infrastructure.Activities;
using Urlaubsplanner.Infrastructure.Flights;
using Urlaubsplanner.Infrastructure.Hotels;
using Urlaubsplanner.Infrastructure.Persistence;
using Urlaubsplanner.Infrastructure.Places;
using Urlaubsplanner.Infrastructure.SerpApi;

namespace Urlaubsplanner.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JsonStorageOptions>(configuration.GetSection(JsonStorageOptions.Section));
        services.AddSingleton<ITripRepository, JsonTripRepository>();

        services.AddMemoryCache();
        services.AddHttpClient<IPlaceSearch, PhotonPlaceSearch>(http =>
        {
            http.BaseAddress = new Uri(configuration["Places:PhotonUrl"] ?? "https://photon.komoot.io/");
            http.Timeout = TimeSpan.FromSeconds(6);
            // Photon bittet darum, dass sich Anwendungen erkennbar ausweisen.
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Urlaubsplanner/1.0 (privates Hobbyprojekt)");
        });

        // Hotels: Google Hotels über SerpApi, sobald ein SerpApi-Key hinterlegt ist – sonst LiteAPI.
        // Mit "Hotels:Provider" = "liteapi" bzw. "serpapi" lässt sich die Quelle fest wählen.
        // Umgekehrte Ortssuche über Photon – ohne Photon (z. B. in Tests) gibt es einfach keine Namen.
        services.AddTransient<IPlaceNames>(sp => sp.GetRequiredService<IPlaceSearch>() as IPlaceNames ?? new NoPlaceNames());

        services.Configure<LiteApiOptions>(configuration.GetSection(LiteApiOptions.Section));
        services.Configure<SerpApiOptions>(configuration.GetSection(SerpApiOptions.Section));

        // Der SerpApi-Key kann zur Laufzeit in der App eingetragen werden (settings.json) – deshalb bei jeder
        // Anfrage den aktuellen Stand lesen statt des Werts vom Start.
        services.AddTransient<IOptions<SerpApiOptions>>(sp => Options.Create(sp.GetRequiredService<IOptionsMonitor<SerpApiOptions>>().CurrentValue));
        services.AddHttpClient<ISearchKeyCheck, SerpApiKeyCheck>(http =>
        {
            http.BaseAddress = new Uri(configuration[$"{SerpApiOptions.Section}:BaseUrl"] ?? "https://serpapi.com/");
            http.Timeout = TimeSpan.FromSeconds(15);
        })
        .RemoveAllLoggers();
        if (UseSerpApi(configuration, "Hotels:Provider"))
        {
            services.AddHttpClient<IHotelSearch, SerpApiHotelSearch>(http =>
            {
                http.BaseAddress = new Uri(configuration[$"{SerpApiOptions.Section}:BaseUrl"] ?? "https://serpapi.com/");
                http.Timeout = TimeSpan.FromSeconds(60);
            })
            // Der Key steht in der URL – deshalb keine automatischen Request-Logs für diesen Client.
            .RemoveAllLoggers();
        }
        else
        {
            services.AddHttpClient<IHotelSearch, LiteApiHotelSearch>(http =>
            {
                http.BaseAddress = new Uri(configuration[$"{LiteApiOptions.Section}:BaseUrl"] ?? "https://api.liteapi.travel/v3.0/");
                // LiteAPI selbst bricht nach 8 s ab (timeout im Request) – etwas Puffer für die Antwort.
                http.Timeout = TimeSpan.FromSeconds(20);
            });
        }

        // Flüge: Google Flights über SerpApi, sobald ein SerpApi-Key hinterlegt ist – sonst LiteAPI (gleicher Key wie Hotels).
        // Mit "Flights:Provider" = "liteapi" bzw. "serpapi" lässt sich die Quelle fest wählen.
        if (UseSerpApi(configuration, "Flights:Provider"))
        {
            services.AddHttpClient<IFlightSearch, SerpApiFlightSearch>(http =>
            {
                http.BaseAddress = new Uri(configuration[$"{SerpApiOptions.Section}:BaseUrl"] ?? "https://serpapi.com/");
                http.Timeout = TimeSpan.FromSeconds(60);
            })
            // Der Key steht in der URL – deshalb keine automatischen Request-Logs für diesen Client.
            .RemoveAllLoggers();
        }
        else
        {
            services.AddHttpClient<IFlightSearch, LiteApiFlightSearch>(http =>
            {
                http.BaseAddress = new Uri(configuration[$"{LiteApiOptions.Section}:BaseUrl"] ?? "https://api.liteapi.travel/v3.0/");
                http.Timeout = TimeSpan.FromSeconds(45);
            });
        }

        services.AddSingleton<IAirportDirectory, AirportDirectory>();

        // Aktivitäten aus OpenStreetMap + Wikidata (frei, ohne Key). Beide bitten um einen erkennbaren User-Agent.
        services.Configure<ActivityOptions>(configuration.GetSection(ActivityOptions.Section));
        services.AddHttpClient<IActivitySearch, OsmActivitySearch>(http =>
        {
            http.Timeout = TimeSpan.FromSeconds(35);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Urlaubsplanner/1.0 (privates Hobbyprojekt; https://github.com/xoannogueira/urlaubsplanner)");
        });

        return services;
    }

    /// <summary>
    /// Ohne feste Wahl: SerpApi (Google) – außer es ist nur ein LiteAPI-Key hinterlegt. So nutzt die App für Freunde
    /// ohne Key gleich die Google-Suche, und der Key lässt sich später in der App eintragen.
    /// </summary>
    private static bool UseSerpApi(IConfiguration configuration, string providerKey)
    {
        var provider = configuration[providerKey];
        if (!string.IsNullOrWhiteSpace(provider))
        {
            return provider.Trim().Equals("serpapi", StringComparison.OrdinalIgnoreCase);
        }

        var hasSerpApi = !string.IsNullOrWhiteSpace(configuration[$"{SerpApiOptions.Section}:ApiKey"]);
        var hasLiteApi = !string.IsNullOrWhiteSpace(configuration[$"{LiteApiOptions.Section}:ApiKey"]);
        return hasSerpApi || !hasLiteApi;
    }
}

/// <summary>Ersatz, wenn die Ortssuche keine umgekehrte Suche kann.</summary>
internal sealed class NoPlaceNames : IPlaceNames
{
    public Task<IReadOnlyList<string>> NamesAroundAsync(Coordinates point, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<string>>([]);
}
