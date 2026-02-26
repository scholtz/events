<script setup lang="ts">
import { computed } from 'vue'
import { useEventsStore } from '@/stores/events'
import EventCard from '@/components/events/EventCard.vue'
import EventFilters from '@/components/events/EventFilters.vue'

const eventsStore = useEventsStore()

const mapCenter = computed(() => {
  const firstEvent = eventsStore.filteredEvents[0]
  if (!firstEvent) return null
  return {
    lat: Number.isFinite(firstEvent.location.lat) ? firstEvent.location.lat : 0,
    lng: Number.isFinite(firstEvent.location.lng) ? firstEvent.location.lng : 0,
    label: firstEvent.location.name || firstEvent.location.address || firstEvent.title,
  }
})

function mapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.02},${lat - 0.02},${lng + 0.02},${lat + 0.02}&layer=mapnik&marker=${lat},${lng}`
}
</script>

<template>
  <div class="home-view">
    <section class="hero">
      <div class="container">
        <h1>Discover Events Near You</h1>
        <p>Find crypto, AI, cooking, and more events happening in your area.</p>
      </div>
    </section>
    <div class="container">
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
            <p>No events match your filters. Try adjusting your search criteria.</p>
          </div>
        </div>
        <aside class="map-panel card">
          <h2>Event Map</h2>
          <p v-if="mapCenter" class="map-caption">Centered on {{ mapCenter.label }}</p>
          <iframe
            v-if="mapCenter"
            :src="mapUrl(mapCenter.lat, mapCenter.lng)"
            title="Event locations map"
            loading="lazy"
          ></iframe>
          <p v-else class="map-empty">Add filters or events to preview locations on the map.</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  color: #fff;
  padding: 3rem 0;
  margin-bottom: 2rem;
}

.hero h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.hero p {
  font-size: 1.0625rem;
  opacity: 0.9;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.catalog-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 1rem;
}

.map-panel {
  height: fit-content;
  padding: 1rem;
  position: sticky;
  top: 80px;
}

.map-panel h2 {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.map-caption {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
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
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--color-text-secondary);
}

@media (max-width: 1024px) {
  .catalog-layout {
    grid-template-columns: 1fr;
  }

  .map-panel {
    position: static;
  }
}
</style>
