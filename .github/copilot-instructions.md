# Copilot instructions for `scholtz/events`

## Repository structure
- Root repository currently contains the frontend app at `projects/events-frontend`.
- Main frontend source files are in `projects/events-frontend/src`.

## Technology and conventions
- Frontend uses Vue 3 + TypeScript + Vite.
- Follow existing formatting conventions from `projects/events-frontend/.prettierrc.json`:
  - `semi: false`
  - `singleQuote: true`
  - `printWidth: 100`
- Keep changes minimal and scoped to the issue being solved.

## Validate changes
- Run commands from `projects/events-frontend`:
  - `npm run lint`
  - `npm run build`
- E2E tests use Playwright via `npm run test:e2e` (requires Playwright browsers to be installed).
