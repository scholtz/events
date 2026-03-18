import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { CatalogEvent, EventFilters } from '@/types'

const EVENT_FIELDS = `
  id name slug description eventUrl
  venueName addressLine1 city countryCode
  latitude longitude startsAtUtc endsAtUtc
  submittedAtUtc updatedAtUtc publishedAtUtc
  adminNotes status domainId mapUrl
  domain { id name slug }
  submittedBy { displayName }
`

export const useEventsStore = defineStore('events', () => {
  const events = ref<CatalogEvent[]>([])
  const loading = ref(false)

  const filters = ref<EventFilters>({
    search: '',
    domain: '',
    dateFrom: '',
    dateTo: '',
    city: '',
  })

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

  const filteredEvents = computed(() => {
    return events.value.filter((event) => {
      if (event.status !== 'PUBLISHED') return false

      if (
        filters.value.search &&
        !event.name.toLowerCase().includes(filters.value.search.toLowerCase()) &&
        !event.description.toLowerCase().includes(filters.value.search.toLowerCase())
      ) {
        return false
      }

      if (filters.value.domain && event.domain?.slug !== filters.value.domain) {
        return false
      }

      const eventDate = event.startsAtUtc.slice(0, 10)
      if (filters.value.dateFrom && eventDate < filters.value.dateFrom) {
        return false
      }

      if (filters.value.dateTo && eventDate > filters.value.dateTo) {
        return false
      }

      if (
        filters.value.city &&
        !event.venueName.toLowerCase().includes(filters.value.city.toLowerCase()) &&
        !event.city.toLowerCase().includes(filters.value.city.toLowerCase()) &&
        !event.addressLine1.toLowerCase().includes(filters.value.city.toLowerCase())
      ) {
        return false
      }

      return true
    })
  })

  const allEvents = computed(() => events.value)

  const pendingEvents = computed(() =>
    events.value.filter((e) => e.status === 'PENDING_APPROVAL'),
  )

  function getEventBySlug(slug: string): CatalogEvent | undefined {
    return events.value.find((e) => e.slug === slug)
  }

  function getEventById(id: string): CatalogEvent | undefined {
    return events.value.find((e) => e.id === id)
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
    const idx = events.value.findIndex((e) => e.id === eventId)
    if (idx >= 0) events.value[idx] = data.reviewEvent
    return data.reviewEvent
  }

  function setFilters(newFilters: Partial<EventFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  function clearFilters() {
    filters.value = { search: '', domain: '', dateFrom: '', dateTo: '', city: '' }
  }

  return {
    events,
    loading,
    filters,
    filteredEvents,
    allEvents,
    pendingEvents,
    getEventBySlug,
    getEventById,
    fetchEvents,
    submitEvent,
    reviewEvent,
    setFilters,
    clearFilters,
  }
})

