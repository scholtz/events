# Events API

`EventsApi` is the GraphQL backend for the event catalog application. It replaces the starter schema with a production-oriented domain model for curated event discovery, community submissions, contributor dashboards, and admin moderation.

## Features
- GraphQL API for public event discovery and authenticated management
- Event domain taxonomy with administrator-managed `slug` and `subdomain`
- JWT authentication for contributors and administrators
- Entity Framework Core storage using SQLite by default
- Seeded sample data for Prague crypto and AI events
- Contributor dashboard queries and admin moderation queries/mutations
- Automated tests, container image build, and Kubernetes deployment manifests

## Data model
- `ApplicationUser` - contributor or administrator account
- `EventDomain` - administrator-managed catalog domain such as `crypto`, `ai`, or `cooking`
- `CatalogEvent` - published or pending event with external link, map coordinates, and moderation metadata

## Local development
1. Restore packages and run the app:
   - `dotnet restore events.slnx`
   - `dotnet run --project EventsApi.csproj`
2. Open `http://localhost:5000/graphql` or the HTTPS equivalent.
3. Default seeded admin credentials are defined in `appsettings.json` under `SeedData`.

## Deployed API
The backend is deployed and available at `https://events-api.de-4.biatec.io/graphql`.

## Authentication
Authenticate with the `registerUser` or `login` mutation and send the returned JWT as an `Authorization: Bearer <token>` header.

## Example queries
### Find all Prague crypto events next month
```graphql
query UpcomingCryptoPrague($filter: EventFilterInput) {
  events(filter: $filter) {
    name
    description
    eventUrl
    venueName
    city
    latitude
    longitude
    mapUrl
    domain {
      name
      subdomain
    }
  }
}
```

Example variables:
```json
{
  "filter": {
    "domainSlug": "crypto",
    "city": "Prague",
    "startsFromUtc": "2025-04-01T00:00:00Z",
    "startsToUtc": "2025-04-30T23:59:59Z"
  }
}
```

### Register a contributor
```graphql
mutation Register($input: RegisterUserInput!) {
  registerUser(input: $input) {
    token
    user {
      id
      email
      role
    }
  }
}
```

### Submit an event
```graphql
mutation Submit($input: EventSubmissionInput!) {
  submitEvent(input: $input) {
    id
    name
    status
    domain {
      slug
    }
  }
}
```

### Contributor dashboard
```graphql
query Dashboard {
  myDashboard {
    totalSubmittedEvents
    pendingApprovalEvents
    managedEvents {
      name
      status
      startsAtUtc
    }
    availableDomains {
      name
      slug
      subdomain
    }
  }
}
```

### Admin overview
```graphql
query AdminOverview {
  adminOverview {
    totalUsers
    totalDomains
    totalPublishedEvents
    totalPendingEvents
    pendingReviewEvents {
      name
      status
      submittedBy {
        displayName
        email
      }
    }
  }
}
```

## Frontend integration notes
- Use `domainBySubdomain(subdomain: ...)` to resolve the active domain from the current host.
- Use `events(filter: ...)` for catalog pages and `eventBySlug(slug: ...)` for detail views.
- Store the JWT client-side and attach it to `myDashboard`, `submitEvent`, `updateMyEvent`, and admin operations.
- Coordinates and `mapUrl` are exposed directly from `CatalogEvent` for map rendering.

## Testing
- `dotnet test events.slnx`

## Deployment
- Container image build uses `Dockerfile`
- Kubernetes manifests live in `deploy/k8s`
- GitHub Actions workflow lives at `../../.github/workflows/events-api-ci-cd.yml`
