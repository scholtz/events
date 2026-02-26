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
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`
}
</script>

<template>
  <div class="container event-detail-view">
    <template v-if="event">
      <RouterLink to="/" class="back-link">&larr; Back to events</RouterLink>
      <div class="event-detail card">
        <div class="event-detail-header">
          <div class="event-detail-meta">
            <span
              class="badge"
              :style="{
                background:
                  (categories.getCategoryBySlug(event.category)?.color ?? '#6b7280') + '20',
                color: categories.getCategoryBySlug(event.category)?.color ?? '#6b7280',
              }"
            >
              {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
            </span>
          </div>
          <h1>{{ event.title }}</h1>
          <p class="organizer">Organized by {{ event.organizer }}</p>
        </div>
        <div class="event-detail-body">
          <div class="event-info">
            <div class="info-section">
              <h3>📅 Date</h3>
              <p>
                {{ formatDate(event.date) }}
                <template v-if="event.endDate"> &mdash; {{ formatDate(event.endDate) }} </template>
              </p>
            </div>
            <div class="info-section">
              <h3>📍 Location</h3>
              <p>{{ event.location.name }}</p>
              <p class="text-secondary">{{ event.location.address }}</p>
            </div>
            <div class="info-section">
              <h3>📝 Description</h3>
              <p>{{ event.description }}</p>
            </div>
            <div class="info-section">
              <a :href="event.link" target="_blank" rel="noopener" class="btn btn-primary">
                🔗 Visit Event Page
              </a>
            </div>
          </div>
          <div class="event-map">
            <iframe
              :src="mapUrl(event.location.lat, event.location.lng)"
              width="100%"
              height="300"
              frameborder="0"
              style="border-radius: var(--radius-md)"
              title="Event location map"
            ></iframe>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="empty-state card">
      <h2>Event not found</h2>
      <p>The event you are looking for does not exist.</p>
      <RouterLink to="/" class="btn btn-primary">Browse Events</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.event-detail-view {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.back-link:hover {
  color: var(--color-primary);
}

.event-detail {
  overflow: hidden;
}

.event-detail-header {
  padding: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.event-detail-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0.75rem 0 0.25rem;
}

.organizer {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.event-detail-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 2rem;
}

.event-info {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-section h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  margin-bottom: 0.375rem;
}

.info-section p {
  font-size: 0.9375rem;
  line-height: 1.6;
}

.text-secondary {
  color: var(--color-text-secondary);
  font-size: 0.8125rem !important;
}

.empty-state {
  padding: 3rem;
  text-align: center;
}

.empty-state h2 {
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .event-detail-body {
    grid-template-columns: 1fr;
  }
}
</style>
