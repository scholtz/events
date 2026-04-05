import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { DashboardOverview, EventAnalyticsItem } from '@/types'

const DASHBOARD_QUERY = `
  query MyDashboard {
    myDashboard {
      totalSubmittedEvents
      publishedEvents
      pendingApprovalEvents
      rejectedEvents
      draftEvents
      totalInterestedCount
      totalInterestedLast7Days
      totalInterestedLast30Days
      totalCalendarActions
      totalCalendarActionsLast7Days
      totalCalendarActionsLast30Days
      managedEvents {
        id name slug status startsAtUtc domain { id name slug }
      }
      eventAnalytics {
        eventId eventName eventSlug status
        totalInterestedCount interestedLast7Days interestedLast30Days
        totalCalendarActions calendarActionsLast7Days calendarActionsLast30Days
        calendarActionsByProvider { provider count }
        startsAtUtc adminNotes domainSlug language timezone publishedAtUtc
      }
      availableDomains { id name slug subdomain description isActive createdAtUtc }
    }
  }
`

export const useDashboardStore = defineStore('dashboard', () => {
  const overview = ref<DashboardOverview | null>(null)
  const loading = ref(false)
  const error = ref('')
  /** UTC timestamp of the most recent successful dashboard fetch. */
  const lastFetchedAt = ref<Date | null>(null)

  /** Returns analytics for a single event by its ID, or null if not found. */
  function getEventAnalytics(eventId: string): EventAnalyticsItem | null {
    return overview.value?.eventAnalytics.find((a) => a.eventId === eventId) ?? null
  }

  async function fetchDashboard() {
    loading.value = true
    error.value = ''
    try {
      const data = await gqlRequest<{ myDashboard: DashboardOverview }>(DASHBOARD_QUERY)
      overview.value = data.myDashboard
      lastFetchedAt.value = new Date()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unable to load dashboard.'
      overview.value = null
    } finally {
      loading.value = false
    }
  }

  function clearDashboard() {
    overview.value = null
    error.value = ''
    lastFetchedAt.value = null
  }

  return {
    overview,
    loading,
    error,
    lastFetchedAt,
    getEventAnalytics,
    fetchDashboard,
    clearDashboard,
  }
})
