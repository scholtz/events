<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { formatDiscoveryChipLabel } from '@/lib/discoveryLabels'
import {
  areEventFiltersEqual,
  createDefaultEventFilters,
  eventFiltersFromQuery,
  eventFiltersToQuery,
  useEventsStore,
} from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'
import { useSavedSearchesStore } from '@/stores/savedSearches'
import { useDiscoveryAnalytics } from '@/composables/useDiscoveryAnalytics'
import { buildMainSiteUrl, formatMainSiteHost, useSubdomain } from '@/composables/useSubdomain'
import { usePwa } from '@/composables/usePwa'
import EventCard from '@/components/events/EventCard.vue'
import EventFilters from '@/components/events/EventFilters.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const domainsStore = useDomainsStore()
const eventsStore = useEventsStore()
const savedSearchesStore = useSavedSearchesStore()
const { trackSearch, trackFilterChange, trackFilterClear } = useDiscoveryAnalytics()
const { activeDomain, isSubdomainView } = useSubdomain()
const mainSiteUrl = computed(() => buildMainSiteUrl())
const mainSiteHost = computed(() => formatMainSiteHost())
const { isOffline } = usePwa()

const syncingFromRoute = ref(false)
// Prevents the route watcher from triggering syncFromRoute when the URL was just
// updated by the store watcher.  Avoids double-fetch and double-analytics.
const skipNextRouteSync = ref(false)

/** Guard against CSS injection: only allow valid 3- or 6-digit hex colors. */
function safeHexColor(value: string | null | undefined): string | null {
  if (!value) return null
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim()) ? value.trim() : null
}

/** Truncated overview snippet for the subdomain hub header (max 200 chars). */
const overviewSnippet = computed(() => {
  const text = activeDomain.value?.overviewContent
  if (!text) return null
  return text.length > 200 ? text.slice(0, 200).trimEnd() + '…' : text
})

const mapCenter = computed(() => {
  const firstEvent = eventsStore.discoveryEvents[0]
  if (!firstEvent) return null
  const lat = Number(firstEvent.latitude)
  const lng = Number(firstEvent.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null
  }
  return {
    lat,
    lng,
    label: firstEvent.venueName || firstEvent.city || firstEvent.name,
    mapUrl: firstEvent.mapUrl,
  }
})

function mapUrl(lat: number, lng: number): string {
  const safeLat = Math.min(90, Math.max(-90, lat))
  const safeLng = Math.min(180, Math.max(-180, lng))
  return `https://www.openstreetmap.org/export/embed.html?bbox=${safeLng - 0.02},${safeLat - 0.02},${safeLng + 0.02},${safeLat + 0.02}&layer=mapnik&marker=${safeLat},${safeLng}`
}

async function syncFromRoute() {
  syncingFromRoute.value = true

  const nextFilters = eventFiltersFromQuery(route.query)

  // When on a category subdomain, force-filter by that domain's slug
  if (activeDomain.value && !nextFilters.domain) {
    nextFilters.domain = activeDomain.value.slug
  }

  if (!areEventFiltersEqual(nextFilters, eventsStore.filters)) {
    eventsStore.replaceFilters(nextFilters)
  }

  await eventsStore.fetchDiscoveryEvents()
  // Set to false AFTER the fetch so that any store-watcher fires triggered by
  // replaceFilters above (which run during the await) see syncingFromRoute=true
  // and return early, preventing a double-fetch and spurious analytics.
  syncingFromRoute.value = false
}

watch(
  () => route.query,
  async () => {
    if (skipNextRouteSync.value) {
      // The URL was just updated by the store watcher.  Skip this one invocation
      // to avoid a second syncFromRoute call (and double-fetch) for the same change.
      skipNextRouteSync.value = false
      return
    }
    await syncFromRoute()
  },
  { immediate: true },
)

watch(
  () => ({ ...eventsStore.filters }),
  async (filters, oldFilters) => {
    if (syncingFromRoute.value) return

    const nextQuery = eventFiltersToQuery(filters)
    const currentFilters = eventFiltersFromQuery(route.query)

    if (!areEventFiltersEqual(filters, currentFilters)) {
      // Signal the route watcher to skip its next invocation so it doesn't
      // trigger a redundant syncFromRoute after this URL update.
      skipNextRouteSync.value = true
      await router.replace({ query: nextQuery })
      // Don't return — continue to fetch events and track analytics below.
    }

    await eventsStore.fetchDiscoveryEvents()

    // Emit analytics only when a user-driven filter change occurred
    if (!oldFilters || areEventFiltersEqual(filters, oldFilters)) return

    const resultCount = eventsStore.discoveryEvents.length
    const activeFilterCount = eventsStore.activeFilterChips.length

    if (areEventFiltersEqual(filters, createDefaultEventFilters())) {
      // All filters were cleared (e.g. "Clear all" was pressed)
      trackFilterClear(resultCount)
    } else if (filters.search !== oldFilters.search) {
      // Keyword specifically changed → SEARCH action
      trackSearch(activeFilterCount, resultCount)
    } else {
      // Other filter changed (domain, date, location, price, mode, sort)
      trackFilterChange(activeFilterCount, resultCount)
    }
  },
  { deep: true },
)

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (isAuthenticated) {
      await savedSearchesStore.fetchSavedSearches()
      return
    }

    savedSearchesStore.clearSavedSearches()
  },
  { immediate: true },
)

function clearDiscoveryFilters() {
  eventsStore.clearFilters()
}

const resultsSummary = computed(() => {
  const count = eventsStore.discoveryEvents.length

  if (!eventsStore.hasActiveFilters) {
    return count === 1 ? t('home.resultsAvailableOne') : t('home.resultsAvailableMany', { count })
  }

  const filterLabels = eventsStore.activeFilterChips
    .filter((chip) => chip.key !== 'sortBy')
    .map((chip) =>
      formatDiscoveryChipLabel(
        chip,
        eventsStore.filters,
        t,
        (slug) => domainsStore.domains.find((domain) => domain.slug === slug)?.name,
      ),
    )
    .filter(Boolean)

  if (filterLabels.length === 0) {
    return count === 1 ? t('home.resultsFoundOne') : t('home.resultsFoundMany', { count })
  }

  return count === 1
    ? t('home.resultsMatchingOne', { filters: filterLabels.join(', ') })
    : t('home.resultsMatchingMany', { count, filters: filterLabels.join(', ') })
})

const LOW_SIGNAL_THRESHOLD = 3

const lowSignalMessage = computed(() => {
  const count = eventsStore.discoveryEvents.length
  if (count === 0 || count > LOW_SIGNAL_THRESHOLD) return null
  return count === 1
    ? t('home.fewResultsOne')
    : t('home.fewResultsMany', { count })
})

const emptyStateMessage = computed(() => {
  if (!eventsStore.hasActiveFilters) {
    return t('home.emptyNoEvents')
  }

  const filters = eventsStore.filters
  const chips = eventsStore.activeFilterChips.filter((c) => c.key !== 'sortBy')
  const filterCount = chips.length

  if (filterCount === 1) {
    const chip = chips[0]
    if (!chip) {
      return t('home.emptyGeneric')
    }
    if (chip.key === 'location') {
      return t('home.emptyLocation', { location: filters.location })
    }
    if (chip.key === 'search') {
      return t('home.emptySearch', { search: filters.search })
    }
    if (chip.key === 'attendanceMode') {
      if (filters.attendanceMode === 'IN_PERSON') return t('home.emptyModeInPerson')
      if (filters.attendanceMode === 'ONLINE') return t('home.emptyModeOnline')
      return t('home.emptyModeHybrid')
    }
    if (chip.key === 'priceType') {
      return filters.priceType === 'FREE' ? t('home.emptyPriceFree') : t('home.emptyPricePaid')
    }
    if (chip.key === 'dateFrom' || chip.key === 'dateTo') {
      return t('home.emptyDate')
    }
    if (chip.key === 'domain') {
      return t('home.emptyDomain')
    }
    if (chip.key === 'timezone') {
      return t('home.emptyTimezone', { timezone: filters.timezone })
    }
  }

  if (filterCount > 1) {
    return t('home.emptyMultiple', { count: filterCount })
  }

  return t('home.emptyGeneric')
})
</script>

<template>
  <div class="home-view">
    <section
      v-if="isSubdomainView && activeDomain"
      class="subdomain-header"
      :style="[
        safeHexColor(activeDomain.primaryColor) ? `--subdomain-color: ${safeHexColor(activeDomain.primaryColor)}` : '',
        safeHexColor(activeDomain.accentColor) ? `--subdomain-accent: ${safeHexColor(activeDomain.accentColor)}` : '',
      ]"
    >
      <div class="container subdomain-header-content">
        <div class="subdomain-hero-main">
          <!-- Domain logo -->
          <div v-if="activeDomain.logoUrl" class="subdomain-logo-wrap">
            <img :src="activeDomain.logoUrl" :alt="activeDomain.name" class="subdomain-logo" />
          </div>
          <div class="subdomain-hero-text">
            <h1>{{ activeDomain.name }} Events</h1>
            <p v-if="activeDomain.description" class="subdomain-description">
              {{ activeDomain.description }}
            </p>
            <!-- Curator credit trust cue -->
            <p v-if="activeDomain.curatorCredit" class="subdomain-curator-credit">
              <span class="subdomain-curator-icon" aria-hidden="true">✓</span>
              {{ t('home.subdomainCuratedBy', { credit: activeDomain.curatorCredit }) }}
            </p>
            <!-- Hub overview snippet -->
            <p v-if="overviewSnippet" class="subdomain-overview-snippet">
              {{ overviewSnippet }}
            </p>
            <!-- Action links -->
            <div class="subdomain-links">
              <RouterLink
                :to="`/category/${activeDomain.slug}`"
                class="btn btn-outline btn-sm subdomain-hub-link"
              >
                {{ t('home.subdomainViewFullHub') }}
              </RouterLink>
              <a :href="mainSiteUrl" class="main-site-link">
                {{ t('home.allEventsOn', { host: mainSiteHost }) }}
              </a>
            </div>
          </div>
        </div>
        <!-- Banner image -->
        <div v-if="activeDomain.bannerUrl" class="subdomain-banner-wrap">
          <img :src="activeDomain.bannerUrl" :alt="activeDomain.name" class="subdomain-banner" />
        </div>
      </div>
    </section>
    <section v-else class="hero">
      <div class="hero-video-wrapper" aria-hidden="true">
        <div class="hero-video-overlay">
          <div class="hero-video-uplayer"></div>
          <video autoplay muted loop playsinline class="hero-video">
            <source src="/videos/background-1.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
      <div class="container hero-content">
        <div class="hero-text">
          <h1>
            {{ t('home.heroTitle') }}<br /><span class="hero-accent">{{
              t('home.heroAccent')
            }}</span>
          </h1>
          <p>{{ t('home.heroDescription') }}</p>
          <RouterLink to="/submit" class="btn btn-primary hero-cta">{{
            t('home.heroCta')
          }}</RouterLink>
        </div>
        <div class="hero-stat-row">
          <div class="hero-stat">
            <span class="hero-stat-num">{{ eventsStore.discoveryEvents.length }}</span>
            <span class="hero-stat-label">{{ t('home.matchingEvents') }}</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container catalog-section">
      <EventFilters />
      <div class="catalog-layout">
        <div class="results-column">
          <div
            v-if="eventsStore.discoveryLoading"
            class="results-state card loading-state"
            aria-live="polite"
          >
            <div class="loading-spinner" aria-hidden="true"></div>
            <div>
              <h2>{{ t('home.updatingResults') }}</h2>
              <p>{{ t('home.updatingDescription') }}</p>
            </div>
          </div>

          <div
            v-else-if="eventsStore.discoveryError"
            class="results-state card error-state"
            role="alert"
          >
            <div class="state-icon" aria-hidden="true">{{ isOffline ? '📡' : '⚠️' }}</div>
            <div>
              <h2>{{ isOffline ? t('home.errorOffline') : t('home.errorLoad') }}</h2>
              <p v-if="isOffline">{{ t('home.errorOfflineDescription') }}</p>
              <p v-else>{{ eventsStore.discoveryError }}</p>
            </div>
            <div class="state-actions">
              <button class="btn btn-primary" @click="eventsStore.fetchDiscoveryEvents()">
                {{ t('common.tryAgain') }}
              </button>
              <button
                v-if="eventsStore.hasActiveFilters"
                class="btn btn-outline"
                @click="clearDiscoveryFilters"
              >
                {{ t('home.clearFilters') }}
              </button>
            </div>
          </div>

          <template v-else-if="eventsStore.discoveryEvents.length">
            <div v-if="isOffline" role="status" aria-live="polite" class="cached-results-notice">
              <span aria-hidden="true">📡</span>
              {{ t('home.cachedResultsNotice') }}
            </div>
            <p class="results-summary" role="status" aria-live="polite">
              {{ resultsSummary }}
            </p>
            <div v-if="lowSignalMessage" class="low-signal-notice" role="status" aria-live="polite">
              <span class="low-signal-icon" aria-hidden="true">🌱</span>
              {{ lowSignalMessage }}
            </div>
            <div class="events-grid">
              <EventCard
                v-for="event in eventsStore.discoveryEvents"
                :key="event.id"
                :event="event"
              />
            </div>
          </template>

          <div v-else class="results-state empty-state card">
            <div class="empty-icon">🔍</div>
            <h2>{{ t('home.noEventsFound') }}</h2>
            <p>{{ emptyStateMessage }}</p>
            <div class="state-actions">
              <button
                v-if="eventsStore.hasActiveFilters"
                class="btn btn-primary"
                @click="clearDiscoveryFilters"
              >
                {{ t('home.clearFilters') }}
              </button>
              <RouterLink v-else to="/submit" class="btn btn-primary">{{
                t('home.submitAnEvent')
              }}</RouterLink>
            </div>
          </div>
        </div>

        <aside class="map-panel card">
          <h2 class="map-title">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fill-rule="evenodd"
                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                clip-rule="evenodd"
              />
            </svg>
            {{ t('home.mapContext') }}
          </h2>
          <p v-if="mapCenter" class="map-caption">
            {{ t('home.mapShowing', { label: mapCenter.label }) }}
          </p>
          <iframe
            v-if="mapCenter"
            :src="mapUrl(mapCenter.lat, mapCenter.lng)"
            :title="t('home.mapContext')"
            loading="lazy"
            sandbox="allow-scripts"
          ></iframe>
          <div v-if="mapCenter" class="map-actions">
            <a :href="mapCenter.mapUrl" target="_blank" rel="noopener noreferrer" class="map-link">
              {{ t('home.mapOpenOsm') }}
            </a>
          </div>
          <p v-else-if="!eventsStore.hasActiveFilters" class="map-empty">
            {{ t('home.mapEmptyDefault') }}
          </p>
          <p v-else class="map-empty">{{ t('home.mapEmptyFilters') }}</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #0d0f14 0%, rgba(19, 127, 236, 0.12) 100%);
  border-bottom: 1px solid var(--color-border);
  padding: 4rem 0 3rem;
  margin-bottom: 0;
  position: relative;
}

.subdomain-header {
  --subdomain-color: var(--color-primary);
  --subdomain-accent: var(--color-primary);
  background: linear-gradient(160deg, #0d0f14 0%, rgba(19, 127, 236, 0.08) 100%);
  border-bottom: 3px solid var(--subdomain-color);
  padding: 2rem 0 1.75rem;
  margin-bottom: 0;
}

.subdomain-header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}

.subdomain-hero-main {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

.subdomain-logo-wrap {
  flex-shrink: 0;
}

.subdomain-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.subdomain-hero-text {
  min-width: 0;
}

.subdomain-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
  color: var(--color-text);
}

.subdomain-description {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin-bottom: 0.5rem;
  max-width: 560px;
  line-height: 1.6;
}

.subdomain-curator-credit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.subdomain-curator-icon {
  color: var(--subdomain-color);
  font-size: 0.9375rem;
}

.subdomain-overview-snippet {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.65;
  max-width: 540px;
  margin-bottom: 0.75rem;
}

.subdomain-links {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.subdomain-hub-link {
  font-size: 0.875rem;
}

.subdomain-banner-wrap {
  flex-shrink: 0;
}

.subdomain-banner {
  width: 220px;
  height: 130px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.main-site-link {
  flex-shrink: 0;
  color: var(--color-primary);
  font-size: 0.9375rem;
  font-weight: 600;
}

.main-site-link:hover {
  text-decoration: underline;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.hero-video-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.hero-text h1 {
  font-size: 2.75rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: 0.875rem;
  color: var(--color-text);
}

.hero-accent {
  color: var(--color-primary);
}

.hero-text p {
  font-size: 1.0625rem;
  color: var(--color-text-secondary);
  max-width: 560px;
  margin-bottom: 1.5rem;
}

.hero-stat-row {
  display: flex;
  gap: 2rem;
}

.hero-stat {
  display: flex;
  flex-direction: column;
}

.hero-stat-num {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
}

.hero-stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.catalog-section {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.catalog-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.5rem;
}

.results-column {
  display: flex;
  flex-direction: column;
}

.results-summary {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

/* Low-signal notice shown when only a few results are present */
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

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

/* Offline cached-content notice shown above the events grid */
.cached-results-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  background: var(--color-surface-raised);
  color: var(--color-warning);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
}

.results-state {
  padding: 2rem;
  display: grid;
  gap: 1rem;
}

.loading-state,
.error-state {
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

.state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.map-panel {
  height: fit-content;
  padding: 1.125rem;
  position: sticky;
  top: 80px;
}

.map-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text);
}

.map-title svg {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.map-caption {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-panel iframe {
  width: 100%;
  height: 360px;
  border: 0;
  border-radius: var(--radius-sm);
}

.map-actions {
  margin-top: 0.75rem;
}

.map-link {
  font-size: 0.8125rem;
  color: var(--color-primary);
}

.map-empty,
.empty-state p,
.results-state p,
.results-state h2 {
  color: var(--color-text-secondary);
}

.empty-state {
  text-align: center;
  justify-items: center;
}

.empty-icon {
  font-size: 2.5rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1024px) {
  .catalog-layout {
    grid-template-columns: 1fr;
  }

  .map-panel {
    position: static;
    order: -1;
  }

  .map-panel iframe {
    height: 240px;
  }
}

@media (max-width: 640px) {
  .subdomain-header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .subdomain-banner-wrap {
    display: none;
  }

  .subdomain-hero-main {
    flex-direction: column;
  }

  .subdomain-links {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-text h1 {
    font-size: 2rem;
  }

  .loading-state,
  .error-state {
    grid-template-columns: 1fr;
  }
}
.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -2;
}

.hero-video-uplayer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(52, 55, 220, 0.2);
  z-index: -1;
}
</style>
