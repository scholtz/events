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


- Run commands from `projects/events-frontend`:
  - `npm run lint`
  - `npm run build`
- E2E tests use Playwright via `npm run test:e2e` (requires Playwright browsers to be installed).
- Run backend validation from `projects/EventsApi` when backend files or frontend GraphQL integrations change:
  - `dotnet build events.slnx`
  - `dotnet test events.slnx`

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
