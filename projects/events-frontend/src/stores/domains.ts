import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { EventDomain } from '@/types'

export const useDomainsStore = defineStore('domains', () => {
  const domains = ref<EventDomain[]>([])
  const loading = ref(false)

  async function fetchDomains() {
    loading.value = true
    try {
      const data = await gqlRequest<{ domains: EventDomain[] }>(
        `query Domains {
          domains { id name slug subdomain description isActive createdAtUtc }
        }`,
      )
      domains.value = data.domains
    } finally {
      loading.value = false
    }
  }

  function getDomainBySlug(slug: string): EventDomain | undefined {
    return domains.value.find((d) => d.slug === slug)
  }

  async function upsertDomain(input: {
    id?: string
    name: string
    slug: string
    subdomain: string
    description?: string
    isActive?: boolean
  }) {
    const data = await gqlRequest<{ upsertDomain: EventDomain }>(
      `mutation UpsertDomain($input: DomainInput!) {
        upsertDomain(input: $input) {
          id name slug subdomain description isActive createdAtUtc
        }
      }`,
      { input },
    )
    const idx = domains.value.findIndex((d) => d.id === data.upsertDomain.id)
    if (idx >= 0) {
      domains.value[idx] = data.upsertDomain
    } else {
      domains.value.push(data.upsertDomain)
    }
    return data.upsertDomain
  }

  return { domains, loading, fetchDomains, getDomainBySlug, upsertDomain }
})
