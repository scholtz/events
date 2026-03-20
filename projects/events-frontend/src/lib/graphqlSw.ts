/**
 * Utilities shared between the service worker (src/sw.ts) and unit tests.
 *
 * These functions are pure (no browser APIs) so they can be imported and
 * tested in any environment.
 */

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
