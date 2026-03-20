/**
 * Unit tests for src/lib/graphqlSw.ts utilities.
 *
 * These functions are the foundation of the service-worker GraphQL caching
 * strategy.  The tests verify:
 *
 *  isMutationOperation
 *    - Correctly identifies mutation operations (must not be cached)
 *    - Correctly passes queries and subscriptions (safe to cache)
 *    - Handles edge cases: empty string, null-ish values, leading whitespace
 *
 *  makeGraphQlCacheKey
 *    - Produces deterministic output for identical inputs
 *    - Different queries produce different keys
 *    - Different variables produce different keys
 *    - Different URLs produce different keys
 *    - Handles empty/missing variables
 *    - Normalises whitespace in the query so formatting differences don't
 *      create spurious cache misses
 */

import { describe, expect, it } from 'vitest'
import { isMutationOperation, makeGraphQlCacheKey } from '@/lib/graphqlSw'

// ---------------------------------------------------------------------------
// isMutationOperation
// ---------------------------------------------------------------------------

describe('isMutationOperation', () => {
  // ── True (mutation – must NOT be cached) ──────────────────────────────────

  it('returns true for a simple anonymous mutation', () => {
    expect(isMutationOperation('mutation { login(email: "a", password: "b") { token } }')).toBe(
      true,
    )
  })

  it('returns true for a named mutation', () => {
    expect(isMutationOperation('mutation Login { login(email: "x", password: "y") { token } }')).toBe(
      true,
    )
  })

  it('returns true for a mutation with leading whitespace', () => {
    expect(isMutationOperation('   mutation SubmitEvent { submitEvent { id } }')).toBe(true)
  })

  it('returns true for a mutation with a newline before the keyword', () => {
    expect(isMutationOperation('\n  mutation ReviewEvent($id: ID!) { reviewEvent(id: $id) { id } }')).toBe(
      true,
    )
  })

  it('returns true for "mutation" keyword at the very start', () => {
    expect(isMutationOperation('mutation{login{token}}')).toBe(true)
  })

  it('returns true for mixed-case "MUTATION" keyword', () => {
    expect(isMutationOperation('MUTATION { login { token } }')).toBe(true)
  })

  it('returns true for mixed-case "Mutation" keyword', () => {
    expect(isMutationOperation('Mutation Login { login { token } }')).toBe(true)
  })

  // ── False (query / subscription – safe to cache) ──────────────────────────

  it('returns false for a simple query', () => {
    expect(
      isMutationOperation('query { events { id name } }'),
    ).toBe(false)
  })

  it('returns false for a named query', () => {
    expect(
      isMutationOperation('query Events($filter: EventFilterInput) { events(filter: $filter) { id name } }'),
    ).toBe(false)
  })

  it('returns false for an anonymous query (no keyword)', () => {
    expect(isMutationOperation('{ events { id name } }')).toBe(false)
  })

  it('returns false for a subscription', () => {
    expect(isMutationOperation('subscription OnEvent { eventAdded { id } }')).toBe(false)
  })

  it('returns false for an introspection query', () => {
    expect(isMutationOperation('query { __schema { types { name } } }')).toBe(false)
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns false for an empty string', () => {
    expect(isMutationOperation('')).toBe(false)
  })

  it('returns false for a string that only mentions mutation as a field name', () => {
    // "mutation" appears in the body but is not the operation keyword
    expect(isMutationOperation('query { mutation { id } }')).toBe(false)
  })

  it('returns false for a query that has the word "mutation" in a comment', () => {
    // Leading comment, then a query
    expect(isMutationOperation('# mutation\nquery { events { id } }')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// makeGraphQlCacheKey
// ---------------------------------------------------------------------------

const BASE_URL = 'https://events-api.de-4.biatec.io/graphql'
const EVENTS_QUERY = 'query Events($filter: EventFilterInput) { events(filter: $filter) { id name } }'
const VARIABLES = { filter: { domainSlug: 'tech' } }

describe('makeGraphQlCacheKey', () => {
  it('returns a non-empty string', () => {
    const key = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, VARIABLES)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('is deterministic: same inputs produce the same key', () => {
    const key1 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, VARIABLES)
    const key2 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, VARIABLES)
    expect(key1).toBe(key2)
  })

  it('produces different keys for different queries', () => {
    const key1 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, VARIABLES)
    const key2 = makeGraphQlCacheKey(BASE_URL, 'query { domains { id } }', VARIABLES)
    expect(key1).not.toBe(key2)
  })

  it('produces different keys for different variables', () => {
    const key1 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, { filter: { domainSlug: 'tech' } })
    const key2 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, { filter: { domainSlug: 'sports' } })
    expect(key1).not.toBe(key2)
  })

  it('produces different keys for different URLs', () => {
    const key1 = makeGraphQlCacheKey('http://localhost:4000/graphql', EVENTS_QUERY, VARIABLES)
    const key2 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, VARIABLES)
    expect(key1).not.toBe(key2)
  })

  it('treats null/undefined variables the same as an empty object', () => {
    const key1 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, undefined)
    const key2 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, null)
    const key3 = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, {})
    expect(key1).toBe(key2)
    expect(key1).toBe(key3)
  })

  it('normalises consecutive whitespace so multiple spaces/newlines produce the same key', () => {
    // These three queries are identical except for consecutive whitespace
    const singleSpace = makeGraphQlCacheKey(BASE_URL, 'query { events { id name } }', {})
    const doubleSpace = makeGraphQlCacheKey(BASE_URL, 'query  {  events  {  id  name  }  }', {})
    const withNewlines = makeGraphQlCacheKey(
      BASE_URL,
      'query  {\n  events  {\n    id  name\n  }\n}',
      {},
    )
    // All three normalise to the same key
    expect(singleSpace).toBe(doubleSpace)
    expect(singleSpace).toBe(withNewlines)
  })

  it('includes the URL in the key so different endpoints never share cache entries', () => {
    const key = makeGraphQlCacheKey(BASE_URL, EVENTS_QUERY, {})
    expect(key).toContain(BASE_URL)
  })
})
