<script setup lang="ts">
import { computed } from 'vue'
import { useEventsStore } from '@/stores/events'
import EventCard from '@/components/events/EventCard.vue'
import EventFilters from '@/components/events/EventFilters.vue'

const eventsStore = useEventsStore()

const mapCenter = computed(() => {
  const firstEvent = eventsStore.filteredEvents[0]
  if (!firstEvent?.location) return null
  const { lat, lng } = firstEvent.location
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null
  }
  return {
    lat,
    lng,
    label: firstEvent.location.name || firstEvent.location.address || firstEvent.title,
  }
})

function mapUrl(lat: number, lng: number): string {
  const safeLat = Math.min(90, Math.max(-90, lat))
  const safeLng = Math.min(180, Math.max(-180, lng))
  return `https://www.openstreetmap.org/export/embed.html?bbox=${safeLng - 0.02},${safeLat - 0.02},${safeLng + 0.02},${safeLat + 0.02}&layer=mapnik&marker=${safeLat},${safeLng}`
}
</script>

<template>
  <div class="home-view">
    <section class="hero">
      <div class="container hero-content">
        <div class="hero-text">
          <h1>Discover Events<br /><span class="hero-accent">Near You</span></h1>
          <p>Find crypto, AI, cooking, and more events happening in your area.</p>
          <RouterLink to="/submit" class="btn btn-primary hero-cta">Submit an Event</RouterLink>
        </div>
        <div class="hero-stat-row">
          <div class="hero-stat">
            <span class="hero-stat-num">{{ eventsStore.filteredEvents.length }}</span>
            <span class="hero-stat-label">Events Listed</span>
          </div>
        </div>
      </div>
    </section>
    <div class="container catalog-section">
      <EventFilters />
      <div class="catalog-layout">
        <div>
          <div v-if="eventsStore.filteredEvents.length" class="events-grid">
            <EventCard
              v-for="event in eventsStore.filteredEvents"
              :key="event.id"
              :event="event"
            />
          </div>
          <div v-else class="empty-state card">
            <div class="empty-icon">🔍</div>
            <h3>No events found</h3>
            <p>Try adjusting your search criteria or submit a new event.</p>
            <RouterLink to="/submit" class="btn btn-primary">Submit an Event</RouterLink>
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
            Event Map
          </h2>
          <p v-if="mapCenter" class="map-caption">Showing: {{ mapCenter.label }}</p>
          <iframe
            v-if="mapCenter"
            :src="mapUrl(mapCenter.lat, mapCenter.lng)"
            title="Event locations map"
            loading="lazy"
            sandbox="allow-scripts"
          ></iframe>
          <p v-else class="map-empty">Events with location data will appear on the map.</p>
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
  max-width: 480px;
  margin-bottom: 1.5rem;
}

.hero-cta {
  font-weight: 600;
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

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.catalog-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.5rem;
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

.map-empty {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  padding: 1.5rem 0;
  text-align: center;
}

.empty-state {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.25rem;
}

.empty-state h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
}

.empty-state p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  max-width: 320px;
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
}
</style>
