import { computed, ref } from 'vue'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type {
  CatalogEvent,
  EventFilters,
  EventPriceFilter,
  EventSortOption,
  SavedSearch,
} from '@/types'

const EVENT_FIELDS = `
  id name slug description eventUrl
  venueName addressLine1 city countryCode
  latitude longitude startsAtUtc endsAtUtc
  submittedAtUtc updatedAtUtc publishedAtUtc
  adminNotes status isFree priceAmount currencyCode domainId mapUrl
  domain { id name slug }
  submittedBy { displayName }
`

const DEFAULT_SORT: EventSortOption = 'UPCOMING'
const DEFAULT_PRICE_TYPE: EventPriceFilter = 'ALL'

export function createDefaultEventFilters(): EventFilters {
  return {
    search: '',
    domain: '',
    dateFrom: '',
    dateTo: '',
    location: '',
    priceType: DEFAULT_PRICE_TYPE,
    priceMin: '',
    priceMax: '',
    sortBy: DEFAULT_SORT,
  }
}

export function buildDiscoveryFilterInput(filters: EventFilters): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {}

  if (filters.search.trim()) filter.searchText = filters.search.trim()
  if (filters.domain) filter.domainSlug = filters.domain
  if (filters.location.trim()) filter.locationText = filters.location.trim()
  if (filters.dateFrom) filter.startsFromUtc = `${filters.dateFrom}T00:00:00.000Z`
  if (filters.dateTo) filter.startsToUtc = `${filters.dateTo}T23:59:59.999Z`
  if (filters.priceType === 'FREE') filter.isFree = true
  if (filters.priceType === 'PAID') filter.isFree = false
  if (filters.priceMin) filter.priceMin = Number(filters.priceMin)
  if (filters.priceMax) filter.priceMax = Number(filters.priceMax)
  filter.sortBy = filters.sortBy

  return Object.keys(filter).length ? filter : undefined
}

export function eventFiltersToQuery(filters: EventFilters): LocationQueryRaw {
  const query: LocationQueryRaw = {}

  if (filters.search.trim()) query.q = filters.search.trim()
  if (filters.domain) query.domain = filters.domain
  if (filters.dateFrom) query.from = filters.dateFrom
  if (filters.dateTo) query.to = filters.dateTo
  if (filters.location.trim()) query.location = filters.location.trim()
  if (filters.priceType !== DEFAULT_PRICE_TYPE) query.price = filters.priceType.toLowerCase()
  if (filters.priceMin) query.minPrice = filters.priceMin
  if (filters.priceMax) query.maxPrice = filters.priceMax
  if (filters.sortBy !== DEFAULT_SORT) query.sort = filters.sortBy.toLowerCase()

  return query
}

export function eventFiltersFromQuery(query: LocationQuery): EventFilters {
  const filters = createDefaultEventFilters()

  filters.search = getQueryValue(query.q)
  filters.domain = getQueryValue(query.domain)
  filters.dateFrom = getQueryValue(query.from)
  filters.dateTo = getQueryValue(query.to)
  filters.location = getQueryValue(query.location)
  filters.priceMin = getQueryValue(query.minPrice)
  filters.priceMax = getQueryValue(query.maxPrice)

  const price = getQueryValue(query.price).toLowerCase()
  if (price === 'free') filters.priceType = 'FREE'
  if (price === 'paid') filters.priceType = 'PAID'

  const sort = getQueryValue(query.sort).toUpperCase()
  if (sort === 'NEWEST' || sort === 'RELEVANCE') {
    filters.sortBy = sort
  }

  return filters
}

export function savedSearchToFilters(savedSearch: SavedSearch): EventFilters {
  return {
    search: savedSearch.searchText ?? '',
    domain: savedSearch.domainSlug ?? '',
    dateFrom: savedSearch.startsFromUtc?.slice(0, 10) ?? '',
    dateTo: savedSearch.startsToUtc?.slice(0, 10) ?? '',
    location: savedSearch.locationText ?? '',
    priceType:
      savedSearch.isFree === true ? 'FREE' : savedSearch.isFree === false ? 'PAID' : DEFAULT_PRICE_TYPE,
    priceMin: savedSearch.priceMin?.toString() ?? '',
    priceMax: savedSearch.priceMax?.toString() ?? '',
    sortBy: savedSearch.sortBy ?? DEFAULT_SORT,
  }
}

export function areEventFiltersEqual(left: EventFilters, right: EventFilters): boolean {
  return (
    left.search === right.search &&
    left.domain === right.domain &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.location === right.location &&
    left.priceType === right.priceType &&
    left.priceMin === right.priceMin &&
    left.priceMax === right.priceMax &&
    left.sortBy === right.sortBy
  )
}

function getQueryValue(value: LocationQuery[string] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function trimOrEmpty(value: string): string {
  return value.trim()
}

export function formatEventPrice(event: Pick<CatalogEvent, 'isFree' | 'priceAmount' | 'currencyCode'>): string {
  if (event.isFree) return 'Free'
  if (typeof event.priceAmount === 'number') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: event.currencyCode || 'EUR',
      maximumFractionDigits: event.priceAmount % 1 === 0 ? 0 : 2,
    }).format(event.priceAmount)
  }

  return 'Paid'
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<CatalogEvent[]>([])
  const discoveryEvents = ref<CatalogEvent[]>([])
  const loading = ref(false)
  const discoveryLoading = ref(false)
  const discoveryError = ref('')

  const filters = ref<EventFilters>(createDefaultEventFilters())

  async function fetchEvents() {
    loading.value = true
    try {
      const data = await gqlRequest<{ events: CatalogEvent[] }>(
        `query Events {
          events { ${EVENT_FIELDS} }
        }`,
      )
      events.value = data.events
    } finally {
      loading.value = false
    }
  }

  async function fetchDiscoveryEvents() {
    discoveryLoading.value = true
    discoveryError.value = ''

    try {
      const data = await gqlRequest<{ events: CatalogEvent[] }>(
        `query DiscoveryEvents($filter: EventFilterInput) {
          events(filter: $filter) { ${EVENT_FIELDS} }
        }`,
        { filter: buildDiscoveryFilterInput(filters.value) },
      )
      discoveryEvents.value = data.events
    } catch (error) {
      discoveryError.value = error instanceof Error ? error.message : 'Unable to load events right now.'
      discoveryEvents.value = []
    } finally {
      discoveryLoading.value = false
    }
  }

  const allEvents = computed(() => events.value)
  const pendingEvents = computed(() => events.value.filter((event) => event.status === 'PENDING_APPROVAL'))
  const hasActiveFilters = computed(() => !areEventFiltersEqual(filters.value, createDefaultEventFilters()))
  const activeFilterChips = computed(() => {
    const chips: Array<{ key: string; label: string }> = []

    if (trimOrEmpty(filters.value.search)) chips.push({ key: 'search', label: `Keyword: ${trimOrEmpty(filters.value.search)}` })
    if (filters.value.domain) chips.push({ key: 'domain', label: `Domain: ${filters.value.domain}` })
    if (filters.value.dateFrom) chips.push({ key: 'dateFrom', label: `From: ${filters.value.dateFrom}` })
    if (filters.value.dateTo) chips.push({ key: 'dateTo', label: `To: ${filters.value.dateTo}` })
    if (trimOrEmpty(filters.value.location)) chips.push({ key: 'location', label: `Location: ${trimOrEmpty(filters.value.location)}` })
    if (filters.value.priceType === 'FREE') chips.push({ key: 'priceType', label: 'Price: Free' })
    if (filters.value.priceType === 'PAID') chips.push({ key: 'priceType', label: 'Price: Paid' })
    if (filters.value.priceMin) chips.push({ key: 'priceMin', label: `Min price: ${filters.value.priceMin}` })
    if (filters.value.priceMax) chips.push({ key: 'priceMax', label: `Max price: ${filters.value.priceMax}` })
    if (filters.value.sortBy !== DEFAULT_SORT) chips.push({ key: 'sortBy', label: `Sort: ${filters.value.sortBy.toLowerCase()}` })

    return chips
  })

  function getEventBySlug(slug: string): CatalogEvent | undefined {
    return [...discoveryEvents.value, ...events.value].find((event) => event.slug === slug)
  }

  function getEventById(id: string): CatalogEvent | undefined {
    return [...discoveryEvents.value, ...events.value].find((event) => event.id === id)
  }

  async function submitEvent(input: {
    domainSlug: string
    name: string
    description: string
    eventUrl: string
    venueName: string
    addressLine1: string
    city: string
    countryCode?: string
    isFree?: boolean
    priceAmount?: number | null
    currencyCode?: string
    latitude: number
    longitude: number
    startsAtUtc: string
    endsAtUtc: string
  }) {
    const data = await gqlRequest<{ submitEvent: CatalogEvent }>(
      `mutation SubmitEvent($input: EventSubmissionInput!) {
        submitEvent(input: $input) { ${EVENT_FIELDS} }
      }`,
      { input },
    )
    events.value.unshift(data.submitEvent)
    return data.submitEvent
  }

  async function reviewEvent(eventId: string, status: string, adminNotes?: string) {
    const data = await gqlRequest<{ reviewEvent: CatalogEvent }>(
      `mutation ReviewEvent($eventId: UUID!, $input: ReviewEventInput!) {
        reviewEvent(eventId: $eventId, input: $input) { ${EVENT_FIELDS} }
      }`,
      { eventId, input: { status, adminNotes } },
    )
    const eventIndex = events.value.findIndex((event) => event.id === eventId)
    if (eventIndex >= 0) events.value[eventIndex] = data.reviewEvent
    return data.reviewEvent
  }

  function setFilters(newFilters: Partial<EventFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  function replaceFilters(nextFilters: EventFilters) {
    filters.value = { ...nextFilters }
  }

  function clearFilters() {
    replaceFilters(createDefaultEventFilters())
  }

  return {
    events,
    discoveryEvents,
    loading,
    discoveryLoading,
    discoveryError,
    filters,
    allEvents,
    pendingEvents,
    hasActiveFilters,
    activeFilterChips,
    getEventBySlug,
    getEventById,
    fetchEvents,
    fetchDiscoveryEvents,
    submitEvent,
    reviewEvent,
    setFilters,
    replaceFilters,
    clearFilters,
  }
})
