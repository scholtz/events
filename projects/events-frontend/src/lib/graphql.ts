const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'https://events-api.de-4.biatec.io/graphql'

export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

/** Metadata returned alongside GraphQL response data. */
export interface GqlResponseMeta {
  /** True when the response was served from the service-worker IDB cache rather than the network. */
  fromCache: boolean
}

/**
 * Lightweight GraphQL client that sends requests to the Events API.
 * Automatically attaches the JWT bearer token from localStorage when available.
 */
export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { data } = await gqlRequestWithMeta<T>(query, variables)
  return data
}

/**
 * Like `gqlRequest` but also returns response metadata such as whether the
 * response was served from the service-worker cache (`meta.fromCache`).
 * The service worker sets the `X-PWA-Cache: HIT` header on cached responses.
 */
export async function gqlRequestWithMeta<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data: T; meta: GqlResponseMeta }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  const fromCache = res.headers.get('X-PWA-Cache') === 'HIT'
  const json: GraphQLResponse<T> = await res.json()

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]!.message)
  }

  if (!json.data) {
    throw new Error('No data returned from GraphQL API')
  }

  return { data: json.data, meta: { fromCache } }
}
