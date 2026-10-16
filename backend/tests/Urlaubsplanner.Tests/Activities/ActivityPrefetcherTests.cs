using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Urlaubsplanner.Api.Activities;
using Urlaubsplanner.Domain.Activities;

namespace Urlaubsplanner.Tests.Activities;

public sealed class ActivityPrefetcherTests
{
    private sealed class CountingSearch : IActivitySearch
    {
        private readonly Lock _gate = new();
        private readonly List<ActivitySearchRequest> _calls = [];

        public HashSet<string> Cached { get; } = [];

        public IReadOnlyList<ActivitySearchRequest> Calls
        {
            get
            {
                lock (_gate)
                {
                    return [.. _calls];
                }
            }
        }

        public Task<ActivitySearchResult> SearchAsync(ActivitySearchRequest request, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                _calls.Add(request);
            }

            return Task.FromResult(new ActivitySearchResult([], DateTimeOffset.UnixEpoch));
        }

        public bool IsCached(ActivitySearchRequest request) =>
            Cached.Contains(request.Center.Latitude.ToString("F3", System.Globalization.CultureInfo.InvariantCulture));
    }

    private static (ActivityPrefetcher Prefetcher, CountingSearch Search) Create(string? prefetch = null)
    {
        var search = new CountingSearch();
        var services = new ServiceCollection().AddSingleton<IActivitySearch>(search).BuildServiceProvider();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Activities:Prefetch"] = prefetch }).Build();
        return (new ActivityPrefetcher(services.GetRequiredService<IServiceScopeFactory>(), config, NullLogger<ActivityPrefetcher>.Instance), search);
    }

    private static async Task Settle(Func<bool> done)
    {
        for (var i = 0; i < 100 && !done(); i++)
        {
            await Task.Delay(20);
        }

        await Task.Delay(100);
    }

    [Fact]
    public async Task Laedt_jeden_Ort_einmal_im_Standard_Umkreis()
    {
        var (prefetcher, search) = Create();
        await prefetcher.StartAsync(CancellationToken.None);
        prefetcher.Enqueue(38.7223, -9.1393);
        prefetcher.Enqueue(38.72231, -9.13931); // gerundet derselbe Ort
        prefetcher.Enqueue(41.1579, -8.6291);
        await Settle(() => search.Calls.Count >= 2);
        await prefetcher.StopAsync(CancellationToken.None);

        Assert.Equal(2, search.Calls.Count);
        Assert.All(search.Calls, c => Assert.Equal(ActivitySearchRequest.DefaultRadiusMeters, c.RadiusMeters));
    }

    [Fact]
    public async Task Ueberspringt_Orte_die_schon_bereitliegen()
    {
        var (prefetcher, search) = Create();
        search.Cached.Add("38.722");
        await prefetcher.StartAsync(CancellationToken.None);
        prefetcher.Enqueue(38.7223, -9.1393);
        prefetcher.Enqueue(41.1579, -8.6291);
        await Settle(() => search.Calls.Count >= 1);
        await prefetcher.StopAsync(CancellationToken.None);

        Assert.Single(search.Calls);
    }

    [Fact]
    public async Task Laesst_sich_abschalten()
    {
        var (prefetcher, search) = Create("false");
        await prefetcher.StartAsync(CancellationToken.None);
        prefetcher.Enqueue(38.7223, -9.1393);
        await Settle(() => false);
        await prefetcher.StopAsync(CancellationToken.None);

        Assert.Empty(search.Calls);
    }
}
