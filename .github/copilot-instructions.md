# Copilot instructions for `scholtz/events`

## Repository structure
- Root repository currently contains the frontend app at `projects/events-frontend`.
- Main frontend source files are in `projects/events-frontend/src`.
- Views (page-level components) are in `src/views/`.
- Reusable components are in `src/components/`, organized by feature (e.g., `layout/`, `events/`).
- TypeScript type definitions are in `src/types/`.
- Pinia stores are in `src/stores/`.
- Global CSS styles and design tokens are in `src/assets/styles/main.css`.
- Vue Router configuration is in `src/router/index.ts`.

## Technology and conventions
- Frontend uses Vue 3 + TypeScript + Vite.
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

## Validate changes
- Run commands from `projects/events-frontend`:
  - `npm run lint`
  - `npm run build`
- E2E tests use Playwright via `npm run test:e2e` (requires Playwright browsers to be installed).

## Playwright E2E testing

### Structure
- Tests live in `projects/events-frontend/e2e/`.
- Shared API mock helpers are in `e2e/helpers/mock-api.ts`.
- Focus tests on one area per file: `home.spec.ts`, `auth.spec.ts`, `events.spec.ts`, `vue.spec.ts` (full flow).

### Always use the shared mock helper
All tests must set up API mocks **before** calling `page.goto()`. Use `setupMockApi(page, initialState)` from `./helpers/mock-api` to intercept all Supabase auth/rest requests. This keeps tests deterministic and independent of a live backend.

```ts
import { setupMockApi, makeTechCategory, makeApprovedEvent } from './helpers/mock-api'

test('shows events', async ({ page }) => {
  setupMockApi(page, {
    categories: [makeTechCategory()],
    events: [makeApprovedEvent({ title: 'My Event' })],
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
- Do not share mutable state between tests; rely on the helper factories (`makeAdminUser`, `makeTechCategory`, `makeApprovedEvent`).
- Use `test.describe` blocks to group related tests by page or feature.

### CI
- Playwright tests run automatically on every push and PR via `.github/workflows/playwright.yml`.
- Only Chromium is used in CI to keep pipeline fast. Run all browsers locally if needed.
- The CI workflow builds the client first (with placeholder Supabase credentials) then runs `npm run test:e2e`.
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
```
