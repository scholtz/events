<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import EventCard from '@/components/events/EventCard.vue'
import type { CatalogEvent, DomainCuratedCommunity, EventDomain } from '@/types'
import { gqlRequest, gqlRequestWithMeta } from '@/lib/graphql'
import { safeHexColor } from '@/lib/colorUtils'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import { useCommunitiesStore } from '@/stores/communities'
import { usePwa } from '@/composables/usePwa'
import { computeDiscoveryTrustState } from '@/lib/discoveryTrustState'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()
const domainsStore = useDomainsStore()
const communitiesStore = useCommunitiesStore()
const { isOffline } = usePwa()

const slug = computed(() => route.params.slug as string)

const domain = ref<EventDomain | null>(null)
const events = ref<CatalogEvent[]>([])
const featuredEvents = ref<CatalogEvent[]>([])
const curatedCommunities = ref<DomainCuratedCommunity[]>([])
const loading = ref(false)
const error = ref('')

/**
 * Data source for the last successful CategoryEvents fetch.
 * 'live' – response came from the network.
 * 'cache' – response was served from the service-worker IDB cache (X-PWA-Cache: HIT).
 * null – no successful fetch yet.
 */
const categoryDataSource = ref<'live' | 'cache' | null>(null)

/**
 * True once the first CategoryEvents fetch has succeeded.
 * Prevents clearing stale events when a background re-fetch fails.
 */
const hasFetchedOnce = ref(false)

/**
 * Named trust state for the category event list.
 * Driven by computeDiscoveryTrustState which maps the full combination of
 * network / cache / fetch-lifecycle inputs to one of six states:
 *   fresh | cached-offline | cached-sw | refreshing | refresh-failed | unavailable
 */
const categoryTrustState = computed(() =>
  computeDiscoveryTrustState({
    isOffline: isOffline.value,
    isLoading: loading.value,
    hasError: !!error.value,
    dataSource: categoryDataSource.value,
    hasCachedData: events.value.length > 0,
  }),
)

// Per-group join/request state tracking
// Initialized from persisted memberships on load, then updated reactively after actions.
type GroupMemberStatus = 'none' | 'active' | 'pending'
const groupMemberStatus = ref<Record<string, GroupMemberStatus>>({})
const groupActionLoading = ref<Record<string, boolean>>({})
const groupActionError = ref<Record<string, string | null>>({})

/** Load persisted membership state for the visible curated groups. */
async function loadMembershipStates(groupIds: string[]) {
  if (!authStore.isAuthenticated || groupIds.length === 0) return
  try {
    const memberships = await communitiesStore.fetchMyMemberships()
    const next: Record<string, GroupMemberStatus> = {}
    for (const m of memberships) {
      if (groupIds.includes(m.groupId)) {
        if (m.status === 'ACTIVE') next[m.groupId] = 'active'
        else if (m.status === 'PENDING') next[m.groupId] = 'pending'
      }
    }
    // Merge: preserve any states that were already set in-session (e.g. user just joined)
    groupMemberStatus.value = { ...next, ...groupMemberStatus.value }
  } catch {
    // Non-critical — fall back to 'none' (action buttons still work)
  }
}

async function handleJoinGroup(groupId: string) {
  groupActionLoading.value[groupId] = true
  groupActionError.value[groupId] = null
  try {
    await communitiesStore.joinGroup(groupId)
    groupMemberStatus.value[groupId] = 'active'
  } catch (err) {
    groupActionError.value[groupId] =
      err instanceof Error ? err.message : t('community.errorJoin')
  } finally {
    groupActionLoading.value[groupId] = false
  }
}

async function handleRequestAccess(groupId: string) {
  groupActionLoading.value[groupId] = true
  groupActionError.value[groupId] = null
  try {
    await communitiesStore.requestMembership(groupId)
    groupMemberStatus.value[groupId] = 'pending'
  } catch (err) {
    groupActionError.value[groupId] =
      err instanceof Error ? err.message : t('community.errorRequest')
  } finally {
    groupActionLoading.value[groupId] = false
  }
}

const EVENT_FIELDS = `
  id name slug description eventUrl
  venueName addressLine1 city countryCode
  latitude longitude startsAtUtc endsAtUtc
  submittedAtUtc updatedAtUtc publishedAtUtc
  adminNotes status isFree priceAmount currencyCode domainId mapUrl
  attendanceMode timezone
  domain { id name slug subdomain }
  submittedBy { displayName }
`

const DOMAIN_FIELDS = `id name slug subdomain description isActive createdAtUtc
  createdByUserId primaryColor accentColor logoUrl bannerUrl
  tagline overviewContent whatBelongsHere submitEventCta curatorCredit
  publishedEventCount
  links { id title url displayOrder }`

async function fetchCategoryData() {
  loading.value = true
  error.value = ''

  try {
    // Always fetch from API to ensure publishedEventCount and all branding fields are present
    const domainData = await gqlRequest<{ domainBySlug: EventDomain | null }>(
      `query DomainBySlug($slug: String!) {
        domainBySlug(slug: $slug) { ${DOMAIN_FIELDS} }
      }`,
      { slug: slug.value },
    )
    const foundDomain = domainData.domainBySlug
    domain.value = foundDomain

    if (!foundDomain) {
      return
    }

    // Fetch events and featured events in parallel
    const [eventsResult, featuredData, communitiesData] = await Promise.all([
      gqlRequestWithMeta<{ events: CatalogEvent[] }>(
        `query CategoryEvents($filter: EventFilterInput) {
          events(filter: $filter) { ${EVENT_FIELDS} }
        }`,
        { filter: { domainSlug: slug.value, sortBy: 'UPCOMING' } },
      ),
      gqlRequest<{ featuredEventsForDomain: CatalogEvent[] }>(
        `query FeaturedEventsForDomain($domainSlug: String!) {
          featuredEventsForDomain(domainSlug: $domainSlug) { ${EVENT_FIELDS} }
        }`,
        { domainSlug: slug.value },
      ),
      gqlRequest<{ curatedCommunitiesForDomain: DomainCuratedCommunity[] }>(
        `query CuratedCommunitiesForDomain($domainSlug: String!) {
          curatedCommunitiesForDomain(domainSlug: $domainSlug) {
            id groupId displayOrder isEnabled annotation upcomingPublishedEventCount
            group { id name slug summary visibility isActive createdAtUtc createdByUserId }
          }
        }`,
        { domainSlug: slug.value },
      ).catch(() => ({ curatedCommunitiesForDomain: [] })),
    ])
    events.value = eventsResult.data.events
    categoryDataSource.value = eventsResult.meta.fromCache ? 'cache' : 'live'
    featuredEvents.value = featuredData.featuredEventsForDomain
    curatedCommunities.value = communitiesData.curatedCommunitiesForDomain
    hasFetchedOnce.value = true

    // Initialize membership state from persisted data for authenticated users
    const groupIds = communitiesData.curatedCommunitiesForDomain.map((c) => c.groupId)
    await loadMembershipStates(groupIds)
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('category.errorLoad')
    categoryDataSource.value = null
    if (!hasFetchedOnce.value) {
      // Initial load failed: clear everything so the error state is shown
      events.value = []
      featuredEvents.value = []
      curatedCommunities.value = []
    }
    // On background re-fetch failure: preserve existing events so the user
    // can still browse while we show the refresh-failed trust notice.
  } finally {
    loading.value = false
  }
}

function resetCategoryState() {
  hasFetchedOnce.value = false
  events.value = []
  featuredEvents.value = []
  curatedCommunities.value = []
  domain.value = null
  error.value = ''
}

onMounted(fetchCategoryData)

watch(slug, () => {
  // Slug changed: reset to initial state before fetching new category
  resetCategoryState()
  fetchCategoryData()
})

// Auto-refresh when connectivity is restored and we already have cached events.
// This allows the page to show a "refreshing" then "fresh" (or "refresh-failed")
// state naturally after coming back online.
watch(isOffline, (offline, wasOffline) => {
  if (!offline && wasOffline && hasFetchedOnce.value) {
    fetchCategoryData()
  }
})

// Update document title for SEO
const pageTitle = computed(() =>
  domain.value
    ? t('category.pageTitle', { name: domain.value.name })
    : t('category.pageTitleDefault'),
)

watch(
  pageTitle,
  (title) => {
    if (typeof document !== 'undefined') {
      document.title = title
    }
  },
  { immediate: true },
)

// Update meta description for SEO
const metaDescription = computed(() => {
  if (!domain.value) return ''
  return (domain.value.description || domain.value.overviewContent || '').slice(0, 160)
})

/** The social sharing image: prefer banner, fall back to logo, fall back to null. */
const socialImage = computed(() => domain.value?.bannerUrl ?? domain.value?.logoUrl ?? null)

/**
 * Upsert a `<meta>` element in `<head>`.
 * @param attr - the attribute key used to identify/select the element ('name' or 'property')
 * @param attrValue - the value for the identifying attribute (e.g. 'description', 'og:title')
 * @param content - the content to set; pass '' to clear
 */
function setMetaTag(attr: 'name' | 'property', attrValue: string, content: string): void {
  if (typeof document === 'undefined') return
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${attrValue}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, attrValue)
    document.head.appendChild(el)
  }
  el.content = content
}

/** Syncs all SEO + social meta tags whenever domain data changes. */
function updateSeoTags(
  title: string,
  desc: string,
  image: string | null,
): void {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  // Standard meta
  setMetaTag('name', 'description', desc)
  // Open Graph
  setMetaTag('property', 'og:type', 'website')
  setMetaTag('property', 'og:title', title)
  setMetaTag('property', 'og:description', desc)
  setMetaTag('property', 'og:url', url)
  setMetaTag('property', 'og:image', image ?? '')
  // Twitter / X Cards
  setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMetaTag('name', 'twitter:title', title)
  setMetaTag('name', 'twitter:description', desc)
  setMetaTag('name', 'twitter:image', image ?? '')
}

watch(
  [pageTitle, metaDescription, socialImage],
  ([title, desc, image]) => updateSeoTags(title, desc, image),
  { immediate: true },
)

const upcomingCount = computed(() => {
  const now = new Date()
  return events.value.filter((e) => new Date(e.startsAtUtc) >= now).length
})

/**
 * True when the catalog has events but every event has already taken place.
 * Used to display a notice helping users understand why no upcoming events appear.
 */
const allEventsInPast = computed(
  () => events.value.length > 0 && upcomingCount.value === 0,
)

/** Featured event IDs set for fast deduplication in the main list */
const featuredEventIds = computed(() => new Set(featuredEvents.value.map((e) => e.id)))

/** All events excluding already-featured ones */
const nonFeaturedEvents = computed(() =>
  events.value.filter((e) => !featuredEventIds.value.has(e.id)),
)

const LOW_SIGNAL_THRESHOLD = 3

const lowSignalMessage = computed(() => {
  const count = events.value.length
  if (count === 0 || count > LOW_SIGNAL_THRESHOLD) return null
  return count === 1
    ? t('category.fewResultsOne')
    : t('category.fewResultsMany', { count })
})

/**
 * Related domain hubs surfaced when this hub's catalog is sparse (0–3 events).
 * Returns up to 3 other active domains so users have a broader discovery path
 * even when the current hub's inventory is thin.
 */
const MAX_RELATED_HUBS = 3

const relatedDomains = computed(() => {
  if (loading.value) return []
  // Show related hubs only when the catalog is sparse or empty
  if (events.value.length > LOW_SIGNAL_THRESHOLD) return []
  return domainsStore.domains
    .filter((d) => d.slug !== slug.value && d.isActive !== false)
    .slice(0, MAX_RELATED_HUBS)
})

/**
 * Subtle rank-context label explaining the current result ordering.
 * Category hubs always use UPCOMING sort (nearest upcoming first).
 * Shown only when there are results to rank.
 */
const rankContextLabel = computed(() =>
  events.value.length > 0 ? t('home.rankContextUpcoming') : null,
)

/**
 * Number of days ahead within which an event is labelled "Upcoming soon".
 * Kept narrow (7 days) so the cue genuinely signals immediacy.
 */
const UPCOMING_SOON_DAYS = 7

/**
 * Number of days after publication within which an event is labelled "Recently added".
 * A 14-day window aligns with the organizer analytics "newly published" threshold.
 */
const RECENTLY_ADDED_DAYS = 14

/**
 * Returns a per-event ranking-cue key that explains why this event appears where it does
 * within the hub's non-featured event grid:
 *
 * - `'upcomingSoon'`   — starts within the next UPCOMING_SOON_DAYS days
 * - `'recentlyAdded'`  — published within the last RECENTLY_ADDED_DAYS days (and not upcomingSoon)
 * - `null`             — no cue (event is beyond both thresholds)
 *
 * At most one label is shown per event to keep the UI calm and uncluttered.
 */
function rankCueForEvent(event: CatalogEvent): 'upcomingSoon' | 'recentlyAdded' | null {
  const now = new Date()
  const starts = new Date(event.startsAtUtc)
  const msDiff = starts.getTime() - now.getTime()
  const daysUntilStart = msDiff / (1000 * 60 * 60 * 24)

  if (daysUntilStart >= 0 && daysUntilStart <= UPCOMING_SOON_DAYS) return 'upcomingSoon'

  if (event.publishedAtUtc) {
    const published = new Date(event.publishedAtUtc)
    const msSincePublish = now.getTime() - published.getTime()
    const daysSincePublish = msSincePublish / (1000 * 60 * 60 * 24)
    if (daysSincePublish >= 0 && daysSincePublish <= RECENTLY_ADDED_DAYS) return 'recentlyAdded'
  }

  return null
}

/**
 * Non-featured events with their pre-computed ranking cues.
 * Computing the cue once per event (rather than calling rankCueForEvent twice in the template)
 * avoids redundant Date arithmetic.
 */
const nonFeaturedEventsWithCues = computed(() =>
  nonFeaturedEvents.value.map((event) => ({ event, cue: rankCueForEvent(event) })),
)

/** True when the authenticated user is a global admin or administers this specific domain hub. */
const isHubAdmin = computed(
  () =>
    authStore.isAuthenticated &&
    (authStore.isAdmin ||
      domainsStore.myManagedDomains.some((d: EventDomain) => d.slug === slug.value)),
)

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await domainsStore.fetchMyManagedDomains()
  }
})
</script>

<template>
  <div class="category-landing-view">
    <!-- Domain header -->
    <section
      class="category-hero"
      :style="[
        safeHexColor(domain?.primaryColor) ? `--category-color: ${safeHexColor(domain?.primaryColor)}` : '',
        safeHexColor(domain?.accentColor) ? `--category-accent-color: ${safeHexColor(domain?.accentColor)}` : '',
      ]"
    >
      <div class="container category-hero-content">
        <div class="category-hero-text">
          <nav class="category-breadcrumb" aria-label="Breadcrumb">
            <RouterLink to="/" class="breadcrumb-link">{{ t('category.allEvents') }}</RouterLink>
            <span class="breadcrumb-sep" aria-hidden="true">/</span>
            <span class="breadcrumb-current">{{ domain?.name ?? slug }}</span>
          </nav>

          <div v-if="loading" class="category-loading">
            <div class="loading-spinner" aria-hidden="true"></div>
            <span>{{ t('common.loading') }}</span>
          </div>

          <template v-else-if="domain">
            <div v-if="domain.logoUrl" class="category-logo-wrap">
              <img :src="domain.logoUrl" :alt="domain.name" class="category-logo" />
            </div>
            <h1 class="category-title">{{ t('category.heading', { name: domain.name }) }}</h1>
            <p v-if="domain.tagline" class="category-tagline">{{ domain.tagline }}</p>
            <p v-if="domain.description" class="category-description">{{ domain.description }}</p>
            <p class="category-event-count">
              {{
                domain.publishedEventCount !== undefined
                  ? (domain.publishedEventCount === 1
                      ? t('category.oneEvent')
                      : t('category.eventCount', { count: domain.publishedEventCount }))
                  : (upcomingCount === 1
                      ? t('category.oneUpcomingEvent')
                      : t('category.upcomingEventCount', { count: upcomingCount }))
              }}
            </p>
            <!-- Curator credit trust cue -->
            <p v-if="domain.curatorCredit" class="curator-credit">
              <span class="curator-icon" aria-hidden="true">✓</span>
              {{ t('category.curatedBy', { credit: domain.curatorCredit }) }}
            </p>
            <!-- Admin: manage hub link -->
            <RouterLink
              v-if="isHubAdmin"
              :to="`/hub/${domain.slug}/manage`"
              class="btn btn-outline btn-sm manage-hub-btn"
            >
              ⚙ {{ t('category.manageHub') }}
            </RouterLink>
          </template>

          <div v-else-if="!loading">
            <h1 class="category-title">{{ slug }}</h1>
          </div>
        </div>

        <div v-if="domain?.bannerUrl" class="category-banner-wrap">
          <img :src="domain.bannerUrl" :alt="domain.name" class="category-banner" />
        </div>
      </div>
    </section>

    <div class="container category-body">
      <!-- Error state: initial load failed with no cached data (unavailable) -->
      <div v-if="error && !events.length" class="results-state card error-state" role="alert">
        <div class="state-icon" aria-hidden="true">{{ isOffline ? '📡' : '⚠️' }}</div>
        <div>
          <h2>{{ isOffline ? t('home.errorOffline') : t('category.errorLoad') }}</h2>
          <p v-if="isOffline">{{ t('home.errorOfflineDescription') }}</p>
          <p v-else>{{ error }}</p>
        </div>
        <button class="btn btn-primary" @click="fetchCategoryData">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Not found state -->
      <div v-else-if="!loading && !error && !domain" class="results-state card empty-state">
        <div class="empty-icon">🔍</div>
        <h2>{{ t('category.notFound') }}</h2>
        <p>{{ t('category.notFoundDescription', { slug }) }}</p>
        <RouterLink to="/" class="btn btn-primary">{{ t('category.browseAll') }}</RouterLink>
      </div>

      <!-- Loading state: initial load, no cached data yet -->
      <div v-else-if="loading && !events.length" class="results-state card loading-state" aria-live="polite">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div>
          <h2>{{ t('common.loading') }}</h2>
        </div>
      </div>

      <!-- Events section: domain loaded, possibly with trust-state notices -->
      <template v-else-if="domain">
        <!-- Hub overview modules (About & What belongs here) -->
        <div v-if="domain?.overviewContent || domain?.whatBelongsHere" class="hub-overview-modules">
          <div v-if="domain.overviewContent" class="hub-module card">
            <h2 class="hub-module-title">
              <span class="hub-module-icon" aria-hidden="true">📌</span>
              {{ t('category.aboutHub') }}
            </h2>
            <p class="hub-module-body">{{ domain.overviewContent }}</p>
          </div>
          <div v-if="domain.whatBelongsHere" class="hub-module card">
            <h2 class="hub-module-title">
              <span class="hub-module-icon" aria-hidden="true">🎯</span>
              {{ t('category.whatBelongsHere') }}
            </h2>
            <p class="hub-module-body">{{ domain.whatBelongsHere }}</p>
          </div>
        </div>

        <!-- Community links section -->
        <div v-if="domain?.links?.length" class="community-links-section">
          <h2 class="community-links-title">
            <span class="community-links-icon" aria-hidden="true">🔗</span>
            {{ t('category.communityLinks') }}
          </h2>
          <ul class="community-links-list" aria-label="Community links">
            <li v-for="link in domain.links" :key="link.id" class="community-link-item">
              <a
                :href="link.url"
                class="community-link"
                target="_blank"
                rel="noopener noreferrer"
              >{{ link.title }}</a>
            </li>
          </ul>
        </div>

        <!-- Curated Community Groups section -->
        <section
          v-if="curatedCommunities.length"
          class="curated-communities-section"
          aria-labelledby="curated-communities-heading"
        >
          <h2 id="curated-communities-heading" class="curated-communities-title">
            <span class="curated-communities-icon" aria-hidden="true">🤝</span>
            {{ t('category.curatedCommunities') }}
          </h2>
          <p class="curated-communities-description">{{ t('category.curatedCommunitiesDescription') }}</p>
          <ul class="curated-communities-list" aria-label="Curated communities in this hub">
            <li
              v-for="entry in curatedCommunities"
              :key="entry.groupId"
              class="curated-community-card"
            >
              <div class="curated-community-card-content">
                <div class="curated-community-header">
                  <RouterLink
                    :to="`/community/${entry.group.slug}`"
                    class="curated-community-name"
                  >{{ entry.group.name }}</RouterLink>
                  <span
                    class="community-visibility-badge"
                    :class="entry.group.visibility === 'PUBLIC' ? 'visibility-public' : 'visibility-private'"
                    :aria-label="entry.group.visibility === 'PUBLIC' ? t('community.public') : t('community.private')"
                  >
                    {{ entry.group.visibility === 'PUBLIC' ? t('community.public') : t('community.private') }}
                  </span>
                </div>
                <p v-if="entry.group.summary" class="curated-community-summary">
                  {{ entry.group.summary }}
                </p>
                <p v-if="entry.annotation" class="curated-community-annotation">
                  {{ entry.annotation }}
                </p>
                <!-- Aggregate upcoming event count: privacy-safe, derived from published public events only -->
                <p
                  v-if="entry.upcomingPublishedEventCount !== undefined"
                  class="curated-community-event-count"
                  :class="{ 'curated-community-event-count--none': entry.upcomingPublishedEventCount === 0 }"
                >
                  <span class="curated-community-event-count-icon" aria-hidden="true">📅</span>
                  {{
                    entry.upcomingPublishedEventCount === 0
                      ? t('category.communityNoUpcomingEvents')
                      : entry.upcomingPublishedEventCount === 1
                        ? t('category.communityOneUpcomingEvent')
                        : t('category.communityUpcomingEventCount', { count: entry.upcomingPublishedEventCount })
                  }}
                </p>
                <p
                  v-if="groupActionError[entry.groupId]"
                  class="curated-community-error"
                  role="alert"
                >
                  {{ groupActionError[entry.groupId] }}
                </p>
              </div>
              <div class="curated-community-actions">
                <!-- "Explore community" is only meaningful for:
                     - public groups (always accessible)
                     - private groups where the current user is an active member -->
                <RouterLink
                  v-if="entry.group.visibility === 'PUBLIC' || groupMemberStatus[entry.groupId] === 'active'"
                  :to="`/community/${entry.group.slug}`"
                  class="curated-community-cta"
                >{{ t('category.exploreGroup') }}</RouterLink>

                <!-- Authenticated: show join/request/status -->
                <template v-if="authStore.isAuthenticated">
                  <span
                    v-if="groupMemberStatus[entry.groupId] === 'active'"
                    class="community-joined-badge"
                  >✓ {{ t('community.joined') }}</span>
                  <span
                    v-else-if="groupMemberStatus[entry.groupId] === 'pending'"
                    class="community-pending-badge"
                  >{{ t('community.pendingApproval') }}</span>
                  <button
                    v-else-if="entry.group.visibility === 'PUBLIC'"
                    class="btn btn-sm curated-community-join-btn"
                    :disabled="groupActionLoading[entry.groupId]"
                    @click="handleJoinGroup(entry.groupId)"
                  >
                    {{ groupActionLoading[entry.groupId] ? t('common.loading') : t('community.joinGroup') }}
                  </button>
                  <button
                    v-else
                    class="btn btn-sm curated-community-request-btn"
                    :disabled="groupActionLoading[entry.groupId]"
                    @click="handleRequestAccess(entry.groupId)"
                  >
                    {{ groupActionLoading[entry.groupId] ? t('common.loading') : t('community.requestAccess') }}
                  </button>
                </template>

                <!-- Anonymous: sign-in prompt -->
                <RouterLink
                  v-else
                  to="/login"
                  class="curated-community-signin"
                >{{ t('community.signIn') }}</RouterLink>
              </div>
            </li>
          </ul>
        </section>

        <!-- Featured Events section -->
        <section v-if="featuredEvents.length" class="featured-section" aria-labelledby="featured-heading">
          <div class="featured-header">
            <div>
              <h2 id="featured-heading" class="featured-title">
                <span class="featured-icon" aria-hidden="true">⭐</span>
                {{ t('category.featuredEventsHeading') }}
              </h2>
              <p class="featured-subheading">{{ t('category.featuredEventsSubheading') }}</p>
            </div>
          </div>
          <div class="featured-grid">
            <div v-for="event in featuredEvents" :key="event.id" class="featured-card-wrap">
              <span class="featured-badge" aria-label="Featured">⭐ {{ t('category.featuredEventsHeading') }}</span>
              <EventCard :event="event" />
            </div>
          </div>
        </section>

        <!-- Trust-state notices: driven by the full freshness model -->
        <!-- cached-offline / cached-sw: stale data while offline or served from SW IDB cache -->
        <div
          v-if="categoryTrustState === 'cached-offline' || categoryTrustState === 'cached-sw'"
          role="status"
          aria-live="polite"
          class="cached-results-notice"
        >
          <span aria-hidden="true">📡</span>
          <span>{{ t('home.cachedResultsNotice') }}</span>
        </div>
        <!-- refreshing: background re-fetch in progress, stale results still visible -->
        <div
          v-else-if="categoryTrustState === 'refreshing'"
          role="status"
          aria-live="polite"
          class="refreshing-notice"
        >
          <span class="refreshing-spinner" aria-hidden="true"></span>
          <span>{{ t('home.refreshingResults') }}</span>
        </div>
        <!-- refresh-failed: re-fetch failed, old events preserved -->
        <div
          v-else-if="categoryTrustState === 'refresh-failed'"
          role="status"
          aria-live="polite"
          aria-label="Refresh failed, showing cached results"
          class="cached-results-notice"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{{ t('home.cachedResultsNotice') }}</span>
          <button class="btn btn-sm" @click="fetchCategoryData">{{ t('common.tryAgain') }}</button>
        </div>

        <div class="category-filters-row">
          <p class="results-summary" role="status" aria-live="polite">
            {{
              events.length === 1
                ? t('category.oneEventFoundInHub', { name: domain?.name ?? slug })
                : t('category.eventsFoundInHub', { count: events.length, name: domain?.name ?? slug })
            }}
          </p>
          <RouterLink :to="`/?domain=${slug}`" class="btn btn-outline btn-sm">
            {{ t('category.filterAndExplore') }}
          </RouterLink>
        </div>

        <div v-if="rankContextLabel" class="rank-context-badge" aria-live="polite">
          {{ rankContextLabel }}
        </div>

        <div v-if="allEventsInPast" class="all-in-past-notice" role="status" aria-live="polite">
          <span class="all-in-past-icon" aria-hidden="true">⏳</span>
          <span class="all-in-past-text">{{ t('category.allEventsInPast') }}</span>
          <RouterLink to="/" class="btn btn-sm all-in-past-action">
            {{ t('category.allEventsInPastBrowse') }}
          </RouterLink>
        </div>

        <div v-if="lowSignalMessage" class="low-signal-notice" role="status" aria-live="polite">
          <span class="low-signal-icon" aria-hidden="true">🌱</span>
          <span class="low-signal-text">{{ lowSignalMessage }}</span>
          <RouterLink to="/" class="btn btn-sm low-signal-action">
            {{ t('home.lowSignalBrowseAll') }}
          </RouterLink>
        </div>

        <div v-if="events.length" class="events-grid">
          <div v-for="{ event, cue } in nonFeaturedEventsWithCues" :key="event.id" class="event-card-wrap">
            <span
              v-if="cue === 'upcomingSoon'"
              class="rank-cue-badge rank-cue-badge--upcoming"
            >⚡ {{ t('category.rankCueUpcomingSoon') }}</span>
            <span
              v-else-if="cue === 'recentlyAdded'"
              class="rank-cue-badge rank-cue-badge--recent"
            >✨ {{ t('category.rankCueRecentlyAdded') }}</span>
            <EventCard :event="event" />
          </div>
          <!-- If all events are featured, show a note instead of an empty grid -->
          <p
            v-if="!nonFeaturedEventsWithCues.length && featuredEvents.length"
            class="all-featured-note text-secondary"
          >
            {{ t('category.eventsFound', { count: events.length }) }}
          </p>
        </div>

        <!-- Hub-level empty state: hub exists but has no upcoming events -->
        <div v-else class="results-state card empty-state">
          <div class="empty-icon">📅</div>
          <h2>{{ t('category.noEvents') }}</h2>
          <p>{{ t('category.noEventsHubDescription', { name: domain?.name ?? '' }) }}</p>
          <div class="empty-state-actions">
            <RouterLink :to="`/?domain=${slug}`" class="btn btn-outline">
              {{ t('category.filterAndExplore') }}
            </RouterLink>
            <RouterLink to="/" class="btn btn-ghost">{{ t('category.browseAll') }}</RouterLink>
          </div>
        </div>

        <!-- Related hubs: shown when this hub's catalog is sparse or empty to guide users toward adjacent communities -->
        <section
          v-if="relatedDomains.length"
          class="related-hubs"
          aria-labelledby="related-hubs-heading"
        >
          <h3 id="related-hubs-heading" class="related-hubs-title">
            {{ t('category.relatedHubsTitle') }}
          </h3>
          <p class="related-hubs-desc">{{ t('category.relatedHubsDesc') }}</p>
          <div class="related-hub-cards">
            <RouterLink
              v-for="hub in relatedDomains"
              :key="hub.id"
              :to="`/category/${hub.slug}`"
              class="related-hub-card"
            >
              <div class="related-hub-icon" aria-hidden="true">🏷️</div>
              <div class="related-hub-info">
                <strong class="related-hub-name">{{ hub.name }}</strong>
                <span v-if="hub.description" class="related-hub-desc">{{ hub.description }}</span>
                <span class="related-hub-cta">{{ t('category.relatedHubCta', { name: hub.name }) }}</span>
              </div>
            </RouterLink>
          </div>
        </section>

        <!-- Organizer submission CTA -->
        <div class="organizer-cta">
          <p class="organizer-cta-text">
            {{ domain?.submitEventCta || t('category.submitEventCtaDefault', { name: domain?.name ?? slug }) }}
          </p>
          <RouterLink to="/submit" class="btn btn-primary">
            {{ t('category.submitEvent') }}
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.category-hero {
  --category-color: var(--color-primary);
  --category-accent-color: var(--color-primary);
  background: linear-gradient(160deg, #0d0f14 0%, rgba(19, 127, 236, 0.12) 100%);
  border-bottom: 3px solid var(--category-color);
  padding: 2.5rem 0 2rem;
}

.category-hero-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}

.category-hero-text {
  flex: 1;
  min-width: 0;
}

.category-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
}

.breadcrumb-link {
  color: var(--color-primary);
  text-decoration: none;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-sep {
  color: var(--color-text-secondary);
}

.breadcrumb-current {
  color: var(--color-text);
  font-weight: 500;
}

.category-logo-wrap {
  margin-bottom: 1rem;
}

.category-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.category-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin-bottom: 0.5rem;
  color: var(--color-text);
}

.category-tagline {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--category-color, var(--color-text-secondary));
  max-width: 560px;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.category-description {
  font-size: 1rem;
  color: var(--color-text-secondary);
  max-width: 560px;
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.category-event-count {
  font-size: 0.9375rem;
  color: var(--category-color);
  font-weight: 600;
}

.category-banner-wrap {
  flex-shrink: 0;
}

.category-banner {
  width: 240px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.category-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.category-body {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.category-filters-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.results-summary {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Offline or SW-cache notice: shown above the event grid when data may be stale */
.cached-results-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  margin-bottom: 0.75rem;
  background: rgba(59, 130, 246, 0.07);
  color: var(--color-text-secondary);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  flex-wrap: wrap;
  align-items: center;
}

/* Background refresh in progress: shown when a re-fetch is triggered with stale data still visible */
.refreshing-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  margin-bottom: 0.75rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.refreshing-spinner {
  display: inline-block;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 999px;
  border: 2px solid rgba(19, 127, 236, 0.2);
  border-top-color: var(--color-primary);
  animation: spin 0.9s linear infinite;
  flex-shrink: 0;
}

/* Subtle label explaining current sort order on this hub */
.rank-context-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  color: var(--color-text-muted, #9ca3af);
  background: var(--color-surface-raised, #1e2130);
  border: 1px solid var(--color-border, #2a2d3a);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  margin-bottom: 0.75rem;
  letter-spacing: 0.01em;
}

/* Low-signal notice: only a handful of events in this hub */
.low-signal-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
}

.low-signal-icon {
  flex-shrink: 0;
  line-height: 1.4;
}

/* All-events-in-past notice: shown when every visible event has already taken place */
.all-in-past-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  flex-wrap: wrap;
}

.all-in-past-icon {
  flex-shrink: 0;
  line-height: 1.4;
}

.all-in-past-text {
  flex: 1;
  min-width: 0;
}

.all-in-past-action {
  flex-shrink: 0;
  font-size: 0.75rem;
  padding: 0.25rem 0.625rem;
  white-space: nowrap;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  text-decoration: none;
}

.all-in-past-action:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.results-state {
  padding: 2rem;
  display: grid;
  gap: 1rem;
}

.loading-state {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.loading-spinner {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 3px solid rgba(19, 127, 236, 0.15);
  border-top-color: var(--color-primary);
  animation: spin 0.9s linear infinite;
}

.state-icon {
  font-size: 1.75rem;
}

.empty-state {
  text-align: center;
  justify-items: center;
}

.empty-state-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.empty-icon {
  font-size: 2.5rem;
}

.error-state {
  grid-template-columns: auto 1fr auto;
  align-items: center;
}

/* ── Curator credit ─────────────────────────────────────── */
.curator-credit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.5rem;
}

.curator-icon {
  color: var(--category-color);
  font-size: 0.9375rem;
}

/* ── Hub overview modules ────────────────────────────────── */
.hub-overview-modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.hub-module {
  padding: 1.25rem 1.5rem;
  border-left: 3px solid var(--category-accent-color);
}

.hub-module-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.625rem;
  color: var(--color-text);
}

.hub-module-icon {
  font-size: 1.125rem;
}

.hub-module-body {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.65;
  margin: 0;
}

/* ── Community links section ─────────────────────────────── */
.community-links-section {
  margin-bottom: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
}

.community-links-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--color-text);
}

.community-links-icon {
  font-size: 1.125rem;
}

.community-links-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.community-link-item {
  display: inline-flex;
}

.community-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--color-primary);
  text-decoration: none;
  padding: 0.3rem 0.75rem;
  border: 1px solid rgba(19, 127, 236, 0.3);
  border-radius: var(--radius-sm);
  background: rgba(19, 127, 236, 0.06);
  transition: background 0.15s, border-color 0.15s;
}

.community-link:hover {
  background: rgba(19, 127, 236, 0.12);
  border-color: rgba(19, 127, 236, 0.5);
  text-decoration: underline;
}

/* ── Featured events section ─────────────────────────────── */
.featured-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: rgba(255, 215, 0, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: var(--radius-md);
}

.featured-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  gap: 1rem;
}

.featured-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.featured-icon {
  font-size: 1.125rem;
}

.featured-subheading {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.featured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.featured-card-wrap {
  position: relative;
}

.featured-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #b8860b;
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.5rem;
  margin-bottom: 0.5rem;
}

/* ── Per-event ranking cue badges ────────────────────────── */
/* Wrap each non-featured event card so we can prepend a ranking cue badge */
.event-card-wrap {
  display: flex;
  flex-direction: column;
}

/* Base styles shared by all ranking cue badge variants */
.rank-cue-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.5rem;
  margin-bottom: 0.375rem;
}

/* "Upcoming soon" — warm accent (amber/orange) to convey immediacy */
.rank-cue-badge--upcoming {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* "Recently added" — cool accent (blue/teal) to convey freshness */
.rank-cue-badge--recent {
  color: var(--color-primary, #137fec);
  background: rgba(19, 127, 236, 0.1);
  border: 1px solid rgba(19, 127, 236, 0.25);
}

.all-featured-note {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

/* ── Organizer CTA ───────────────────────────────────────── */
.organizer-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding: 1.25rem 1.5rem;
  background: rgba(19, 127, 236, 0.06);
  border: 1px solid rgba(19, 127, 236, 0.18);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.organizer-cta-text {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin: 0;
  flex: 1;
  min-width: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .category-hero-content {
    flex-direction: column;
  }

  .category-banner-wrap {
    display: none;
  }

  .category-title {
    font-size: 1.5rem;
  }

  .error-state {
    grid-template-columns: 1fr;
  }

  .organizer-cta {
    flex-direction: column;
    align-items: flex-start;
  }

  .hub-overview-modules {
    grid-template-columns: 1fr;
  }

  .featured-grid {
    grid-template-columns: 1fr;
  }
}

.manage-hub-btn {
  margin-top: 0.75rem;
  align-self: flex-start;
}

/* ── Curated communities section ─────────────────────────────── */
.curated-communities-section {
  margin-bottom: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
}

.curated-communities-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.375rem;
  color: var(--color-text);
}

.curated-communities-icon {
  font-size: 1.125rem;
}

.curated-communities-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0 0 1rem;
}

.curated-communities-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.curated-community-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface, rgba(255, 255, 255, 0.02));
  transition: border-color 0.15s;
}

.curated-community-card:hover {
  border-color: var(--category-color, var(--color-primary, #3b82f6));
}

.curated-community-card-content {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.curated-community-name {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--color-text);
  text-decoration: none;
}

.curated-community-name:hover {
  text-decoration: underline;
  color: var(--category-color, var(--color-primary, #3b82f6));
}

.curated-community-summary {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.curated-community-annotation {
  font-size: 0.8125rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  margin: 0;
  font-style: italic;
  line-height: 1.5;
}

.curated-community-event-count {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.curated-community-event-count--none {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
  font-style: italic;
}

.curated-community-event-count-icon {
  font-size: 0.75rem;
}

.curated-community-cta {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--category-color, var(--color-primary, #3b82f6));
  text-decoration: none;
  align-self: flex-start;
}

.curated-community-cta:hover {
  text-decoration: underline;
}

/* ── Community card header row (name + visibility badge) ─── */
.curated-community-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Community visibility badge ──────────────────────────── */
.community-visibility-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.visibility-public {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.visibility-private {
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
  border: 1px solid rgba(234, 179, 8, 0.25);
}

/* ── Community card actions row ──────────────────────────── */
.curated-community-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

/* Join button: compact inline-style for the hub card */
.curated-community-join-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  background: var(--category-color, var(--color-primary, #3b82f6));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.15s;
}

.curated-community-join-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.curated-community-join-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Request access button: secondary style */
.curated-community-request-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 500;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.curated-community-request-btn:hover:not(:disabled) {
  border-color: var(--color-text-secondary);
  color: var(--color-text);
}

.curated-community-request-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Joined / pending state badges */
.community-joined-badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: #4ade80;
}

.community-pending-badge {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Error message below the summary */
.curated-community-error {
  font-size: 0.75rem;
  color: var(--color-error, #f87171);
  margin: 0;
}

/* Sign-in link for anonymous users */
.curated-community-signin {
  font-size: 0.75rem;
  color: var(--color-primary);
  text-decoration: none;
}

.curated-community-signin:hover {
  text-decoration: underline;
}

/* ── Related hubs section (low-signal / empty state discovery path) ── */
.related-hubs {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
}

.related-hubs-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.375rem;
  color: var(--color-text);
}

.related-hubs-desc {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0 0 1rem;
}

.related-hub-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.related-hub-card {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface, rgba(255, 255, 255, 0.02));
  text-decoration: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.related-hub-card:hover {
  border-color: var(--category-color, var(--color-primary, #3b82f6));
  background: var(--color-surface-hover, rgba(255, 255, 255, 0.05));
}

.related-hub-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  line-height: 1.4;
}

.related-hub-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.related-hub-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.related-hub-desc {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.related-hub-cta {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--category-color, var(--color-primary, #3b82f6));
  margin-top: 0.125rem;
}
</style>
