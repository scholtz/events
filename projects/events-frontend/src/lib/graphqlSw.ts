/**
 * Utilities shared between the service worker (src/sw.ts) and unit tests.
 *
 * These functions are pure (no browser APIs) so they can be imported and
 * tested in any environment.
 *
 * Additionally, this module exports the IndexedDB helper functions used by
 * the service worker's GraphQL response cache.  Keeping them here (rather
 * than inside the opaque SW bundle) makes them importable by Vitest so the
 * bounded-storage and overflow pruning behaviour can be tested without
 * needing a real browser environment.
 */

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

/**
 * Returns true when the GraphQL query string represents a mutation.
 *
 * Mutations MUST NOT be cached because they have server-side side effects.
 * We use a conservative heuristic: if the trimmed query starts with the
 * keyword "mutation" (case-insensitive), treat it as a mutation.  This
 * correctly handles:
 *   - `mutation Login { ... }`
 *   - `mutation { login(...) { ... } }`
 *   - Leading whitespace
 *
 * False positives (treating a query as a mutation) just mean "don't cache" —
 * the safe direction to err.  False negatives (treating a mutation as a
 * query) would cache a write operation, which is the dangerous direction and
 * should never happen with this check.
 */
export function isMutationOperation(query: string): boolean {
  if (!query || typeof query !== 'string') return false
  return /^\s*mutation\b/i.test(query)
}

/**
 * Builds a stable, deterministic IDB cache key for a GraphQL request.
 *
 * The key encodes the endpoint URL, the query string (normalised by
 * collapsing whitespace), and the serialised variables so that different
 * queries or variable sets always produce different keys while the same
 * logical request always hits the same entry.
 */
export function makeGraphQlCacheKey(
  url: string,
  query: string,
  variables: unknown,
): string {
  // Normalise the query (collapse whitespace) to improve cache-hit ratio when
  // the same query is sent with different formatting.
  const normalisedQuery = query.replace(/\s+/g, ' ').trim()
  return `${url}::${normalisedQuery}::${JSON.stringify(variables ?? {})}`
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
//
// These are exported so that unit tests can import them directly and exercise
// them against a fake IDB implementation (fake-indexeddb) without needing a
// real browser or service worker environment.
// ---------------------------------------------------------------------------

/** Shape of a single cached GraphQL response entry in IDB. */
export interface GqlCacheEntry {
  cacheKey: string
  body: string
  timestamp: number
}

export const GQL_DB_NAME = 'gql-network-cache'
export const GQL_STORE = 'responses'
export const GQL_MAX_ENTRIES = 50
export const GQL_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

/**
 * Opens (or creates) the GraphQL response cache database.
 *
 * @param idb  The IDBFactory to use.  Defaults to the `indexedDB` global so
 *             callers in a normal browser/SW context do not need to pass it.
 *             Pass a fake IDB instance from `fake-indexeddb` in tests.
 */
export function openGqlDb(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(GQL_DB_NAME, 1)
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(GQL_STORE)) {
        const store = db.createObjectStore(GQL_STORE, { keyPath: 'cacheKey' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Retrieves a single cached entry by its cache key. */
export function idbGet(db: IDBDatabase, key: string): Promise<GqlCacheEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GQL_STORE, 'readonly')
    const req = tx.objectStore(GQL_STORE).get(key)
    req.onsuccess = () => resolve(req.result as GqlCacheEntry | undefined)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Stores a cached response and prunes the oldest entries when the store
 * exceeds `maxEntries`.
 *
 * The pruning step deletes exactly `count - maxEntries` oldest records
 * (ordered by `timestamp` ascending) using a cursor loop so the store is
 * always brought back to within the cap — not merely reduced by one.
 *
 * @param db         Open IDBDatabase handle.
 * @param entry      The cache entry to write.
 * @param maxEntries Maximum number of entries to retain (defaults to GQL_MAX_ENTRIES).
 */
export function idbPut(
  db: IDBDatabase,
  entry: GqlCacheEntry,
  maxEntries: number = GQL_MAX_ENTRIES,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GQL_STORE, 'readwrite')
    const store = tx.objectStore(GQL_STORE)
    store.put(entry)

    // Prune oldest entries so the store stays within the cap.
    // We calculate exactly how many records to remove and advance the cursor
    // that many times — each iteration deletes one entry then calls
    // cursor.continue() to move to the next oldest.
    const countReq = store.count()
    countReq.onsuccess = () => {
      const toDelete = countReq.result - maxEntries
      if (toDelete > 0) {
        let deleted = 0
        const idxReq = store.index('timestamp').openCursor(null, 'next')
        idxReq.onsuccess = () => {
          const cursor = idxReq.result
          if (cursor && deleted < toDelete) {
            cursor.delete()
            deleted++
            cursor.continue()
          }
        }
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Returns the total number of entries currently in the cache. */
export function idbCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GQL_STORE, 'readonly')
    const req = tx.objectStore(GQL_STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
