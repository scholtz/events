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
import {
  openGqlDb,
  idbGet,
  idbPut,
  idbCount,
  GQL_MAX_ENTRIES,
  type GqlCacheEntry,
} from '@/lib/graphqlSw'
import { IDBFactory } from 'fake-indexeddb'

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

// ---------------------------------------------------------------------------
// IndexedDB helpers – openGqlDb / idbGet / idbPut / idbCount
// ---------------------------------------------------------------------------

/**
 * Creates a fresh, isolated FakeIDB instance for each test so tests cannot
 * accidentally share state through a real browser IDB.
 */
function makeFakeIdb(): IDBFactory {
  return new IDBFactory()
}

/** Helper: open a fresh test database. */
async function openTestDb(): Promise<{ db: IDBDatabase; fakeIdb: IDBFactory }> {
  const fakeIdb = makeFakeIdb()
  const db = await openGqlDb(fakeIdb)
  return { db, fakeIdb }
}

/** Helper: build a minimal cache entry with a controllable timestamp. */
function makeEntry(n: number, tsOffset = 0): GqlCacheEntry {
  return {
    cacheKey: `key-${n}`,
    body: `{"data":{"id":${n}}}`,
    timestamp: 1_000_000 + n * 1000 + tsOffset,
  }
}

describe('openGqlDb', () => {
  it('creates the object store on first open', async () => {
    const { db } = await openTestDb()
    expect(db.objectStoreNames.contains('responses')).toBe(true)
  })

  it('creates a timestamp index', async () => {
    const { db } = await openTestDb()
    const tx = db.transaction('responses', 'readonly')
    const store = tx.objectStore('responses')
    expect(store.indexNames.contains('timestamp')).toBe(true)
  })
})

describe('idbGet / idbPut – happy path', () => {
  it('returns undefined for a key that was never written', async () => {
    const { db } = await openTestDb()
    const result = await idbGet(db, 'nonexistent-key')
    expect(result).toBeUndefined()
  })

  it('returns the entry after a successful put', async () => {
    const { db } = await openTestDb()
    const entry = makeEntry(1)
    await idbPut(db, entry)
    const result = await idbGet(db, entry.cacheKey)
    expect(result).toEqual(entry)
  })

  it('overwrites an existing entry with the same cacheKey', async () => {
    const { db } = await openTestDb()
    const first = makeEntry(1)
    const updated = { ...first, body: '{"data":{"updated":true}}', timestamp: first.timestamp + 5000 }
    await idbPut(db, first)
    await idbPut(db, updated)
    const result = await idbGet(db, first.cacheKey)
    expect(result?.body).toBe(updated.body)
    expect(result?.timestamp).toBe(updated.timestamp)
  })
})

describe('idbCount', () => {
  it('returns 0 for an empty store', async () => {
    const { db } = await openTestDb()
    expect(await idbCount(db)).toBe(0)
  })

  it('returns the correct count after multiple puts', async () => {
    const { db } = await openTestDb()
    await idbPut(db, makeEntry(1))
    await idbPut(db, makeEntry(2))
    await idbPut(db, makeEntry(3))
    expect(await idbCount(db)).toBe(3)
  })
})

describe('idbPut – bounded-storage pruning', () => {
  it('does not prune when count is exactly at the cap', async () => {
    const { db } = await openTestDb()
    const cap = 5
    for (let i = 1; i <= cap; i++) {
      await idbPut(db, makeEntry(i), cap)
    }
    expect(await idbCount(db)).toBe(cap)
  })

  it('prunes the single oldest entry when one over the cap', async () => {
    const { db } = await openTestDb()
    const cap = 3
    // Fill to cap
    await idbPut(db, makeEntry(1), cap) // oldest  (ts: 1_001_000)
    await idbPut(db, makeEntry(2), cap) // middle  (ts: 1_002_000)
    await idbPut(db, makeEntry(3), cap) // newest  (ts: 1_003_000)
    // Add one more – should push out entry 1 (oldest)
    await idbPut(db, makeEntry(4), cap)
    expect(await idbCount(db)).toBe(cap)
    expect(await idbGet(db, 'key-1')).toBeUndefined()
    expect(await idbGet(db, 'key-4')).toBeDefined()
  })

  it('prunes all excess entries when multiple over the cap (not just one)', async () => {
    // This is the core regression test for the original bug where the pruning
    // loop only deleted a single entry even when many were over the cap.
    const { db } = await openTestDb()
    const cap = 3
    // Insert 10 entries into a cap-3 store in a single transaction each
    for (let i = 1; i <= 10; i++) {
      await idbPut(db, makeEntry(i), cap)
    }
    // Must be at or below cap, never above
    const finalCount = await idbCount(db)
    expect(finalCount).toBeLessThanOrEqual(cap)
  })

  it('retains the NEWEST entries, not the oldest, after pruning', async () => {
    const { db } = await openTestDb()
    const cap = 2
    // Insert 4 entries; oldest first
    for (let i = 1; i <= 4; i++) {
      await idbPut(db, makeEntry(i), cap)
    }
    // After pruning entries 1 and 2, only 3 and 4 should remain
    expect(await idbCount(db)).toBeLessThanOrEqual(cap)
    expect(await idbGet(db, 'key-1')).toBeUndefined()
    expect(await idbGet(db, 'key-2')).toBeUndefined()
    expect(await idbGet(db, 'key-3')).toBeDefined()
    expect(await idbGet(db, 'key-4')).toBeDefined()
  })

  it('handles pruning when cap is 1', async () => {
    const { db } = await openTestDb()
    const cap = 1
    await idbPut(db, makeEntry(1), cap)
    await idbPut(db, makeEntry(2), cap)
    await idbPut(db, makeEntry(3), cap)
    expect(await idbCount(db)).toBe(1)
    // Only the newest should survive
    expect(await idbGet(db, 'key-3')).toBeDefined()
  })

  it('GQL_MAX_ENTRIES default cap is 50', () => {
    // The default cap is a product constant — changes to it are a breaking
    // product decision and should be a deliberate edit, not an accident.
    expect(GQL_MAX_ENTRIES).toBe(50)
  })

  it('stays bounded after 60 sequential writes with the default cap', async () => {
    const { db } = await openTestDb()
    for (let i = 1; i <= 60; i++) {
      await idbPut(db, makeEntry(i))
    }
    expect(await idbCount(db)).toBeLessThanOrEqual(GQL_MAX_ENTRIES)
  })
})
