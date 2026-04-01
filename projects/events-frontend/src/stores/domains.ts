import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { DomainAdministrator, DomainLink, EventDomain, ScheduledFeaturedEvent } from '@/types'

const DOMAIN_FIELDS = `id name slug subdomain description isActive createdAtUtc
  createdByUserId primaryColor accentColor logoUrl bannerUrl
  tagline overviewContent whatBelongsHere submitEventCta curatorCredit
  links { id domainId title url displayOrder createdAtUtc }`

export const useDomainsStore = defineStore('domains', () => {
  const domains = ref<EventDomain[]>([])
  const loading = ref(false)
  const myManagedDomains = ref<EventDomain[]>([])
  const myManagedDomainsLoading = ref(false)

  async function fetchDomains() {
    loading.value = true
    try {
      const data = await gqlRequest<{ domains: EventDomain[] }>(
        `query Domains {
          domains { ${DOMAIN_FIELDS} }
        }`,
      )
      domains.value = data.domains
    } finally {
      loading.value = false
    }
  }

  async function fetchMyManagedDomains() {
    myManagedDomainsLoading.value = true
    try {
      const data = await gqlRequest<{ myManagedDomains: EventDomain[] }>(
        `query MyManagedDomains {
          myManagedDomains { ${DOMAIN_FIELDS} }
        }`,
      )
      myManagedDomains.value = data.myManagedDomains
    } catch {
      myManagedDomains.value = []
    } finally {
      myManagedDomainsLoading.value = false
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
        upsertDomain(input: $input) { ${DOMAIN_FIELDS} }
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

  async function fetchDomainAdministrators(
    domainId: string,
  ): Promise<DomainAdministrator[]> {
    const data = await gqlRequest<{ domainAdministrators: DomainAdministrator[] }>(
      `query DomainAdmins($domainId: UUID!) {
        domainAdministrators(domainId: $domainId) {
          id domainId userId
          user { displayName email }
          createdAtUtc
        }
      }`,
      { domainId },
    )
    return data.domainAdministrators
  }

  async function addDomainAdministrator(domainId: string, userId: string) {
    const data = await gqlRequest<{ addDomainAdministrator: DomainAdministrator }>(
      `mutation AddDomainAdmin($input: DomainAdministratorInput!) {
        addDomainAdministrator(input: $input) {
          id domainId userId
          user { displayName email }
          createdAtUtc
        }
      }`,
      { input: { domainId, userId } },
    )
    return data.addDomainAdministrator
  }

  async function removeDomainAdministrator(domainId: string, userId: string) {
    await gqlRequest<{ removeDomainAdministrator: boolean }>(
      `mutation RemoveDomainAdmin($input: DomainAdministratorInput!) {
        removeDomainAdministrator(input: $input)
      }`,
      { input: { domainId, userId } },
    )
  }

  async function updateDomainStyle(input: {
    domainId: string
    primaryColor?: string | null
    accentColor?: string | null
    logoUrl?: string | null
    bannerUrl?: string | null
  }) {
    const data = await gqlRequest<{ updateDomainStyle: EventDomain }>(
      `mutation UpdateDomainStyle($input: UpdateDomainStyleInput!) {
        updateDomainStyle(input: $input) { ${DOMAIN_FIELDS} }
      }`,
      { input },
    )
    const idx = domains.value.findIndex((d) => d.id === data.updateDomainStyle.id)
    if (idx >= 0) {
      domains.value[idx] = data.updateDomainStyle
    }
    // Also update myManagedDomains if present there
    const mIdx = myManagedDomains.value.findIndex((d) => d.id === data.updateDomainStyle.id)
    if (mIdx >= 0) {
      myManagedDomains.value[mIdx] = data.updateDomainStyle
    }
    return data.updateDomainStyle
  }

  async function updateDomainOverview(input: {
    domainId: string
    tagline?: string | null
    overviewContent?: string | null
    whatBelongsHere?: string | null
    submitEventCta?: string | null
    curatorCredit?: string | null
  }) {
    const data = await gqlRequest<{ updateDomainOverview: EventDomain }>(
      `mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
        updateDomainOverview(input: $input) { ${DOMAIN_FIELDS} }
      }`,
      { input },
    )
    const idx = domains.value.findIndex((d) => d.id === data.updateDomainOverview.id)
    if (idx >= 0) {
      domains.value[idx] = data.updateDomainOverview
    }
    // Also update myManagedDomains if present there
    const mIdx = myManagedDomains.value.findIndex((d) => d.id === data.updateDomainOverview.id)
    if (mIdx >= 0) {
      myManagedDomains.value[mIdx] = data.updateDomainOverview
    }
    return data.updateDomainOverview
  }

  async function setDomainFeaturedEvents(domainId: string, eventIds: string[]) {
    await gqlRequest<{ setDomainFeaturedEvents: { id: string }[] }>(
      `mutation SetDomainFeaturedEvents($input: SetDomainFeaturedEventsInput!) {
        setDomainFeaturedEvents(input: $input) { id }
      }`,
      { input: { domainId, eventIds } },
    )
  }

  async function setDomainLinks(
    domainId: string,
    links: { title: string; url: string }[],
  ): Promise<DomainLink[]> {
    const data = await gqlRequest<{ setDomainLinks: DomainLink[] }>(
      `mutation SetDomainLinks($input: SetDomainLinksInput!) {
        setDomainLinks(input: $input) {
          id domainId title url displayOrder createdAtUtc
        }
      }`,
      { input: { domainId, links } },
    )
    const applyLinks = (domain: EventDomain) =>
      domain.id === domainId ? { ...domain, links: data.setDomainLinks } : domain

    domains.value = domains.value.map(applyLinks)
    myManagedDomains.value = myManagedDomains.value.map(applyLinks)
    return data.setDomainLinks
  }

  const SCHEDULED_FEATURED_EVENT_FIELDS = `
    id domainId eventId startsAtUtc endsAtUtc priority createdAtUtc createdByUserId
    event { id name slug status startsAtUtc domain { id name slug } }
  `

  async function fetchScheduledFeaturedEvents(domainId: string): Promise<ScheduledFeaturedEvent[]> {
    const data = await gqlRequest<{ scheduledFeaturedEvents: ScheduledFeaturedEvent[] }>(
      `query GetScheduledFeaturedEvents($domainId: UUID!) {
        scheduledFeaturedEvents(domainId: $domainId) { ${SCHEDULED_FEATURED_EVENT_FIELDS} }
      }`,
      { domainId },
    )
    return data.scheduledFeaturedEvents
  }

  async function scheduleFeaturedEvent(
    domainId: string,
    eventId: string,
    startsAtUtc: string,
    endsAtUtc: string,
    priority: number,
  ): Promise<ScheduledFeaturedEvent> {
    const data = await gqlRequest<{ scheduleFeaturedEvent: ScheduledFeaturedEvent }>(
      `mutation ScheduleFeaturedEvent($input: ScheduleFeaturedEventInput!) {
        scheduleFeaturedEvent(input: $input) { ${SCHEDULED_FEATURED_EVENT_FIELDS} }
      }`,
      { input: { domainId, eventId, startsAtUtc, endsAtUtc, priority } },
    )
    return data.scheduleFeaturedEvent
  }

  async function updateScheduledFeaturedEvent(
    scheduleId: string,
    startsAtUtc: string,
    endsAtUtc: string,
    priority: number,
  ): Promise<ScheduledFeaturedEvent> {
    const data = await gqlRequest<{ updateScheduledFeaturedEvent: ScheduledFeaturedEvent }>(
      `mutation UpdateScheduledFeaturedEvent($input: UpdateScheduledFeaturedEventInput!) {
        updateScheduledFeaturedEvent(input: $input) { ${SCHEDULED_FEATURED_EVENT_FIELDS} }
      }`,
      { input: { scheduleId, startsAtUtc, endsAtUtc, priority } },
    )
    return data.updateScheduledFeaturedEvent
  }

  async function removeScheduledFeaturedEvent(scheduleId: string): Promise<void> {
    await gqlRequest<{ removeScheduledFeaturedEvent: boolean }>(
      `mutation RemoveScheduledFeaturedEvent($scheduleId: UUID!) {
        removeScheduledFeaturedEvent(scheduleId: $scheduleId)
      }`,
      { scheduleId },
    )
  }

  return {
    domains,
    loading,
    myManagedDomains,
    myManagedDomainsLoading,
    fetchDomains,
    fetchMyManagedDomains,
    getDomainBySlug,
    upsertDomain,
    fetchDomainAdministrators,
    addDomainAdministrator,
    removeDomainAdministrator,
    updateDomainStyle,
    updateDomainOverview,
    setDomainFeaturedEvents,
    setDomainLinks,
    fetchScheduledFeaturedEvents,
    scheduleFeaturedEvent,
    updateScheduledFeaturedEvent,
    removeScheduledFeaturedEvent,
  }
})
