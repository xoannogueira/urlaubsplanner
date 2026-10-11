using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Urlaubsplanner.Domain.Places;
using Urlaubsplanner.Domain.Trips;
using Urlaubsplanner.Infrastructure.Persistence;
using Urlaubsplanner.Infrastructure.Places;

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

        return services;
    }
}
