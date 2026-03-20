import { computed } from 'vue'
import { useDomainsStore } from '@/stores/domains'

/**
 * Subdomain routing assumptions
 * ─────────────────────────────
 * Deployment: the frontend is served at `events.biatec.io` (3 hostname parts)
 * and also at `{category}.events.biatec.io` (4 hostname parts).
 *
 * Detection logic: any hostname with more than 3 dot-separated segments is
 * treated as a category subdomain, where the first segment is the subdomain
 * identifier.  This means the module supports exactly one level of subdomain
 * prefix before the base domain (e.g. `tech.events.biatec.io`, not
 * `a.b.events.biatec.io`).
 *
 * Supported hostnames:
 *   events.biatec.io         → base site, no subdomain
 *   tech.events.biatec.io    → subdomain "tech"
 *   crypto.events.biatec.io  → subdomain "crypto"
 *   localhost                 → development, no subdomain
 *   127.0.0.1                → development, no subdomain
 *
 * The subdomain value is matched against `EventDomain.subdomain` from the
 * domains store.  If no matching domain is found the page renders the default
 * home view (with hero section).
 */

/**
 * Extracts the subdomain prefix from the current hostname.
 * Returns `null` for the base domain, localhost, and IP addresses.
 */
function extractSubdomain(): string | null {
  if (typeof window === 'undefined') return null
  const hostname = window.location.hostname

  // localhost or IP: no subdomain
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null
  }

  // Base domain has 3 parts (events.biatec.io); 4+ means a category subdomain
  const parts = hostname.split('.')
  if (parts.length <= 3) return null

  return parts[0] ?? null
}

/**
 * Builds a full URL targeting a category subdomain.
 * On localhost returns `/?domain=slug` for in-app navigation.
 * On production returns `https://{subdomain}.events.biatec.io/`.
 */
export function buildSubdomainUrl(subdomain: string, slug: string): string {
  if (typeof window === 'undefined') return '/'
  const hostname = window.location.hostname

  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `/?domain=${slug}`
  }

  const parts = hostname.split('.')
  const baseParts = parts.length > 3 ? parts.slice(1) : parts
  const baseDomain = baseParts.join('.')
  const protocol = window.location.protocol
  return `${protocol}//${subdomain}.${baseDomain}/`
}

export function useSubdomain() {
  const domainsStore = useDomainsStore()

  const subdomain = extractSubdomain()

  const activeDomain = computed(() => {
    if (!subdomain) return null
    return domainsStore.domains.find((d) => d.subdomain === subdomain) ?? null
  })

  const isSubdomainView = computed(() => activeDomain.value !== null)

  return {
    subdomain,
    activeDomain,
    isSubdomainView,
  }
}
