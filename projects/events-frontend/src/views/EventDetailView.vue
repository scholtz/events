<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useCategoriesStore } from '@/stores/categories'

const route = useRoute()
const eventsStore = useEventsStore()
const categories = useCategoriesStore()

const event = computed(() => eventsStore.getEventById(route.params.id as string))

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function mapUrl(lat: number, lng: number): string {
  const safeLat = Math.min(90, Math.max(-90, lat))
  const safeLng = Math.min(180, Math.max(-180, lng))
  return `https://www.openstreetmap.org/export/embed.html?bbox=${safeLng - 0.01},${safeLat - 0.01},${safeLng + 0.01},${safeLat + 0.01}&layer=mapnik&marker=${safeLat},${safeLng}`
}

function hasValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  )
}
</script>

<template>
  <div class="container event-detail-view">
    <template v-if="event">
      <RouterLink to="/" class="back-link">← Back to events</RouterLink>
      <div class="event-detail card">
        <div class="event-detail-header">
          <div class="event-detail-meta">
            <span
              class="badge"
              :style="{
                background:
                  (categories.getCategoryBySlug(event.category)?.color ?? '#137fec') + '22',
                color: categories.getCategoryBySlug(event.category)?.color ?? '#137fec',
              }"
            >
              {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
            </span>
            <span class="event-status badge" :class="event.status === 'approved' ? 'badge-success' : event.status === 'pending' ? 'badge-warning' : 'badge-danger'">
              {{ event.status }}
            </span>
          </div>
          <h1>{{ event.title }}</h1>
          <p v-if="event.organizer" class="organizer">Organized by {{ event.organizer }}</p>
        </div>
        <div class="event-detail-body">
          <div class="event-info">
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon">📅</span>
                Date
              </h3>
              <p>
                {{ formatDate(event.date) }}
                <template v-if="event.endDate">
                  <br /><span class="text-secondary">Until {{ formatDate(event.endDate) }}</span>
                </template>
              </p>
            </div>
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon">📍</span>
                Location
              </h3>
              <p>{{ event.location.name || 'TBD' }}</p>
              <p v-if="event.location.address" class="text-secondary">
                {{ event.location.address }}
              </p>
            </div>
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon">📝</span>
                About
              </h3>
              <p class="event-description">{{ event.description }}</p>
            </div>
            <div class="info-section">
              <a :href="event.link" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                Visit Event Page →
              </a>
            </div>
          </div>
          <div v-if="hasValidCoords(event.location.lat, event.location.lng)" class="event-map">
            <h3 class="map-heading">Location on Map</h3>
            <iframe
              :src="mapUrl(event.location.lat, event.location.lng)"
              title="Event location map"
              loading="lazy"
              sandbox="allow-scripts"
            ></iframe>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="empty-state card">
      <div class="empty-icon">🔍</div>
      <h2>Event not found</h2>
      <p>The event you are looking for does not exist or has been removed.</p>
      <RouterLink to="/" class="btn btn-primary">Browse Events</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.event-detail-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  transition: color 0.15s;
}

.back-link:hover {
  color: var(--color-text);
  text-decoration: none;
}

.event-detail {
  overflow: hidden;
}

.event-detail-header {
  padding: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.event-detail-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.875rem;
}

.event-detail-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
  line-height: 1.25;
}

.organizer {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.event-detail-body {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 0;
}

.event-info {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  border-right: 1px solid var(--color-border);
}

.info-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.info-icon {
  font-size: 1rem;
}

.info-section p {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--color-text);
}

.event-description {
  white-space: pre-line;
}

.text-secondary {
  color: var(--color-text-secondary) !important;
  font-size: 0.875rem !important;
}

.event-map {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.map-heading {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
}

.event-map iframe {
  width: 100%;
  height: 320px;
  border: 0;
  border-radius: var(--radius-md);
}

.empty-state {
  padding: 4rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.empty-icon {
  font-size: 2.5rem;
}

.empty-state h2 {
  font-size: 1.375rem;
  font-weight: 700;
}

.empty-state p {
  color: var(--color-text-secondary);
  max-width: 320px;
}

@media (max-width: 900px) {
  .event-detail-body {
    grid-template-columns: 1fr;
  }

  .event-info {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}

@media (max-width: 640px) {
  .event-detail-header {
    padding: 1.5rem;
  }

  .event-detail-header h1 {
    font-size: 1.5rem;
  }
}
</style>
