<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { formatEventPrice } from '@/stores/events'
import { useEventsStore } from '@/stores/events'
import { useFavoritesStore } from '@/stores/favorites'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const eventsStore = useEventsStore()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()

const event = computed(() => eventsStore.getEventBySlug(route.params.id as string))

const isFavorited = computed(() => event.value ? favoritesStore.isFavorited(event.value.id) : false)
const favoriting = ref(false)

async function handleFavoriteToggle() {
  if (!event.value || !authStore.isAuthenticated) return
  favoriting.value = true
  try {
    await favoritesStore.toggleFavorite(event.value.id)
  } finally {
    favoriting.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
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

function statusLabel(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'published'
    case 'PENDING_APPROVAL':
      return 'pending'
    case 'REJECTED':
      return 'rejected'
    default:
      return status.toLowerCase()
  }
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
</script>

<template>
  <div class="container event-detail-view">
    <template v-if="event">
      <RouterLink to="/" class="back-link">← Back to events</RouterLink>
      <div class="event-detail card">
        <div class="event-detail-header">
          <div class="event-detail-meta">
            <span class="badge badge-primary">
              {{ event.domain?.name ?? 'Event' }}
            </span>
            <span class="event-status badge" :class="statusBadgeClass(event.status)">
              {{ statusLabel(event.status) }}
            </span>
            <button
              v-if="authStore.isAuthenticated"
              class="favorite-btn"
              :class="{ 'is-favorited': isFavorited }"
              :aria-label="isFavorited ? 'Remove from favorites' : 'Add to favorites'"
              :aria-pressed="isFavorited"
              :disabled="favoriting"
              @click="handleFavoriteToggle"
            >
              <span aria-hidden="true">{{ isFavorited ? '★' : '☆' }}</span>
              {{ isFavorited ? 'Saved' : 'Save event' }}
            </button>
          </div>
          <h1>{{ event.name }}</h1>
          <p v-if="event.submittedBy" class="organizer">
            Submitted by {{ event.submittedBy.displayName }}
          </p>
        </div>
        <div class="event-detail-body">
          <div class="event-info">
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon">📅</span>
                Date
              </h3>
              <p>
                {{ formatDate(event.startsAtUtc) }}
                <template v-if="event.endsAtUtc">
                  <br /><span class="text-secondary">Until {{ formatDate(event.endsAtUtc) }}</span>
                </template>
              </p>
            </div>
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon">📍</span>
                Location
              </h3>
              <p>{{ event.venueName || 'TBD' }}</p>
              <p v-if="event.addressLine1 || event.city" class="text-secondary">
                {{ [event.addressLine1, event.city, event.countryCode].filter(Boolean).join(', ') }}
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
              <h3 class="info-label">
                <span class="info-icon">💳</span>
                Pricing
              </h3>
              <p>{{ formatEventPrice(event) }}</p>
            </div>
            <div class="info-section">
              <a
                :href="event.eventUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-primary"
              >
                Visit Event Page →
              </a>
            </div>
          </div>
          <div
            v-if="hasValidCoords(Number(event.latitude), Number(event.longitude))"
            class="event-map"
          >
            <h3 class="map-heading">Location on Map</h3>
            <iframe
              :src="mapUrl(Number(event.latitude), Number(event.longitude))"
              title="Event location map"
              loading="lazy"
              sandbox="allow-scripts"
            ></iframe>
            <a
              :href="event.mapUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="map-link"
            >
              Open in OpenStreetMap ↗
            </a>
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

.map-link {
  font-size: 0.875rem;
  color: var(--color-primary);
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

.favorite-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.375rem 0.75rem;
  transition: all 0.15s;
}

.favorite-btn:hover:not(:disabled) {
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
}

.favorite-btn.is-favorited {
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent);
}

.favorite-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
