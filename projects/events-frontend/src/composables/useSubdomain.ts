import { computed } from 'vue'
import { useDomainsStore } from '@/stores/domains'

/**
 * Extracts the subdomain prefix from the current hostname.
 * For example, `tech.events.biatec.io` returns `tech`,
 * while `events.biatec.io` or `localhost` returns `null`.
 */
function extractSubdomain(): string | null {
  if (typeof window === 'undefined') return null
  const hostname = window.location.hostname

  // localhost or IP: no subdomain
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null
  }

  // Expected pattern: {subdomain}.events.biatec.io
  // The base domain has 3 parts: events.biatec.io
  const parts = hostname.split('.')
  if (parts.length <= 3) return null

  // The first part is the subdomain
  return parts[0] ?? null
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
