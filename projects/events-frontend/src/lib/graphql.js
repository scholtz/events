const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'https://events-api.de-4.biatec.io/graphql';
/**
 * Lightweight GraphQL client that sends requests to the Events API.
 * Automatically attaches the JWT bearer token from localStorage when available.
 */
export async function gqlRequest(query, variables) {
    const headers = {
        'Content-Type': 'application/json',
    };
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0].message);
    }
    if (!json.data) {
        throw new Error('No data returned from GraphQL API');
    }
    return json.data;
}
