using System.Net;
using EventsApi.Configuration;
using EventsApi.Data;
using EventsApi.Data.Entities;
using EventsApi.Utilities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WebPush;
using EntityPushSubscription = EventsApi.Data.Entities.PushSubscription;

namespace EventsApi.Tests;

public sealed class ReminderDispatchServiceTests
{
    [Fact]
    public async Task DispatchDueRemindersOnceAsync_MarksReminderSent_WhenDeliverySucceeds()
    {
        var pushService = new StubPushNotificationService(PushDeliveryResult.Delivered());
        await using var provider = BuildServiceProvider(pushService);

        var seeded = await SeedReminderScenarioAsync(provider);

        var service = CreateDispatchService(provider);
        await service.DispatchDueRemindersOnceAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reminder = await dbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);
        var subscription = await dbContext.PushSubscriptions.SingleAsync(ps => ps.Id == seeded.SubscriptionId);

        Assert.NotNull(reminder.SentAtUtc);
        Assert.Equal(1, pushService.CallCount);
        Assert.Equal(subscription.Id, seeded.SubscriptionId);
    }

    [Fact]
    public async Task DispatchDueRemindersOnceAsync_RemovesSubscription_WhenDeliveryConfirmsStale()
    {
        var pushService = new StubPushNotificationService(
            PushDeliveryResult.Stale(HttpStatusCode.Gone, "Subscription expired."));
        await using var provider = BuildServiceProvider(pushService);

        var seeded = await SeedReminderScenarioAsync(provider);

        var service = CreateDispatchService(provider);
        await service.DispatchDueRemindersOnceAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reminder = await dbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);
        var subscriptionCount = await dbContext.PushSubscriptions.CountAsync(ps => ps.Id == seeded.SubscriptionId);

        Assert.NotNull(reminder.SentAtUtc);
        Assert.Equal(0, subscriptionCount);
        Assert.Equal(1, pushService.CallCount);
    }

    [Fact]
    public async Task DispatchDueRemindersOnceAsync_LeavesReminderPending_WhenDeliveryFailsRetryably()
    {
        var pushService = new StubPushNotificationService(
            PushDeliveryResult.Retryable(HttpStatusCode.ServiceUnavailable, "Temporary outage."));
        await using var provider = BuildServiceProvider(pushService);

        var seeded = await SeedReminderScenarioAsync(provider);

        var service = CreateDispatchService(provider);
        await service.DispatchDueRemindersOnceAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reminder = await dbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);
        var subscriptionCount = await dbContext.PushSubscriptions.CountAsync(ps => ps.Id == seeded.SubscriptionId);

        Assert.Null(reminder.SentAtUtc);
        Assert.Equal(1, subscriptionCount);
        Assert.Equal(1, pushService.CallCount);
    }

    [Fact]
    public async Task DispatchDueRemindersOnceAsync_LeavesReminderPending_WhenPushIsMisconfigured()
    {
        var pushService = new StubPushNotificationService(
            PushDeliveryResult.Misconfigured("Missing VAPID configuration."));
        await using var provider = BuildServiceProvider(pushService);

        var seeded = await SeedReminderScenarioAsync(provider);

        var service = CreateDispatchService(provider);
        await service.DispatchDueRemindersOnceAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reminder = await dbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);
        var subscriptionCount = await dbContext.PushSubscriptions.CountAsync(ps => ps.Id == seeded.SubscriptionId);

        Assert.Null(reminder.SentAtUtc);
        Assert.Equal(1, subscriptionCount);
        Assert.Equal(1, pushService.CallCount);
    }

    [Fact]
    public async Task StartAsync_ProcessesDueReminderImmediately_OnHostedServiceStartup()
    {
        var pushService = new StubPushNotificationService(PushDeliveryResult.Delivered());
        await using var provider = BuildServiceProvider(pushService);

        var seeded = await SeedReminderScenarioAsync(provider);

        var service = CreateDispatchService(provider);

        try
        {
            await service.StartAsync(CancellationToken.None);

            await WaitForAsync(async () =>
            {
                await using var scope = provider.CreateAsyncScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var reminder = await dbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);
                return reminder.SentAtUtc is not null;
            });
        }
        finally
        {
            await service.StopAsync(CancellationToken.None);
        }

        await using var verificationScope = provider.CreateAsyncScope();
        var verificationDbContext = verificationScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sentReminder = await verificationDbContext.EventReminders.SingleAsync(r => r.Id == seeded.ReminderId);

        Assert.NotNull(sentReminder.SentAtUtc);
        Assert.Equal(
            1,
            pushService.CallCount); // protects issue #66 against delayed reminders after restarts/autoscaling events
    }

    [Fact]
    public async Task SendAsync_ReturnsMisconfigured_WhenVapidKeysAreMissing()
    {
        var webPushClient = new StubWebPushClient();
        var service = new VapidPushNotificationService(
            Options.Create(new VapidOptions()),
            webPushClient,
            NullLogger<VapidPushNotificationService>.Instance);

        var result = await service.SendAsync(
            new EntityPushSubscription
            {
                UserId = Guid.NewGuid(),
                Endpoint = "https://push.example.com/subscription",
                P256dh = "p256dh",
                Auth = "auth"
            },
            "Reminder: Demo Event",
            "Demo Event starts tomorrow.",
            "/event/demo-event");

        Assert.Equal(PushDeliveryStatus.Misconfigured, result.Status);
        Assert.Equal(0, webPushClient.CallCount);
    }

    [Fact]
    public async Task SendAsync_ReturnsStaleSubscription_WhenWebPushReturns410()
    {
        var webPushClient = new StubWebPushClient
        {
            OnSendAsync = (subscription, _, _, _) =>
                throw new WebPushException(
                    "gone",
                    subscription,
                    new HttpResponseMessage(HttpStatusCode.Gone))
        };
        var service = new VapidPushNotificationService(
            Options.Create(new VapidOptions
            {
                PublicKey = "BE6N5u3rY5X2MPO-_qJH8A0Y4ShMyGPPQ8Wn9ytf42W5Dk6byPU0-FV3A9GQzGpeZ0sLg0Hk0Zfx3Vq0T3FQf6Y",
                PrivateKey = "R2e6P6kF_gS_8kJQqO5U_lm3dNh4qPwv2gV8QfP3mO8",
                Subject = "mailto:test@example.com"
            }),
            webPushClient,
            NullLogger<VapidPushNotificationService>.Instance);

        var result = await service.SendAsync(
            new EntityPushSubscription
            {
                UserId = Guid.NewGuid(),
                Endpoint = "https://push.example.com/subscription",
                P256dh = "p256dh",
                Auth = "auth"
            },
            "Reminder: Demo Event",
            "Demo Event starts tomorrow.",
            "/event/demo-event");

        Assert.Equal(PushDeliveryStatus.StaleSubscription, result.Status);
        Assert.Equal(HttpStatusCode.Gone, result.HttpStatusCode);
    }

    [Fact]
    public async Task SendAsync_ReturnsRetryableFailure_WhenWebPushReturns503()
    {
        var webPushClient = new StubWebPushClient
        {
            OnSendAsync = (subscription, _, _, _) =>
                throw new WebPushException(
                    "unavailable",
                    subscription,
                    new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))
        };
        var service = new VapidPushNotificationService(
            Options.Create(new VapidOptions
            {
                PublicKey = "BE6N5u3rY5X2MPO-_qJH8A0Y4ShMyGPPQ8Wn9ytf42W5Dk6byPU0-FV3A9GQzGpeZ0sLg0Hk0Zfx3Vq0T3FQf6Y",
                PrivateKey = "R2e6P6kF_gS_8kJQqO5U_lm3dNh4qPwv2gV8QfP3mO8",
                Subject = "mailto:test@example.com"
            }),
            webPushClient,
            NullLogger<VapidPushNotificationService>.Instance);

        var result = await service.SendAsync(
            new EntityPushSubscription
            {
                UserId = Guid.NewGuid(),
                Endpoint = "https://push.example.com/subscription",
                P256dh = "p256dh",
                Auth = "auth"
            },
            "Reminder: Demo Event",
            "Demo Event starts tomorrow.",
            "/event/demo-event");

        Assert.Equal(PushDeliveryStatus.RetryableFailure, result.Status);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, result.HttpStatusCode);
    }

    private static ReminderDispatchService CreateDispatchService(ServiceProvider provider)
        => new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<ReminderDispatchService>.Instance);

    private static async Task WaitForAsync(
        Func<Task<bool>> condition,
        int attempts = 20,
        int delayMilliseconds = 50)
    {
        for (var attempt = 0; attempt < attempts; attempt++)
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(delayMilliseconds);
        }

        Assert.Fail("Timed out waiting for the hosted reminder dispatch cycle to complete.");
    }

    private static ServiceProvider BuildServiceProvider(IPushNotificationService pushService)
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(connection);
        services.AddDbContext<AppDbContext>(options =>
            options.UseSqlite(connection));
        services.AddScoped(_ => pushService);
        var provider = services.BuildServiceProvider();

        using var scope = provider.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

        return provider;
    }

    private static async Task<(Guid ReminderId, Guid SubscriptionId)> SeedReminderScenarioAsync(
        ServiceProvider provider)
    {
        await using var scope = provider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var organizer = new ApplicationUser
        {
            Email = "organizer@example.com",
            DisplayName = "Organizer",
            PasswordHash = "hash"
        };
        var attendee = new ApplicationUser
        {
            Email = "attendee@example.com",
            DisplayName = "Attendee",
            PasswordHash = "hash"
        };
        var domain = new EventDomain
        {
            Name = "Technology",
            Slug = "technology",
            Subdomain = "technology"
        };
        var startsAt = DateTime.UtcNow.AddHours(24);
        var eventEntity = new CatalogEvent
        {
            Name = "Push Reminder Demo",
            Slug = "push-reminder-demo",
            Description = "Reminder coverage event",
            EventUrl = "https://example.com/push-reminder-demo",
            VenueName = "Demo Hall",
            AddressLine1 = "Main Street 1",
            City = "Prague",
            CountryCode = "CZ",
            Latitude = 50.0755m,
            Longitude = 14.4378m,
            StartsAtUtc = startsAt,
            EndsAtUtc = startsAt.AddHours(2),
            Status = EventStatus.Published,
            PublishedAtUtc = DateTime.UtcNow.AddDays(-1),
            DomainId = domain.Id,
            Domain = domain,
            SubmittedByUserId = organizer.Id,
            SubmittedBy = organizer
        };
        var subscription = new EntityPushSubscription
        {
            UserId = attendee.Id,
            User = attendee,
            Endpoint = "https://push.example.com/subscription",
            P256dh = "p256dh",
            Auth = "auth"
        };
        var reminder = new EventReminder
        {
            UserId = attendee.Id,
            User = attendee,
            EventId = eventEntity.Id,
            Event = eventEntity,
            OffsetHours = 24,
            ScheduledForUtc = DateTime.UtcNow.AddMinutes(-1)
        };

        dbContext.Users.AddRange(organizer, attendee);
        dbContext.Domains.Add(domain);
        dbContext.Events.Add(eventEntity);
        dbContext.PushSubscriptions.Add(subscription);
        dbContext.EventReminders.Add(reminder);
        await dbContext.SaveChangesAsync();

        return (reminder.Id, subscription.Id);
    }

    private sealed class StubPushNotificationService(PushDeliveryResult result) : IPushNotificationService
    {
        public int CallCount { get; private set; }

        public Task<PushDeliveryResult> SendAsync(
            EntityPushSubscription subscription,
            string title,
            string body,
            string url,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(result);
        }
    }

    private sealed class StubWebPushClient : IWebPushClient
    {
        public int CallCount { get; private set; }

        public Func<WebPush.PushSubscription, string, VapidDetails, CancellationToken, Task>? OnSendAsync { get; init; }

        public HttpRequestMessage GenerateRequestDetails(WebPush.PushSubscription subscription, string payload, Dictionary<string, object> options)
            => throw new NotSupportedException();

        public void SendNotification(WebPush.PushSubscription subscription, string payload, Dictionary<string, object> options)
            => throw new NotSupportedException();

        public void SendNotification(WebPush.PushSubscription subscription, string payload, VapidDetails vapidDetails)
            => throw new NotSupportedException();

        public void SendNotification(WebPush.PushSubscription subscription, string payload, string gcmApiKey)
            => throw new NotSupportedException();

        public Task SendNotificationAsync(
            WebPush.PushSubscription subscription,
            string payload,
            Dictionary<string, object> options,
            CancellationToken cancellationToken)
            => Task.FromException(new NotSupportedException());

        public async Task SendNotificationAsync(
            WebPush.PushSubscription subscription,
            string payload,
            VapidDetails vapidDetails,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (OnSendAsync is not null)
            {
                await OnSendAsync(subscription, payload, vapidDetails, cancellationToken);
            }
        }

        public Task SendNotificationAsync(
            WebPush.PushSubscription subscription,
            string payload,
            string gcmApiKey,
            CancellationToken cancellationToken)
            => Task.FromException(new NotSupportedException());

        public void SetGcmApiKey(string gcmApiKey)
            => throw new NotSupportedException();

        public void SetVapidDetails(VapidDetails vapidDetails)
            => throw new NotSupportedException();

        public void SetVapidDetails(string subject, string publicKey, string privateKey)
            => throw new NotSupportedException();

        public void Dispose()
        {
        }
    }
}
