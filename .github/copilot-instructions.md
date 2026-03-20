# Copilot instructions for `scholtz/events`

## Repository structure
- Root repository currently contains the frontend app at `projects/events-frontend`.
- Backend GraphQL API lives at `projects/EventsApi`.
- The deployed backend is available at `https://events-api.de-4.biatec.io/graphql`.
- Main frontend source files are in `projects/events-frontend/src`.
- Views (page-level components) are in `src/views/`.
- Reusable components are in `src/components/`, organized by feature (e.g., `layout/`, `events/`).
- TypeScript type definitions are in `src/types/`.
- Pinia stores are in `src/stores/`.
- GraphQL client helper is in `src/lib/graphql.ts`.
- Global CSS styles and design tokens are in `src/assets/styles/main.css`.
- Vue Router configuration is in `src/router/index.ts`.

## Technology and conventions
- Frontend uses Vue 3 + TypeScript + Vite.
- Backend uses ASP.NET Core 8, Hot Chocolate GraphQL, Entity Framework Core, and JWT bearer authentication.
- Frontend communicates with the backend exclusively via GraphQL using a lightweight fetch-based client (`src/lib/graphql.ts`). There is no Supabase dependency.
- The GraphQL endpoint URL is configured via `VITE_GRAPHQL_URL` environment variable (defaults to `https://events-api.de-4.biatec.io/graphql`).
- State management uses Pinia with the Composition API (`defineStore` with `setup` function syntax).
- Routing uses Vue Router 5 with lazy-loaded route components (except the home page).
- Follow existing formatting conventions from `projects/events-frontend/.prettierrc.json`:
  - `semi: false`
  - `singleQuote: true`
  - `printWidth: 100`
- Keep changes minimal and scoped to the issue being solved.
- For any UI change or new UI behavior, add or update Playwright end-to-end tests that cover the user-visible flow.
- Use `<script setup lang="ts">` in all Vue single-file components.
- Use scoped styles (`<style scoped>`) in Vue components.
- Use CSS custom properties (variables) defined in `main.css` for theming/colors.
- Prefer semantic HTML elements and accessibility attributes.
- Use `@/` path alias for imports from the `src` directory.

## GraphQL integration
- All frontend data fetching uses GraphQL queries and mutations via `gqlRequest()` from `src/lib/graphql.ts`.
- Frontend types in `src/types/index.ts` are synced with backend entity models (`CatalogEvent`, `EventDomain`, `ApplicationUser`, `AuthPayload`, etc.).
- Backend status enums use SCREAMING_SNAKE_CASE: `PUBLISHED`, `PENDING_APPROVAL`, `REJECTED`, `DRAFT`.
- Backend user roles: `ADMIN`, `CONTRIBUTOR`.
- Key GraphQL operations:
  - **Queries**: `events`, `eventBySlug(slug)`, `domains`, `domainBySubdomain(subdomain)`, `me`, `myDashboard`, `adminOverview`
  - **Mutations**: `login(input)`, `registerUser(input)`, `submitEvent(input)`, `updateMyEvent(eventId, input)`, `reviewEvent(eventId, input)`, `upsertDomain(input)`, `updateUserRole(input)`
- Keep frontend event filtering aligned with backend `events(filter: ...)`, `domainBySubdomain(subdomain: ...)`, `eventBySlug(slug: ...)`, `myDashboard`, and `adminOverview` operations.
- Domain-specific catalog pages should use the backend `subdomain` and `slug` fields rather than hard-coded frontend routing metadata.

## Authentication
- JWT tokens are obtained via `login` or `registerUser` GraphQL mutations.
- Tokens are stored in `localStorage` under `auth_token` and `auth_expires` keys.
- The GraphQL client automatically attaches the JWT token as a Bearer token in the `Authorization` header.
- Token validation: `checkAuth()` in the auth store verifies the token hasn't expired and calls the `me` query.
- Logout simply clears localStorage - no server-side session invalidation needed.

## CORS configuration
- Backend CORS is configured in `appsettings.json` under `Cors.AllowedOrigins`.
- Production CORS origins are also set via environment variables in the K8s deployment (`Cors__AllowedOrigins__0`, etc.).
- Allowed origins include: `http://localhost:5173`, `https://events-delta-black.vercel.app`, `https://events-scholtz.vercel.app`.

## Organizer analytics quality standards

When implementing organizer-facing analytics features, always follow these quality standards to prevent shipping incomplete or misleading work:

### Analytics data integrity
- Every metric must be trustworthy. If a value is approximate, delayed, or derived from a subset, state it clearly in both the UI and the PR description.
- `totalInterestedCount` in `DashboardOverview` must only aggregate **published** events — never pending, rejected, or draft events. Rejected/pending events still appear in `eventAnalytics` with their own counts for organizer context, but must not inflate the headline KPI.
- Trend windows (7-day, 30-day) must use server-side `DateTime.UtcNow` cutoffs computed at query time, not cached values. Test boundary conditions explicitly.

### Authorization requirements
- All analytics queries must be protected with `[Authorize]`. Unauthenticated requests must return `AUTH_NOT_AUTHORIZED` errors, not empty data. Add an integration test that explicitly verifies this.
- Organizer analytics must be scoped to the requesting user's own events (`SubmittedByUserId == currentUserId`). Cross-organizer data leakage must be covered by an explicit isolation test.

### Backend test requirements for analytics features
Every analytics query must have integration tests covering:
1. Correct aggregate counts with realistic seed data
2. Zero/empty state (new event with no activity returns 0 counts, not null)
3. Organizer isolation (organizer A cannot see organizer B's data)
4. Status-specific rules (e.g., published-only headline totals)
5. Unauthenticated access returns an auth error
6. REJECTED/PENDING events — define explicitly what they contribute to each metric

### Frontend test requirements for analytics features
Every analytics dashboard must have E2E tests covering:
1. KPI card values match expected data
2. All trend badge variants: "this week" (last 7 days), "this month" (last 30 days), "No recent saves" (none)
3. Low-data guidance state (published events but zero saves)
4. Empty state (no events at all)
5. Error state (API failure shows error message + retry button)
6. Unauthenticated gate (sign-in prompt, no data shown)
7. Organizer data isolation (other organizers' events not visible)
8. Aggregate KPI correctness (total across multiple events)

### Privacy
- All analytics must be aggregate-only — never expose attendee identities, raw attendee lists, or anything that could link a specific person to an event interaction.
- Document in the PR which metrics are direct counts vs. derived, and confirm no PII is exposed.

## Event detail page quality standards

When implementing or extending the event detail page (`EventDetailView.vue` and `eventBySlug` backend query), always follow these standards to ensure the page is production-ready, privacy-safe, and fully tested.

### Feature completeness for each PR

Every PR that touches the event detail page must deliver a **full vertical slice**: GraphQL resolver changes (if any), frontend view changes, and tests at every level. A PR that only adds tests or only adds UI without corresponding backend or E2E coverage is not complete.

Specifically, the PR diff must include all of the following that are relevant to the change:
1. Backend: GraphQL query/resolver changes (if schema changes are needed)
2. Backend: Integration tests (`projects/EventsApi.Tests/GraphQlIntegrationTests.cs`)
3. Frontend: `EventDetailView.vue` changes
4. Frontend: Playwright E2E tests (`e2e/events.spec.ts`)

### Backend integration test requirements for event detail

Every backend change that affects `eventBySlug` must have integration tests covering:
1. **Location fields** — verify all location fields (`venueName`, `addressLine1`, `city`, `countryCode`, `latitude`, `longitude`, `mapUrl`) are returned correctly
2. **Zero/missing coordinates** — event with `latitude=0, longitude=0` must still be returned; backend does not reject such events; the frontend decides whether to show the map
3. **Non-published events return null** — `eventBySlug` must return `null` for `PENDING_APPROVAL` and `REJECTED` events to unauthenticated callers
4. **Unauthenticated public access** — `eventBySlug` works without a JWT token for published events
5. **interestedCount is aggregate-only** — the raw JSON response must contain no attendee emails, displayNames, or IDs; verify with `Assert.DoesNotContain` checks on the raw JSON string
6. **interestedCount starts at zero** — a new event with no saves returns `interestedCount: 0`, not null

### Frontend Playwright test requirements for event detail

Every frontend change to the event detail page must have E2E tests covering:
1. **Map present** — event with valid lat/lng shows an `<iframe>` with a map and an "Open in OpenStreetMap" link
2. **Map fallback** — event with zero/missing coordinates shows no iframe, shows fallback text and "Search on Google Maps" link
3. **Attendee section populated** — event with saves shows correct count text ("N people interested")
4. **Attendee zero-state** — event with no saves shows "Be the first to save this event"
5. **Sign-in prompt** — unauthenticated user sees "Sign in" link in the attendee section
6. **Error state** — API failure shows "Unable to load event" heading and "Try again" retry button
7. **Mobile viewport** — map and attendee section are both visible at 390×844 viewport
8. **Full journey** — authenticated user visits detail → sees map → sees attendee context → favorites → count updates
9. **Privacy** — attendee names and emails are absent from the rendered page even when favorites exist

### Privacy rules for event detail

- `interestedCount` on `eventBySlug` is a public aggregate (accessible without authentication). It communicates event momentum without exposing who saved the event.
- The `eventBySlug` response must never include a list of users who favorited the event. Only the count is permitted.
- The only user identity visible on the detail page is `submittedBy.displayName` (the organizer), which is intentional and not private.

### Error handling and fallback requirements

- When the API call for `eventBySlug` fails (network error, GraphQL error), the frontend must show a named error state with a retry button — not a blank page or spinner.
- When coordinates are zero or missing, the frontend must fall back to a textual location presentation with a Google Maps search link — not a broken or empty map section.
- When `interestedCount` is null or undefined (e.g., from a cached event that didn't fetch the detail fields), the UI must default to 0.


## HotChocolate v15 input type requirements

When writing backend integration tests or adding new fields to GraphQL input types, follow these rules to avoid 400 Bad Request errors:

- **Non-nullable fields with C# defaults are still required in GraphQL variables.** HotChocolate v15 requires all non-nullable input fields to be explicitly provided in request variables, even if the C# class has a default value (e.g., `= "EUR"`). Always include these fields in integration test mutations: `countryCode`, `currencyCode`, `isFree`, `attendanceMode`, etc.
- Use `decimal` literals (e.g., `50.075m`) for `decimal` fields in test variables to avoid type inference issues.
- When a test mutation returns a 400, modify `ExecuteGraphQlAsync` to capture the response body in the exception — the body tells you exactly which field is missing or invalid. The shared helper already does this (throws `"HTTP 400: {body}"`).
- Enum values in GraphQL variables are represented as strings using SCREAMING_SNAKE_CASE (e.g., `"HYBRID"`, `"IN_PERSON"`, `"UPCOMING"`). This matches HotChocolate's default enum naming convention.

## Event attendance mode

The `AttendanceMode` enum (`IN_PERSON`, `ONLINE`, `HYBRID`) is a first-class field on `CatalogEvent`:
- Stored as a string via EF Core `HasConversion<string>()` on the `Events` table.
- Exposed in `EventFilterInput.AttendanceMode?` for server-side filtering.
- Exposed in `EventSubmissionInput.AttendanceMode` (default: `InPerson`) for event creation/update.
- Serialized to URL as `?mode=in-person`, `?mode=online`, `?mode=hybrid`.
- Every `MockEvent` in E2E tests includes `attendanceMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID'` (default: `'IN_PERSON'`).
- `filterEventsForDiscovery` in `mock-api.ts` filters by `attendanceMode` to keep E2E tests deterministic.

## Advanced event discovery quality standards

When implementing or extending the event discovery feature, always deliver a full vertical slice and follow these standards:

### URL-state synchronization
- Every filter must have a corresponding URL query parameter that is kept in sync via the router.
- Filter state must be restored correctly on page reload and back/forward navigation.
- URL params use lowercase/hyphenated values: `?price=free`, `?sort=newest`, `?mode=in-person`, `?mode=hybrid`.
- Active filters are shown as removable chips (`.filter-chip`) and a "Clear all" button appears when any filter is active.

### Backend filter completeness checklist
Every new filter dimension added to `EventFilterInput` must:
1. Have a server-side `WHERE` clause in `Query.GetEventsAsync`
2. Be included in `SavedSearch` entity and `SavedSearchInput` if it's a persistent filter
3. Have integration tests covering: per-value isolation, no-filter returns all, combination with other filters, and empty result set
4. Be documented in the GraphQL schema comment

### Frontend filter completeness checklist
Every new filter dimension must:
1. Be added to `EventFilters` interface in `src/types/index.ts`
2. Be serialized/deserialized in `eventFiltersToQuery` / `eventFiltersFromQuery` in `events.ts`
3. Produce an active chip entry in `activeFilterChips` (cleared via `clearFilterChip`)
4. Have a corresponding UI control in `EventFilters.vue` with accessible `<label>` and `id`
5. Be included in `areEventFiltersEqual` and `createDefaultEventFilters`
6. Be passed to `buildDiscoveryFilterInput` for the GraphQL query
7. Have `attendanceMode` (and any new field) in `MockEvent` and `makeApprovedEvent` in the E2E mock helper
8. Have E2E tests in `discovery.spec.ts` covering: URL direct navigation, chip display, chip removal, and URL update on change

## Playwright E2E testing

### Structure
- Tests live in `projects/events-frontend/e2e/`.
- Shared API mock helpers are in `e2e/helpers/mock-api.ts`.
- Focus tests on one area per file: `home.spec.ts`, `auth.spec.ts`, `events.spec.ts`, `vue.spec.ts` (full flow).

### Always use the shared mock helper
All tests must set up API mocks **before** calling `page.goto()`. Use `setupMockApi(page, initialState)` from `./helpers/mock-api` to intercept all GraphQL API requests. This keeps tests deterministic and independent of a live backend.

```ts
import { setupMockApi, makeTechDomain, makeApprovedEvent } from './helpers/mock-api'

test('shows events', async ({ page }) => {
  setupMockApi(page, {
    domains: [makeTechDomain()],
    events: [makeApprovedEvent({ name: 'My Event', slug: 'my-event' })],
  })
  await page.goto('/')
  await expect(page.locator('.event-card', { hasText: 'My Event' })).toBeVisible()
})
```

### Selectors – prefer accessible locators
Use Playwright's accessible locators in this order of preference:
1. `page.getByRole('button', { name: '…' })` — preferred for interactive elements
2. `page.getByLabel('…')` — preferred for form fields
3. `page.getByRole('heading', { name: '…' })` — preferred for headings
4. `page.locator('.css-class', { hasText: '…' })` — acceptable for component-level checks (e.g., event cards)
5. Avoid `page.locator('[data-testid="…"]`)` unless the above are insufficient

### Assertions
- Always `await expect(...)` — never use bare `expect()` in async tests.
- Use `toBeVisible()` to confirm rendered UI, `toContainText()` for partial text.
- Use `toHaveURL(/pattern/)` after navigation actions.
- Avoid fixed `page.waitForTimeout()` calls; rely on `expect(...).toBeVisible()` or `page.waitForURL()` instead.

### Test isolation
- Each test gets its own fresh `MockState` object from `setupMockApi`.
- Do not share mutable state between tests; rely on the helper factories (`makeAdminUser`, `makeTechDomain`, `makeApprovedEvent`).
- Use `test.describe` blocks to group related tests by page or feature.

### CI
- Playwright tests run automatically on every push and PR via `.github/workflows/playwright.yml`.
- Only Chromium is used in CI to keep pipeline fast. Run all browsers locally if needed.
- The CI workflow builds the client first then runs `npm run test:e2e`.
- All tests must pass before a PR can be merged.

### Running tests locally
```bash
cd projects/events-frontend
# First time only
npx playwright install --with-deps chromium
# Run all e2e tests (starts dev server automatically)
npm run test:e2e
# Run a specific file
./node_modules/.bin/playwright test e2e/home.spec.ts --project=chromium
# Interactive / headed mode for debugging
./node_modules/.bin/playwright test --headed --project=chromium
# Debug step-by-step
./node_modules/.bin/playwright test --debug --project=chromium

## PWA and service-worker development

### Architecture
- `vite-plugin-pwa` is configured in `injectManifest` mode (NOT `generateSW`) with a custom service worker at `src/sw.ts`.
- `src/sw.ts` is excluded from `tsconfig.app.json` (WebWorker lib conflicts with DOM lib). It is compiled separately by `vite-plugin-pwa`'s `injectManifest` build.
- The `usePwa` composable (`src/composables/usePwa.ts`) uses `workbox-window` via dynamic import inside `onMounted` and only in `import.meta.env.PROD`. This avoids the `virtual:pwa-register/vue` virtual module which breaks SSR builds.

### Why injectManifest (not generateSW)
The browser Cache Storage API **only supports caching GET responses**. GraphQL uses POST requests. `generateSW`'s `runtimeCaching` silently ignores POST requests — responses are never stored. The custom `src/sw.ts` uses IndexedDB (IDB) as a bounded response store for POST GraphQL queries. Never use `generateSW` + `runtimeCaching` for GraphQL endpoints.

### GraphQL caching safety rules
- Every GraphQL request body must be parsed and checked with `isMutationOperation()` from `src/lib/graphqlSw.ts` **before any caching decision**.
- Mutations (`/^\s*mutation\b/i`) must ALWAYS be passed directly to the network. Never store mutation responses in IDB.
- Cache key: `url :: normalised-query :: JSON(variables)` — JWT tokens are in request headers, not the key, so they are never leaked into the cache.
- IDB store: `gql-network-cache` / object store `responses` with `cacheKey` (keyPath) and `timestamp` index.
- Max entries: 50. Max TTL: 1 hour. These limits prevent unbounded storage growth.

### Playwright E2E tests and service workers
**Critical**: Playwright's `page.route()` intercepts requests at the browser network level. Service workers make their own sub-requests via the Fetch API that **bypass `page.route()` mocks** — the SW's `fetch()` calls go to the real network, not the mock. This means:
1. The Playwright config sets `serviceWorkers: 'block'` globally so no SW installs during tests.
2. Do NOT write E2E tests that depend on a real SW being active — they will fail because the SW's internal fetches cannot see `page.route()` mocked responses.
3. To verify SW behaviour, write **unit tests** for the pure utility functions (`src/lib/graphqlSw.ts`) and **structural E2E tests** that verify the `sw.js` file is served and contains expected string literals (e.g. `gql-network-cache`, `SKIP_WAITING`).
4. When checking for identifiers in minified `sw.js`, only check **string literals** (e.g. database names, header names, regex patterns). Function and variable names are mangled by the minifier and will not match.

### Build commands
- Client (includes SW): `npm run build:client` — outputs `dist/sw.js` alongside the app bundle.
- SSR (no SW, no PWA plugin): `npm run build:ssr` — outputs `dist/server/`.
- Both builds must pass before merging a PWA-related PR.
