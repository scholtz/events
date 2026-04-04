<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import { useCommunitiesStore } from '@/stores/communities'
import { gqlRequest } from '@/lib/graphql'
import type { CatalogEvent, EventAnalyticsItem, EventDomain, CommunityMembership } from '@/types'
import { isValidHexColor } from '@/lib/colorUtils'
import {
  saveTrendVariant,
  calendarTrendVariant,
  eventRecommendationType,
  eventRecommendationVariant,
} from '@/composables/useAnalyticsGuidance'

const { t, locale } = useI18n()
const dashboardStore = useDashboardStore()
const auth = useAuthStore()
const domainsStore = useDomainsStore()
const communitiesStore = useCommunitiesStore()

const overview = computed(() => dashboardStore.overview)
const MAX_COMMUNITY_LINKS = 10
const MAX_FEATURED_EVENTS = 5

// ── My Communities state ─────────────────────────────────────────────────────
const myCommunities = ref<CommunityMembership[]>([])
const myCommunitiesLoading = ref(false)
const myCommunitiesError = ref<string | null>(null)

// ── Hub management state ─────────────────────────────────────────────────────
const hubStyleForms = ref<Record<string, { primaryColor: string; accentColor: string; logoUrl: string; bannerUrl: string }>>({})
const hubOverviewForms = ref<Record<string, { tagline: string; overviewContent: string; whatBelongsHere: string; submitEventCta: string; curatorCredit: string }>>({})
const hubCommunityLinks = ref<Record<string, { title: string; url: string }[]>>({})
const hubNewLinkForms = ref<Record<string, { title: string; url: string }>>({})
const hubStyleSaving = ref<Record<string, boolean>>({})
const hubStyleSuccess = ref<Record<string, boolean>>({})
const hubOverviewSaving = ref<Record<string, boolean>>({})
const hubOverviewSuccess = ref<Record<string, boolean>>({})
const hubLinksSaving = ref<Record<string, boolean>>({})
const hubLinksSuccess = ref<Record<string, boolean>>({})
const hubManageError = ref<Record<string, string>>({})
const hubColorErrors = ref<Record<string, { primaryColor: string; accentColor: string }>>({})

// ── Featured events state ─────────────────────────────────────────────────────
const hubFeaturedEvents = ref<Record<string, CatalogEvent[]>>({})
const hubFeaturedEventsLoading = ref<Record<string, boolean>>({})
const hubFeaturedEventsSaving = ref<Record<string, boolean>>({})
const hubFeaturedEventsSuccess = ref<Record<string, boolean>>({})
const hubFeaturedEventsError = ref<Record<string, string>>({})
const hubAddFeaturedEventId = ref<Record<string, string>>({})

function initHubForms(domains: EventDomain[]) {
  for (const d of domains) {
    if (!hubStyleForms.value[d.id]) {
      hubStyleForms.value[d.id] = {
        primaryColor: d.primaryColor ?? '',
        accentColor: d.accentColor ?? '',
        logoUrl: d.logoUrl ?? '',
        bannerUrl: d.bannerUrl ?? '',
      }
    }
    if (!hubColorErrors.value[d.id]) {
      hubColorErrors.value[d.id] = { primaryColor: '', accentColor: '' }
    }
    if (!hubOverviewForms.value[d.id]) {
      hubOverviewForms.value[d.id] = {
        tagline: d.tagline ?? '',
        overviewContent: d.overviewContent ?? '',
        whatBelongsHere: d.whatBelongsHere ?? '',
        submitEventCta: d.submitEventCta ?? '',
        curatorCredit: d.curatorCredit ?? '',
      }
    }
    if (!hubCommunityLinks.value[d.id]) {
      hubCommunityLinks.value[d.id] = (d.links ?? []).map((link) => ({
        title: link.title,
        url: link.url,
      }))
    }
    if (!hubNewLinkForms.value[d.id]) {
      hubNewLinkForms.value[d.id] = {
        title: '',
        url: '',
      }
    }
    if (!hubFeaturedEvents.value[d.id]) {
      hubFeaturedEvents.value[d.id] = []
      hubAddFeaturedEventId.value[d.id] = ''
    }
  }
}

async function handleSaveHubStyle(domainId: string) {
  hubStyleSaving.value[domainId] = true
  hubStyleSuccess.value[domainId] = false
  hubManageError.value[domainId] = ''
  // Client-side color validation
  const form = hubStyleForms.value[domainId]
  if (!form) {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
    hubStyleSaving.value[domainId] = false
    return
  }
  const colorErr = { primaryColor: '', accentColor: '' }
  if (!isValidHexColor(form.primaryColor)) colorErr.primaryColor = t('dashboard.hubColorError')
  if (!isValidHexColor(form.accentColor)) colorErr.accentColor = t('dashboard.hubColorError')
  hubColorErrors.value[domainId] = colorErr
  if (colorErr.primaryColor || colorErr.accentColor) {
    hubStyleSaving.value[domainId] = false
    return
  }
  try {
    await domainsStore.updateDomainStyle({
      domainId,
      primaryColor: form.primaryColor || null,
      accentColor: form.accentColor || null,
      logoUrl: form.logoUrl || null,
      bannerUrl: form.bannerUrl || null,
    })
    hubStyleSuccess.value[domainId] = true
  } catch {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
  } finally {
    hubStyleSaving.value[domainId] = false
  }
}

async function handleSaveHubOverview(domainId: string) {
  hubOverviewSaving.value[domainId] = true
  hubOverviewSuccess.value[domainId] = false
  hubManageError.value[domainId] = ''
  try {
    const form = hubOverviewForms.value[domainId]
    if (!form) {
      hubManageError.value[domainId] = t('dashboard.hubManageError')
      return
    }
    await domainsStore.updateDomainOverview({
      domainId,
      tagline: form.tagline || null,
      overviewContent: form.overviewContent || null,
      whatBelongsHere: form.whatBelongsHere || null,
      submitEventCta: form.submitEventCta || null,
      curatorCredit: form.curatorCredit || null,
    })
    hubOverviewSuccess.value[domainId] = true
  } catch {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
  } finally {
    hubOverviewSaving.value[domainId] = false
  }
}

function handleAddHubLink(domainId: string) {
  const form = hubNewLinkForms.value[domainId]
  if (!form) {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
    return
  }

  const title = form.title.trim()
  const url = form.url.trim()

  if (!title || !url || (hubCommunityLinks.value[domainId]?.length ?? 0) >= MAX_COMMUNITY_LINKS) {
    return
  }

  hubCommunityLinks.value[domainId] = [
    ...(hubCommunityLinks.value[domainId] ?? []),
    { title, url },
  ]
  hubNewLinkForms.value[domainId] = { title: '', url: '' }
  hubLinksSuccess.value[domainId] = false
}

function handleRemoveHubLink(domainId: string, index: number) {
  hubCommunityLinks.value[domainId] = (hubCommunityLinks.value[domainId] ?? []).filter(
    (_, idx) => idx !== index,
  )
  hubLinksSuccess.value[domainId] = false
}

async function handleSaveHubLinks(domainId: string) {
  hubLinksSaving.value[domainId] = true
  hubLinksSuccess.value[domainId] = false
  hubManageError.value[domainId] = ''
  try {
    await domainsStore.setDomainLinks(domainId, hubCommunityLinks.value[domainId] ?? [])
    hubLinksSuccess.value[domainId] = true
  } catch {
    hubManageError.value[domainId] = t('admin.communityLinksError')
  } finally {
    hubLinksSaving.value[domainId] = false
  }
}

async function loadHubFeaturedEvents(domainId: string) {
  const domain = domainsStore.myManagedDomains.find((d) => d.id === domainId)
  if (!domain) return
  hubFeaturedEventsLoading.value[domainId] = true
  try {
    const data = await gqlRequest<{ featuredEventsForDomain: CatalogEvent[] }>(
      `query FeaturedEventsForDomain($domainSlug: String!) {
        featuredEventsForDomain(domainSlug: $domainSlug) {
          id name slug status startsAtUtc
        }
      }`,
      { domainSlug: domain.slug },
    )
    hubFeaturedEvents.value[domainId] = data.featuredEventsForDomain
  } catch {
    hubFeaturedEvents.value[domainId] = []
  } finally {
    hubFeaturedEventsLoading.value[domainId] = false
  }
}

function handleAddHubFeaturedEvent(domainId: string) {
  const eventId = hubAddFeaturedEventId.value[domainId]
  if (!eventId) return
  const current = hubFeaturedEvents.value[domainId] ?? []
  if (current.length >= MAX_FEATURED_EVENTS) return
  if (current.some((e) => e.id === eventId)) {
    hubAddFeaturedEventId.value[domainId] = ''
    return
  }
  const eventToAdd = (overview.value?.managedEvents ?? []).find(
    (e) => e.id === eventId,
  ) as CatalogEvent | undefined
  if (eventToAdd) {
    hubFeaturedEvents.value[domainId] = [...current, eventToAdd]
    hubAddFeaturedEventId.value[domainId] = ''
    hubFeaturedEventsSuccess.value[domainId] = false
  }
}

function handleRemoveHubFeaturedEvent(domainId: string, eventId: string) {
  hubFeaturedEvents.value[domainId] = (hubFeaturedEvents.value[domainId] ?? []).filter(
    (e) => e.id !== eventId,
  )
  hubFeaturedEventsSuccess.value[domainId] = false
}

async function handleSaveHubFeaturedEvents(domainId: string) {
  hubFeaturedEventsSaving.value[domainId] = true
  hubFeaturedEventsSuccess.value[domainId] = false
  hubFeaturedEventsError.value[domainId] = ''
  try {
    await domainsStore.setDomainFeaturedEvents(
      domainId,
      (hubFeaturedEvents.value[domainId] ?? []).map((e) => e.id),
    )
    hubFeaturedEventsSuccess.value[domainId] = true
  } catch {
    hubFeaturedEventsError.value[domainId] = t('dashboard.hubFeaturedEventsError')
  } finally {
    hubFeaturedEventsSaving.value[domainId] = false
  }
}

async function loadMyCommunities() {
  myCommunitiesLoading.value = true
  myCommunitiesError.value = null
  try {
    const memberships = await communitiesStore.fetchMyMemberships()
    myCommunities.value = memberships.filter((m) => m.status === 'ACTIVE')
  } catch {
    myCommunitiesError.value = t('dashboard.myCommunitiesError')
  } finally {
    myCommunitiesLoading.value = false
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await dashboardStore.fetchDashboard()
    await domainsStore.fetchMyManagedDomains()
    initHubForms(domainsStore.myManagedDomains)
    await Promise.all(domainsStore.myManagedDomains.map((d) => loadHubFeaturedEvents(d.id)))
    await loadMyCommunities()
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabel(status: string): string {
  const key = `eventStatus.${status}`
  const translated = t(key)
  return translated === key ? status.toLowerCase() : translated
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'badge-success'
    case 'PENDING_APPROVAL':
      return 'badge-warning'
    case 'REJECTED':
      return 'badge-danger'
    default:
      return ''
  }
}

function trendLabel(item: EventAnalyticsItem): string {
  const variant = saveTrendVariant(item)
  if (variant === 'trend--active') return t('dashboard.trendThisWeek', { count: item.interestedLast7Days })
  if (variant === 'trend--recent') return t('dashboard.trendThisMonth', { count: item.interestedLast30Days })
  return t('dashboard.noRecentSaves')
}

function trendClass(item: EventAnalyticsItem): string {
  return saveTrendVariant(item)
}

function calendarTrendLabel(item: EventAnalyticsItem): string {
  const variant = calendarTrendVariant(item)
  if (variant === 'trend--active') return t('dashboard.trendThisWeek', { count: item.calendarActionsLast7Days })
  if (variant === 'trend--recent') return t('dashboard.trendThisMonth', { count: item.calendarActionsLast30Days })
  return t('dashboard.noRecentAdds')
}

function calendarTrendClass(item: EventAnalyticsItem): string {
  return calendarTrendVariant(item)
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'GOOGLE':
      return 'Google'
    case 'OUTLOOK':
      return 'Outlook'
    case 'ICS':
      return 'ICS'
    default:
      return provider
  }
}

function eventRecommendation(item: EventAnalyticsItem): string | null {
  const type = eventRecommendationType(item)
  switch (type) {
    case 'rejected': return t('dashboard.recommendationRejected')
    case 'draft': return t('dashboard.recommendationDraft')
    case 'pending': return t('dashboard.recommendationPending')
    case 'publishedApproachingSoon': return t('dashboard.recommendationPublishedApproachingSoon')
    case 'publishedNewlyPublished': return t('dashboard.recommendationPublishedNewlyPublished')
    case 'publishedNoSaves': return t('dashboard.recommendationPublishedNoSaves')
    case 'publishedMissingLanguage': return t('dashboard.recommendationPublishedMissingLanguage')
    case 'publishedMissingTimezone': return t('dashboard.recommendationPublishedMissingTimezone')
    case 'publishedMissingDomain': return t('dashboard.recommendationPublishedMissingDomain')
    default: return null
  }
}

function eventRecommendationClass(item: EventAnalyticsItem): string {
  return eventRecommendationVariant(item)
}

function communityRoleLabel(role: string): string {
  switch (role) {
    case 'OWNER': return t('community.ownerRole')
    case 'ADMIN': return t('community.adminRole')
    case 'EVENT_MANAGER': return t('community.eventManagerRole')
    default: return t('community.memberRole')
  }
}
</script>

<template>
  <div class="container dashboard-view">
    <div class="page-header">
      <div>
        <h1>{{ t('dashboard.title') }}</h1>
        <p v-if="auth.isAuthenticated">
          {{ t('dashboard.welcomeBack', { name: auth.currentUser?.displayName }) }}
        </p>
        <p v-else>{{ t('dashboard.pleaseLogIn') }}</p>
      </div>
      <RouterLink v-if="auth.isAuthenticated" to="/submit" class="btn btn-primary">
        {{ t('dashboard.submitEvent') }}
      </RouterLink>
    </div>

    <template v-if="auth.isAuthenticated">
      <!-- Loading state -->
      <template v-if="dashboardStore.loading">
        <div class="stats-grid">
          <div v-for="n in 4" :key="n" class="stat-card card">
            <div class="stat-icon skeleton-icon" aria-hidden="true"></div>
            <div class="stat-info">
              <div class="skeleton-line skeleton-number"></div>
              <div class="skeleton-line skeleton-short"></div>
            </div>
          </div>
        </div>
        <div class="section-header">
          <div class="skeleton-line skeleton-heading"></div>
        </div>
        <div class="card events-table">
          <div v-for="n in 3" :key="n" class="skeleton-row">
            <div class="skeleton-line skeleton-cell"></div>
            <div class="skeleton-line skeleton-cell-sm"></div>
            <div class="skeleton-line skeleton-cell-sm"></div>
          </div>
        </div>
      </template>

      <!-- Error state -->
      <div v-else-if="dashboardStore.error" class="card error-state" role="alert">
        <div class="error-icon">⚠️</div>
        <p class="error-message">{{ dashboardStore.error }}</p>
        <button class="btn btn-outline" @click="dashboardStore.fetchDashboard()">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Loaded state -->
      <template v-else-if="overview">
        <!-- KPI stats -->
        <div class="stats-grid" aria-label="Event performance overview">
          <div class="stat-card card">
            <div class="stat-icon stat-icon--total" aria-hidden="true">📊</div>
            <div class="stat-info">
              <div class="stat-number">{{ overview.totalSubmittedEvents }}</div>
              <div class="stat-label">{{ t('dashboard.totalEvents') }}</div>
              <div class="stat-helper">{{ t('dashboard.totalEventsHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--approved" aria-hidden="true">✅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--success">{{ overview.publishedEvents }}</div>
              <div class="stat-label">{{ t('dashboard.published') }}</div>
              <div class="stat-helper">{{ t('dashboard.publishedHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--pending" aria-hidden="true">⏳</div>
            <div class="stat-info">
              <div class="stat-number stat-number--warning">{{ overview.pendingApprovalEvents }}</div>
              <div class="stat-label">{{ t('dashboard.pendingReview') }}</div>
              <div class="stat-helper">{{ t('dashboard.pendingReviewHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--interested" aria-hidden="true">🔖</div>
            <div class="stat-info">
              <div class="stat-number stat-number--primary">{{ overview.totalInterestedCount }}</div>
              <div class="stat-label">{{ t('dashboard.totalSaves') }}</div>
              <div class="stat-helper">{{ t('dashboard.totalSavesHelper') }}</div>
              <div class="stat-timeframe">{{ t('dashboard.metricTimeframeAllTime') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--calendar" aria-hidden="true">📅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--calendar">{{ overview.totalCalendarActions }}</div>
              <div class="stat-label">{{ t('dashboard.calendarAdds') }}</div>
              <div class="stat-helper">{{ t('dashboard.calendarAddsHelper') }}</div>
              <div class="stat-timeframe">{{ t('dashboard.metricTimeframeAllTime') }}</div>
            </div>
          </div>
        </div>

        <!-- Analytics section -->
        <div class="section-header">
          <h2>{{ t('dashboard.eventPerformance') }}</h2>
          <p class="section-subtitle performance-description">{{ t('dashboard.performanceDescription') }}</p>
        </div>

        <!-- No events empty state -->
        <div v-if="!overview.managedEvents.length" class="card empty-state">
          <div class="empty-icon">📭</div>
          <h3>{{ t('dashboard.noEventsTitle') }}</h3>
          <p>{{ t('dashboard.noEventsDescription') }}</p>
          <RouterLink to="/submit" class="btn btn-primary">{{ t('dashboard.submitFirstEvent') }}</RouterLink>
        </div>

        <!-- First-event welcome guidance for new organizers -->
        <div
          v-else-if="overview.totalSubmittedEvents === 1 && overview.publishedEvents === 0"
          class="card first-event-welcome"
          role="note"
          aria-label="Getting started guidance"
        >
          <span class="guidance-icon" aria-hidden="true">🎉</span>
          <div>
            <strong>{{ t('dashboard.firstEventWelcomeTitle') }}</strong>
            <p class="first-event-welcome-detail">{{ t('dashboard.firstEventWelcome') }}</p>
          </div>
        </div>

        <!-- Events analytics table -->
        <div v-if="overview.managedEvents.length" class="card events-table" aria-label="Per-event analytics">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.tableEvent') }}</th>
                <th scope="col">{{ t('dashboard.tableStatus') }}</th>
                <th scope="col">{{ t('dashboard.tableDate') }}</th>
                <th scope="col" class="col-saves" :title="t('dashboard.tableSavesTitle')">
                  {{ t('dashboard.tableSaves') }}
                </th>
                <th scope="col" class="col-momentum" :title="t('dashboard.tableMomentumTitle')">{{ t('dashboard.tableMomentum') }}</th>
                <th scope="col" class="col-calendar" :title="t('dashboard.tableCalendarTitle')">{{ t('dashboard.tableCalendar') }}</th>
                <th scope="col" class="col-cal-trend" :title="t('dashboard.tableCalTrendTitle')">{{ t('dashboard.tableCalTrend') }}</th>
                <th scope="col">{{ t('dashboard.tableActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in overview.eventAnalytics" :key="item.eventId">
                <tr>
                  <td>
                    <RouterLink
                      v-if="item.status === 'PUBLISHED'"
                      :to="`/event/${item.eventSlug}`"
                      class="event-link"
                    >
                      {{ item.eventName }}
                    </RouterLink>
                    <span v-else class="event-name-plain">{{ item.eventName }}</span>
                  </td>
                  <td>
                    <span class="badge" :class="statusBadgeClass(item.status)">
                      {{ statusLabel(item.status) }}
                    </span>
                  </td>
                  <td class="date-cell">{{ formatDate(item.startsAtUtc) }}</td>
                  <td class="col-saves">
                    <span class="saves-count" :aria-label="`${item.totalInterestedCount} saves`">
                      {{ item.totalInterestedCount }}
                    </span>
                  </td>
                  <td class="col-momentum">
                    <span class="trend-badge" :class="trendClass(item)">
                      {{ trendLabel(item) }}
                    </span>
                  </td>
                  <td class="col-calendar">
                    <span
                      class="saves-count"
                      :aria-label="`${item.totalCalendarActions} calendar adds`"
                    >
                      {{ item.totalCalendarActions }}
                    </span>
                    <span
                      v-if="item.calendarActionsByProvider.length"
                      class="provider-breakdown"
                      :aria-label="item.calendarActionsByProvider.map(p => `${providerLabel(p.provider)}: ${p.count}`).join(', ')"
                    >
                      <span
                        v-for="p in item.calendarActionsByProvider"
                        :key="p.provider"
                        class="provider-chip"
                        :title="`${providerLabel(p.provider)}: ${p.count}`"
                      >
                        {{ providerLabel(p.provider) }}&nbsp;{{ p.count }}
                      </span>
                    </span>
                  </td>
                  <td class="col-cal-trend">
                    <span class="trend-badge" :class="calendarTrendClass(item)">
                      {{ calendarTrendLabel(item) }}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <RouterLink
                      v-if="item.status === 'PUBLISHED'"
                      :to="`/event/${item.eventSlug}`"
                      class="btn btn-outline btn-sm"
                    >
                      {{ t('dashboard.viewDetails') }}
                    </RouterLink>
                    <RouterLink
                      :to="`/edit/${item.eventId}`"
                      class="btn btn-outline btn-sm btn-edit"
                    >
                      {{ t('dashboard.editEvent') }}
                    </RouterLink>
                  </td>
                </tr>
                <!-- Per-event recommendation row -->
                <tr
                  v-if="eventRecommendation(item)"
                  class="event-recommendation-row"
                  :class="eventRecommendationClass(item)"
                  role="note"
                >
                  <td colspan="8" class="event-recommendation-cell">
                    <span class="rec-icon" aria-hidden="true">
                      <template v-if="item.status === 'REJECTED'">⚠️</template>
                      <template v-else-if="item.status === 'DRAFT'">📝</template>
                      <template v-else-if="item.status === 'PENDING_APPROVAL'">⏳</template>
                      <template v-else-if="eventRecommendationClass(item) === 'rec--urgent'">🚨</template>
                      <template v-else>💡</template>
                    </span>
                    <span class="rec-text">{{ eventRecommendation(item) }}</span>
                    <!-- Show admin notes inline for rejected events -->
                    <span v-if="item.status === 'REJECTED' && item.adminNotes" class="rec-admin-notes">
                      <strong>{{ t('dashboard.adminNotesFeedback') }}</strong>
                      {{ item.adminNotes }}
                    </span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>

          <!-- Guidance for low-data state -->
          <div
            v-if="overview.publishedEvents > 0 && overview.totalInterestedCount === 0"
            class="low-data-guidance"
            role="note"
            aria-label="Improvement tip"
          >
            <span class="guidance-icon" aria-hidden="true">💡</span>
            <div>
              <strong>{{ t('dashboard.guidanceNoSavesTitle') }}</strong>
              {{ t('dashboard.guidanceNoSaves') }}
            </div>
          </div>

          <!-- Guidance: saves exist but no calendar adds -->
          <div
            v-if="overview.totalInterestedCount > 0 && overview.totalCalendarActions === 0"
            class="low-data-guidance low-data-guidance--calendar"
            role="note"
            aria-label="Calendar engagement guidance"
          >
            <span class="guidance-icon" aria-hidden="true">📅</span>
            <div>{{ t('dashboard.guidanceNoCalendarAdds') }}</div>
          </div>
        </div>
      </template>

      <!-- ── My Communities ─────────────────────────────────────────────────── -->
      <section
        v-if="!dashboardStore.loading && !dashboardStore.error"
        class="my-communities-section"
        aria-labelledby="my-communities-heading"
      >
        <div class="section-header">
          <h2 id="my-communities-heading">{{ t('dashboard.myCommunitiesTitle') }}</h2>
          <RouterLink to="/communities" class="btn btn-outline btn-sm">
            {{ t('dashboard.browseCommunities') }}
          </RouterLink>
        </div>

        <!-- Loading -->
        <div v-if="myCommunitiesLoading" class="communities-loading">
          <span class="text-secondary">{{ t('common.loading') }}</span>
        </div>

        <!-- Error state -->
        <div v-else-if="myCommunitiesError" class="communities-error card" role="alert">
          <p class="communities-error-message">{{ myCommunitiesError }}</p>
          <button class="btn btn-outline btn-sm" @click="loadMyCommunities()">
            {{ t('common.tryAgain') }}
          </button>
        </div>

        <!-- Empty state -->
        <div v-else-if="myCommunities.length === 0" class="communities-empty card">
          <p class="communities-empty-title">{{ t('dashboard.noCommunitiesYet') }}</p>
          <p class="communities-empty-hint">{{ t('dashboard.noCommunitiesHint') }}</p>
          <RouterLink to="/communities" class="btn btn-primary btn-sm">
            {{ t('dashboard.browseCommunities') }}
          </RouterLink>
        </div>

        <!-- List -->
        <div v-else class="communities-list">
          <RouterLink
            v-for="m in myCommunities"
            :key="m.id"
            :to="`/community/${m.group.slug}`"
            class="community-item card"
          >
            <div class="community-item-info">
              <span class="community-item-name">{{ m.group.name }}</span>
              <span v-if="m.group.summary" class="community-item-summary">{{ m.group.summary }}</span>
            </div>
            <span class="community-role-badge" :class="`role--${m.role.toLowerCase()}`">
              {{ communityRoleLabel(m.role) }}
            </span>
          </RouterLink>
        </div>
      </section>

      <!-- ── Hub Management (for domain administrators) ──────────────────── -->
      <section
        v-if="!dashboardStore.loading && !dashboardStore.error && domainsStore.myManagedDomains.length > 0"
        class="hub-management-section"
        aria-labelledby="hub-management-heading"
      >
        <div class="section-header">
          <h2 id="hub-management-heading">{{ t('dashboard.hubManagementTitle') }}</h2>
          <p class="section-subtitle">{{ t('dashboard.hubManagementDescription') }}</p>
        </div>

        <div
          v-for="hub in domainsStore.myManagedDomains"
          :key="hub.id"
          class="hub-card card"
        >
          <div class="hub-card-header">
            <div class="hub-card-identity">
              <img
                v-if="hub.logoUrl"
                :src="hub.logoUrl"
                :alt="hub.name"
                class="hub-card-logo"
              />
              <div>
                <h3 class="hub-card-name">{{ hub.name }}</h3>
                <p v-if="hub.description" class="hub-card-description">{{ hub.description }}</p>
              </div>
            </div>
            <RouterLink
              :to="`/category/${hub.slug}`"
              class="btn btn-outline btn-sm"
              target="_blank"
              rel="noopener"
            >
              {{ t('dashboard.hubViewHub') }}
            </RouterLink>
          </div>

          <p v-if="hubManageError[hub.id]" class="hub-manage-error" role="alert">
            {{ hubManageError[hub.id] }}
          </p>

          <!-- Style form -->
          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('dashboard.hubStyleTitle') }}</h4>
            <form class="hub-style-form" @submit.prevent="handleSaveHubStyle(hub.id)">
              <div class="hub-form-grid">
                <label class="form-field">
                  <span>{{ t('dashboard.hubPrimaryColor') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.primaryColor"
                    class="form-input"
                    :class="{ 'input-error': hubColorErrors[hub.id]?.primaryColor }"
                    type="text"
                    placeholder="#137fec"
                    aria-describedby="`primary-color-error-${hub.id}`"
                  />
                  <span
                    v-if="hubColorErrors[hub.id]?.primaryColor"
                    :id="`primary-color-error-${hub.id}`"
                    class="field-error"
                    role="alert"
                  >
                    {{ hubColorErrors[hub.id]!.primaryColor }}
                  </span>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubAccentColor') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.accentColor"
                    class="form-input"
                    :class="{ 'input-error': hubColorErrors[hub.id]?.accentColor }"
                    type="text"
                    placeholder="#ff5500"
                    aria-describedby="`accent-color-error-${hub.id}`"
                  />
                  <span
                    v-if="hubColorErrors[hub.id]?.accentColor"
                    :id="`accent-color-error-${hub.id}`"
                    class="field-error"
                    role="alert"
                  >
                    {{ hubColorErrors[hub.id]!.accentColor }}
                  </span>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubLogoUrl') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.logoUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/logo.png"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubBannerUrl') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.bannerUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/banner.jpg"
                  />
                </label>
              </div>
              <div class="hub-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="hubStyleSaving[hub.id]"
                >
                  {{ hubStyleSaving[hub.id] ? t('dashboard.hubSaving') : t('dashboard.hubSaveStyle') }}
                </button>
                <span v-if="hubStyleSuccess[hub.id]" class="hub-save-success">
                  {{ t('dashboard.hubSaved') }}
                </span>
              </div>
            </form>
          </div>

          <!-- Overview / content form -->
          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('dashboard.hubOverviewTitle') }}</h4>
            <form class="hub-overview-form" @submit.prevent="handleSaveHubOverview(hub.id)">
              <div class="hub-form-grid hub-form-grid--full">
                <label class="form-field">
                  <span>{{ t('dashboard.hubTagline') }}</span>
                  <input
                    v-model="hubOverviewForms[hub.id]!.tagline"
                    class="form-input"
                    type="text"
                    maxlength="150"
                    :placeholder="t('admin.domainTaglinePlaceholder')"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubOverviewContent') }}</span>
                  <textarea
                    v-model="hubOverviewForms[hub.id]!.overviewContent"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="2000"
                    :placeholder="t('hubManage.overviewPlaceholder')"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubWhatBelongsHere') }}</span>
                  <textarea
                    v-model="hubOverviewForms[hub.id]!.whatBelongsHere"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="1000"
                    :placeholder="t('hubManage.whatBelongsHerePlaceholder')"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubSubmitEventCta') }}</span>
                  <input
                    v-model="hubOverviewForms[hub.id]!.submitEventCta"
                    class="form-input"
                    type="text"
                    maxlength="300"
                    :placeholder="t('hubManage.ctaPlaceholder')"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubCuratorCredit') }}</span>
                  <input
                    v-model="hubOverviewForms[hub.id]!.curatorCredit"
                    class="form-input"
                    type="text"
                    maxlength="200"
                    :placeholder="t('hubManage.curatorCreditPlaceholder')"
                  />
                </label>
              </div>
              <div class="hub-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="hubOverviewSaving[hub.id]"
                >
                  {{ hubOverviewSaving[hub.id] ? t('dashboard.hubSaving') : t('dashboard.hubSaveOverview') }}
                </button>
                <span v-if="hubOverviewSuccess[hub.id]" class="hub-save-success">
                  {{ t('dashboard.hubSaved') }}
                </span>
              </div>
            </form>
          </div>

          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('admin.communityLinks') }}</h4>
            <p class="hub-form-helper">{{ t('admin.communityLinksHint') }}</p>
            <div class="hub-community-links-list">
              <div
                v-for="(link, index) in hubCommunityLinks[hub.id]"
                :key="`${hub.id}-${index}`"
                class="hub-community-link-item"
              >
                <span class="hub-community-link-order">{{ index + 1 }}</span>
                <div class="hub-community-link-info">
                  <strong>{{ link.title }}</strong>
                  <span class="text-secondary hub-community-link-url">{{ link.url }}</span>
                </div>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  @click="handleRemoveHubLink(hub.id, index)"
                >
                  {{ t('admin.removeCommunityLink') }}
                </button>
              </div>
              <p
                v-if="!hubCommunityLinks[hub.id]?.length"
                class="text-secondary hub-community-links-empty"
              >
                {{ t('admin.communityLinksEmpty') }}
              </p>
            </div>

            <div
              v-if="(hubCommunityLinks[hub.id]?.length ?? 0) < MAX_COMMUNITY_LINKS"
              class="hub-add-community-link-form"
            >
              <label class="form-field">
                <span>{{ t('admin.communityLinksLinkTitle') }}</span>
                <input
                  v-model="hubNewLinkForms[hub.id]!.title"
                  class="form-input"
                  type="text"
                  maxlength="100"
                />
              </label>
              <label class="form-field">
                <span>{{ t('admin.communityLinksLinkUrl') }}</span>
                <input
                  v-model="hubNewLinkForms[hub.id]!.url"
                  class="form-input"
                  type="url"
                />
              </label>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="
                  !hubNewLinkForms[hub.id]!.title.trim() || !hubNewLinkForms[hub.id]!.url.trim()
                "
                @click="handleAddHubLink(hub.id)"
              >
                {{ t('admin.addCommunityLink') }}
              </button>
            </div>

            <div class="hub-form-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="hubLinksSaving[hub.id]"
                @click="handleSaveHubLinks(hub.id)"
              >
                {{
                  hubLinksSaving[hub.id]
                    ? t('admin.communityLinksSaving')
                    : t('admin.saveCommunityLinks')
                }}
              </button>
              <span v-if="hubLinksSuccess[hub.id]" class="hub-save-success">
                {{ t('admin.communityLinksSaved') }}
              </span>
            </div>
          </div>

          <!-- Featured Events curation -->
          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('dashboard.hubFeaturedEventsTitle') }}</h4>
            <p class="hub-form-helper">{{ t('dashboard.hubFeaturedEventsHint') }}</p>

            <div v-if="hubFeaturedEventsLoading[hub.id]" class="hub-featured-loading text-secondary">
              {{ t('common.loading') }}
            </div>
            <template v-else>
              <ul class="hub-featured-events-list" aria-label="Featured events">
                <li
                  v-for="event in hubFeaturedEvents[hub.id]"
                  :key="event.id"
                  class="hub-featured-event-item"
                >
                  <span class="hub-featured-event-name">{{ event.name }}</span>
                  <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    @click="handleRemoveHubFeaturedEvent(hub.id, event.id)"
                  >
                    {{ t('dashboard.hubFeaturedEventsRemove') }}
                  </button>
                </li>
                <li
                  v-if="!(hubFeaturedEvents[hub.id]?.length)"
                  class="hub-featured-empty text-secondary"
                >
                  {{ t('dashboard.hubFeaturedEventsEmpty') }}
                </li>
              </ul>

              <div
                v-if="(hubFeaturedEvents[hub.id]?.length ?? 0) < MAX_FEATURED_EVENTS"
                class="hub-add-featured-form"
              >
                <select
                  v-model="hubAddFeaturedEventId[hub.id]"
                  class="form-input hub-featured-select"
                  :aria-label="t('dashboard.hubFeaturedEventsAdd')"
                >
                  <option value="">{{ t('dashboard.hubFeaturedEventsSelectPlaceholder') }}</option>
                  <option
                    v-for="event in (overview?.managedEvents ?? []).filter(
                      (e) =>
                        e.status === 'PUBLISHED' &&
                        e.domain?.id === hub.id &&
                        !(hubFeaturedEvents[hub.id] ?? []).some((f) => f.id === e.id)
                    )"
                    :key="event.id"
                    :value="event.id"
                  >
                    {{ event.name }}
                  </option>
                </select>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  :disabled="!hubAddFeaturedEventId[hub.id]"
                  @click="handleAddHubFeaturedEvent(hub.id)"
                >
                  {{ t('dashboard.hubFeaturedEventsAdd') }}
                </button>
              </div>

              <p
                v-if="hubFeaturedEventsError[hub.id]"
                class="hub-featured-error field-error"
                role="alert"
              >
                {{ hubFeaturedEventsError[hub.id] }}
              </p>

              <div class="hub-form-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="hubFeaturedEventsSaving[hub.id]"
                  @click="handleSaveHubFeaturedEvents(hub.id)"
                >
                  {{
                    hubFeaturedEventsSaving[hub.id]
                      ? t('dashboard.hubFeaturedEventsSaving')
                      : t('dashboard.hubFeaturedEventsSave')
                  }}
                </button>
                <span v-if="hubFeaturedEventsSuccess[hub.id]" class="hub-save-success">
                  {{ t('dashboard.hubFeaturedEventsSaved') }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </section>
    </template>

    <!-- Not authenticated -->
    <div v-else class="card login-prompt">
      <div class="prompt-icon" aria-hidden="true">🔐</div>
      <h2>{{ t('dashboard.signInRequired') }}</h2>
      <p>{{ t('dashboard.pleaseLogIn') }}</p>
      <RouterLink to="/login" class="btn btn-primary">{{ t('dashboard.logIn') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
}

.page-header p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

/* ── KPI stats ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  font-size: 1.75rem;
  line-height: 1;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-raised);
}

.stat-info {
  min-width: 0;
}

.stat-number {
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}

.stat-number--success {
  color: #4ade80;
}

.stat-number--warning {
  color: var(--color-warning);
}

.stat-number--primary {
  color: var(--color-primary);
}

.stat-number--calendar {
  color: #a78bfa;
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.stat-helper {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  line-height: 1.3;
  opacity: 0.8;
}

/* ── Section header ── */
.section-header {
  margin-bottom: 0.75rem;
}

.section-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.section-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

/* ── Table ── */
.events-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
}

th {
  background: var(--color-surface-raised);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border);
}

th[title] {
  cursor: help;
}

td {
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: var(--color-surface-raised);
}

.event-link {
  font-weight: 500;
  color: var(--color-text);
}

.event-link:hover {
  color: var(--color-primary);
}

.event-name-plain {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.date-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.saves-count {
  font-weight: 600;
  color: var(--color-text);
}

/* ── Trend badge ── */
.trend-badge {
  display: inline-block;
  padding: 0.1875rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.trend--active {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
}

.trend--recent {
  background: rgba(19, 127, 236, 0.12);
  color: var(--color-primary);
}

.trend--quiet {
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
}

.actions-cell {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}

.btn-outline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.btn-outline:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
}

.btn-edit {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-edit:hover {
  background: rgba(19, 127, 236, 0.08);
}

.btn-sm {
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
}

.btn-sm-placeholder {
  display: inline-block;
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.text-muted {
  color: var(--color-text-secondary);
}

/* ── Low-data guidance ── */
.low-data-guidance {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.guidance-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

/* ── First-event welcome card ── */
.first-event-welcome {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
  background: rgba(19, 127, 236, 0.06);
  border: 1px solid rgba(19, 127, 236, 0.2);
  font-size: 0.875rem;
}

.first-event-welcome .guidance-icon {
  font-size: 1.5rem;
}

.first-event-welcome-detail {
  margin: 0.25rem 0 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* ── Per-event recommendation rows ── */
.event-recommendation-row td {
  background: transparent;
  border-bottom: 1px solid var(--color-border);
}

.event-recommendation-cell {
  padding: 0.5rem 1rem 0.625rem !important;
  font-size: 0.8125rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.rec-icon {
  flex-shrink: 0;
  font-size: 0.9375rem;
}

.rec-text {
  color: var(--color-text-secondary);
}

.rec-admin-notes {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  opacity: 0.85;
}

.event-recommendation-row.rec--rejected .rec-text {
  color: var(--color-danger, #f87171);
}

.event-recommendation-row.rec--pending .rec-text {
  color: var(--color-warning, #fbbf24);
}

.event-recommendation-row.rec--draft .rec-text {
  color: var(--color-text-secondary);
}

.event-recommendation-row.rec--urgent .rec-text {
  color: var(--color-warning, #fbbf24);
  font-weight: 600;
}

/* ── Stat timeframe badge ── */
.stat-timeframe {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  opacity: 0.6;
}

/* ── Empty states ── */
.empty-state {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.empty-state h3 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 600;
}

.empty-icon {
  font-size: 2.5rem;
}

/* ── Error state ── */
.error-state {
  padding: 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.error-icon {
  font-size: 2rem;
}

.error-message {
  color: var(--color-danger);
  font-size: 0.9375rem;
}

/* ── Skeleton loading ── */
.skeleton-icon {
  background: var(--color-surface-raised);
}

.skeleton-line {
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.skeleton-number {
  height: 1.875rem;
  width: 3rem;
  margin-bottom: 0.375rem;
}

.skeleton-short {
  height: 0.75rem;
  width: 6rem;
}

.skeleton-heading {
  height: 1.125rem;
  width: 10rem;
  margin-bottom: 0.75rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.skeleton-row:last-child {
  border-bottom: none;
}

.skeleton-cell {
  height: 0.875rem;
  flex: 2;
}

.skeleton-cell-sm {
  height: 0.875rem;
  flex: 1;
}

/* ── Login prompt ── */
.login-prompt {
  padding: 4rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.prompt-icon {
  font-size: 2.5rem;
}

.login-prompt h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.login-prompt p {
  color: var(--color-text-secondary);
}

/* ── Provider breakdown ── */
.provider-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.provider-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
  font-weight: 500;
  background: rgba(167, 139, 250, 0.12);
  color: #a78bfa;
  white-space: nowrap;
  cursor: default;
}

/* ── Hub management ── */
.hub-management-section {
  margin-top: 2.5rem;
}

.hub-card {
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.hub-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.hub-card-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.hub-card-logo {
  height: 40px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.hub-card-name {
  font-size: 1.0625rem;
  font-weight: 700;
  margin: 0 0 0.125rem;
}

.hub-card-description {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.hub-form-section {
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
  margin-top: 1.25rem;
}

.hub-form-section:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
}

.hub-form-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  margin: 0 0 1rem;
}

.hub-form-helper {
  margin: -0.5rem 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.hub-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.hub-form-grid--full {
  grid-template-columns: 1fr;
}

.hub-form-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hub-save-success {
  color: #4ade80;
  font-size: 0.875rem;
  font-weight: 500;
}

.hub-community-links-list {
  margin-bottom: 0.75rem;
}

.hub-community-link-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.hub-community-link-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: rgba(19, 127, 236, 0.15);
  color: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.hub-community-link-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.hub-community-link-info strong,
.hub-community-link-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-community-link-url,
.hub-community-links-empty {
  font-size: 0.75rem;
}

.hub-community-links-empty {
  padding: 0.5rem 0;
}

.hub-add-community-link-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 0.75rem;
}

.hub-featured-events-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hub-featured-event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-secondary, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.hub-featured-event-name {
  font-size: 0.875rem;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-featured-empty {
  font-size: 0.875rem;
  padding: 0.5rem 0;
  list-style: none;
}

.hub-add-featured-form {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.hub-featured-select {
  flex: 1;
  min-width: 180px;
}

.hub-featured-loading {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.hub-featured-error {
  margin-bottom: 0.5rem;
}

.hub-manage-error {
  color: var(--color-danger, #f87171);
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: 1rem;
}

.input-error {
  border-color: var(--color-danger, #f87171) !important;
  outline-color: var(--color-danger, #f87171);
}

.field-error {
  color: var(--color-danger, #f87171);
  font-size: 0.75rem;
  margin-top: 0.25rem;
  display: block;
}

/* ── My Communities ── */
.my-communities-section {
  margin-top: 2.5rem;
}

.communities-loading {
  padding: 1rem 0;
}

.communities-error.card {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  border-left: 3px solid var(--color-danger, #f87171);
}

.communities-error-message {
  margin: 0;
  color: var(--color-danger, #f87171);
  font-size: 0.9375rem;
}

.communities-empty.card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.communities-empty-title {
  font-weight: 600;
  margin: 0;
}

.communities-empty-hint {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin: 0 0 0.5rem;
}

.communities-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.community-item.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}

.community-item.card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.community-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.community-item-name {
  font-weight: 600;
  font-size: 1rem;
}

.community-item-summary {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.community-role-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2em 0.6em;
  border-radius: var(--radius-sm, 4px);
  flex-shrink: 0;
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
}

.community-role-badge.role--admin {
  background: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #137fec);
}

.community-role-badge.role--event_manager {
  background: var(--color-success-light, #dcfce7);
  color: var(--color-success, #16a34a);
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .col-saves,
  .col-momentum,
  .col-calendar,
  .col-cal-trend {
    display: none;
  }

  .hub-form-grid {
    grid-template-columns: 1fr;
  }

  .hub-add-community-link-form {
    grid-template-columns: 1fr;
  }
}
</style>
