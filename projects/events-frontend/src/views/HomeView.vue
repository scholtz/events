<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  areEventFiltersEqual,
  createDefaultEventFilters,
  eventFiltersFromQuery,
  eventFiltersToQuery,
  useEventsStore,
} from '@/stores/events'
import { useSavedSearchesStore } from '@/stores/savedSearches'
import { useDiscoveryAnalytics } from '@/composables/useDiscoveryAnalytics'
import { useSubdomain } from '@/composables/useSubdomain'
import { usePwa } from '@/composables/usePwa'
import EventCard from '@/components/events/EventCard.vue'
import EventFilters from '@/components/events/EventFilters.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const eventsStore = useEventsStore()
const savedSearchesStore = useSavedSearchesStore()
const { trackSearch, trackFilterChange, trackFilterClear } = useDiscoveryAnalytics()
const { activeDomain, isSubdomainView } = useSubdomain()
const { isOffline } = usePwa()

const syncingFromRoute = ref(false)

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

  syncingFromRoute.value = false
  await eventsStore.fetchDiscoveryEvents()
}

watch(
  () => route.query,
  async () => {
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
      await router.replace({ query: nextQuery })
      return
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

const emptyStateMessage = computed(() => {
  if (!eventsStore.hasActiveFilters) {
    return 'No events are available yet. Check back soon or submit a new one.'
  }

  return 'Try broadening your filters or clearing a few constraints to see more events.'
})

</script>

<template>
  <div class="home-view">
    <section v-if="isSubdomainView && activeDomain" class="subdomain-header">
      <div class="container">
        <h1>{{ activeDomain.name }} Events</h1>
        <p v-if="activeDomain.description">{{ activeDomain.description }}</p>
      </div>
    </section>
    <section v-else class="hero">
      <div class="container hero-content">
        <div class="hero-text">
          <h1>Discover Events<br /><span class="hero-accent">Near You</span></h1>
          <p>
            Find high-intent, domain-specific events with shareable filters, map context, and
            pricing details.
          </p>
          <RouterLink to="/submit" class="btn btn-primary hero-cta">Submit an Event</RouterLink>
        </div>
        <div class="hero-stat-row">
          <div class="hero-stat">
            <span class="hero-stat-num">{{ eventsStore.discoveryEvents.length }}</span>
            <span class="hero-stat-label">Matching Events</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container catalog-section">
      <EventFilters />
      <div class="catalog-layout">
        <div class="results-column">
          <div v-if="eventsStore.discoveryLoading" class="results-state card loading-state" aria-live="polite">
            <div class="loading-spinner" aria-hidden="true"></div>
            <div>
              <h2>Updating results…</h2>
              <p>Applying your filters and loading the best matching events.</p>
            </div>
          </div>

          <div v-else-if="eventsStore.discoveryError" class="results-state card error-state" role="alert">
            <div class="state-icon" aria-hidden="true">{{ isOffline ? '📡' : '⚠️' }}</div>
            <div>
              <h2>{{ isOffline ? "You're offline" : "Couldn't load event results" }}</h2>
              <p v-if="isOffline">You don't have any cached results for this search. Connect to the internet and try again to load events.</p>
              <p v-else>{{ eventsStore.discoveryError }}</p>
            </div>
            <div class="state-actions">
              <button class="btn btn-primary" @click="eventsStore.fetchDiscoveryEvents()">Try again</button>
              <button v-if="eventsStore.hasActiveFilters" class="btn btn-outline" @click="clearDiscoveryFilters">
                Clear filters
              </button>
            </div>
          </div>

          <template v-else-if="eventsStore.discoveryEvents.length">
            <div v-if="isOffline" role="status" aria-live="polite" class="cached-results-notice">
              <span aria-hidden="true">📡</span>
              Showing results from your last online visit. Refresh when back online.
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
            <h2>No events found</h2>
            <p>{{ emptyStateMessage }}</p>
            <div class="state-actions">
              <button v-if="eventsStore.hasActiveFilters" class="btn btn-primary" @click="clearDiscoveryFilters">
                Clear filters
              </button>
              <RouterLink v-else to="/submit" class="btn btn-primary">Submit an Event</RouterLink>
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
            Map context
          </h2>
          <p v-if="mapCenter" class="map-caption">Showing: {{ mapCenter.label }}</p>
          <iframe
            v-if="mapCenter"
            :src="mapUrl(mapCenter.lat, mapCenter.lng)"
            title="Event locations map"
            loading="lazy"
            sandbox="allow-scripts"
          ></iframe>
          <div v-if="mapCenter" class="map-actions">
            <a :href="mapCenter.mapUrl" target="_blank" rel="noopener noreferrer" class="map-link">
              Open in OpenStreetMap ↗
            </a>
          </div>
          <p v-else-if="!eventsStore.hasActiveFilters" class="map-empty">
            Events with location data will appear here as soon as they match your discovery view.
          </p>
          <p v-else class="map-empty">Adjust your filters to find results with map context.</p>
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
}

.subdomain-header {
  background: linear-gradient(160deg, #0d0f14 0%, rgba(19, 127, 236, 0.08) 100%);
  border-bottom: 1px solid var(--color-border);
  padding: 2rem 0 1.5rem;
  margin-bottom: 0;
}

.subdomain-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
  color: var(--color-text);
}

.subdomain-header p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.hero-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
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
  .hero-text h1 {
    font-size: 2rem;
  }

  .loading-state,
  .error-state {
    grid-template-columns: 1fr;
  }
}
</style>
