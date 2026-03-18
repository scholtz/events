# GraphQL workflows

## Public catalog
- `domains` returns active domains for catalog navigation.
- `domainBySubdomain(subdomain: ...)` resolves a host such as `crypto.example.com`.
- `events(filter: ...)` supports filtering by domain, subdomain, city, and time window.
- `eventBySlug(slug: ...)` returns a published event detail page payload.

## Contributor workflow
1. `registerUser` or `login`
2. `submitEvent`
3. `myDashboard`
4. `updateMyEvent`

Contributors submit events into `PendingApproval`. Administrators can publish or reject them later.

## Admin workflow
- `adminOverview` provides users, pending events, and domain totals.
- `upsertDomain` manages domain names, slugs, and subdomains.
- `updateUserRole` promotes or demotes users.
- `reviewEvent` publishes or rejects an event with optional moderation notes.
