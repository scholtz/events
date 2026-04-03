/**
 * Unit tests for src/lib/graphql.ts
 *
 * These tests verify:
 *
 *  gqlRequestWithMeta
 *    - Returns `fromCache: false` for normal live network responses
 *    - Returns `fromCache: true` when the service-worker sets the `X-PWA-Cache: HIT` header
 *    - Returns `fromCache: false` for any other X-PWA-Cache value (e.g. "MISS")
 *    - Throws on GraphQL errors
 *    - Throws when the response has no `data` field
 *    - Attaches the Authorization header when `auth_token` is in localStorage
 *    - Sends variables as part of the request body
 *
 *  gqlRequest (convenience wrapper)
 *    - Returns only the `data` field (strips metadata)
 *
 * Note: tests run in the Node environment (see vite.config.ts `test.environment`).
 * `localStorage` and `fetch` are stubbed globally per-test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fetch mock that resolves with the given body and optional extra headers. */
function mockFetch(
  body: unknown,
  extraHeaders: Record<string, string> = {},
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
    }),
  )
}

/** Minimal localStorage stub sufficient for graphql.ts (which only reads `auth_token`). */
function makeLocalStorage(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Start each test with empty localStorage (no auth token).
  vi.stubGlobal('localStorage', makeLocalStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// gqlRequestWithMeta
// ---------------------------------------------------------------------------

describe('gqlRequestWithMeta', () => {
  it('returns fromCache: false for a normal live network response (no X-PWA-Cache header)', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { hello: 'world' } }))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    const result = await gqlRequestWithMeta('query { hello }')

    expect(result.meta.fromCache).toBe(false)
    expect(result.data).toEqual({ hello: 'world' })
  })

  it('returns fromCache: true when service worker sets X-PWA-Cache: HIT header', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { events: [] } }, { 'X-PWA-Cache': 'HIT' }))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    const result = await gqlRequestWithMeta('query { events { id } }')

    expect(result.meta.fromCache).toBe(true)
  })

  it('returns fromCache: false when X-PWA-Cache header value is MISS (not HIT)', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { events: [] } }, { 'X-PWA-Cache': 'MISS' }))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    const result = await gqlRequestWithMeta('query { events { id } }')

    expect(result.meta.fromCache).toBe(false)
  })

  it('returns fromCache: false when X-PWA-Cache header is absent', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { events: [] } }))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    const result = await gqlRequestWithMeta('query { events { id } }')

    expect(result.meta.fromCache).toBe(false)
  })

  it('throws the first GraphQL error message when errors array is present', async () => {
    vi.stubGlobal('fetch', mockFetch({ errors: [{ message: 'Not authorised' }] }))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await expect(gqlRequestWithMeta('query { me { id } }')).rejects.toThrow('Not authorised')
  })

  it('throws "No data returned" when the response has no data field', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await expect(gqlRequestWithMeta('query { hello }')).rejects.toThrow(
      'No data returned from GraphQL API',
    )
  })

  it('attaches Authorization header when auth_token is present in localStorage', async () => {
    vi.stubGlobal('localStorage', makeLocalStorage({ auth_token: 'test-jwt-abc' }))
    const spy = mockFetch({ data: { me: { id: '1' } } })
    vi.stubGlobal('fetch', spy)
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await gqlRequestWithMeta('query { me { id } }')

    const calledHeaders: Record<string, string> = spy.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBe('Bearer test-jwt-abc')
  })

  it('does not attach Authorization header when no auth_token in localStorage', async () => {
    const spy = mockFetch({ data: { events: [] } })
    vi.stubGlobal('fetch', spy)
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await gqlRequestWithMeta('query { events { id } }')

    const calledHeaders: Record<string, string> = spy.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBeUndefined()
  })

  it('includes variables in the request body', async () => {
    const spy = mockFetch({ data: { eventBySlug: null } })
    vi.stubGlobal('fetch', spy)
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await gqlRequestWithMeta(
      'query EventBySlug($slug: String!) { eventBySlug(slug: $slug) { id } }',
      { slug: 'test-event' },
    )

    const calledBody = JSON.parse(spy.mock.calls[0][1].body as string)
    expect(calledBody.variables).toEqual({ slug: 'test-event' })
    expect(calledBody.query).toContain('EventBySlug')
  })

  it('sends a POST request with Content-Type: application/json', async () => {
    const spy = mockFetch({ data: {} })
    vi.stubGlobal('fetch', spy)
    const { gqlRequestWithMeta } = await import('@/lib/graphql')

    await gqlRequestWithMeta('query { hello }')

    expect(spy.mock.calls[0][1].method).toBe('POST')
    expect(spy.mock.calls[0][1].headers['Content-Type']).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// gqlRequest (convenience wrapper)
// ---------------------------------------------------------------------------

describe('gqlRequest', () => {
  it('returns only the data field (strips meta wrapper)', async () => {
    vi.stubGlobal('fetch', mockFetch({ data: { hello: 'world' } }))
    const { gqlRequest } = await import('@/lib/graphql')

    const data = await gqlRequest<{ hello: string }>('query { hello }')

    expect(data).toEqual({ hello: 'world' })
    // Ensure the meta object is not part of the return value
    expect((data as unknown as { meta?: unknown }).meta).toBeUndefined()
  })

  it('propagates errors from the underlying fetch', async () => {
    vi.stubGlobal('fetch', mockFetch({ errors: [{ message: 'Boom' }] }))
    const { gqlRequest } = await import('@/lib/graphql')

    await expect(gqlRequest('query { hello }')).rejects.toThrow('Boom')
  })
})
