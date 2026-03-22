<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { formatEventPrice } from '@/stores/events'
import { useEventsStore } from '@/stores/events'
import { useFavoritesStore } from '@/stores/favorites'
import { useAuthStore } from '@/stores/auth'
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadIcs, eventToCalendarInput } from '@/composables/useCalendar'
import { useCalendarAnalytics } from '@/composables/useCalendarAnalytics'
import { buildSubdomainUrl, formatSubdomainHost } from '@/composables/useSubdomain'
import { usePwa } from '@/composables/usePwa'

const { t, locale } = useI18n()
const route = useRoute()
const eventsStore = useEventsStore()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const { isOffline } = usePwa()

const slug = computed(() => route.params.id as string)

// Start with cached version from store, then refresh with full detail (including interestedCount)
const cachedEvent = computed(() => eventsStore.getEventBySlug(slug.value))
const event = computed(() => eventsStore.detailEvent ?? cachedEvent.value ?? null)
const loading = computed(() => eventsStore.detailLoading && !cachedEvent.value)
const detailError = computed(() => eventsStore.detailError)

async function loadDetail() {
  await eventsStore.fetchEventBySlug(slug.value)
}

onMounted(loadDetail)
watch(slug, loadDetail)

const isFavorited = computed(() => event.value ? favoritesStore.isFavorited(event.value.id) : false)
const favoriting = ref(false)

// Pre-computed numeric lat/lng to avoid repeated Number() calls in template
const eventLat = computed(() => Number(event.value?.latitude ?? 0))
const eventLng = computed(() => Number(event.value?.longitude ?? 0))
const validCoords = computed(() => hasValidCoords(eventLat.value, eventLng.value))

// ONLINE-only events must not show misleading physical map UI (acceptance criterion)
const isOnlineOnly = computed(() => event.value?.attendanceMode === 'ONLINE')

async function handleFavoriteToggle() {
  if (!event.value || !authStore.isAuthenticated) return
  favoriting.value = true
  try {
    await favoritesStore.toggleFavorite(event.value.id)
    // Refresh the detail to pick up the updated interestedCount from the server
    await eventsStore.fetchEventBySlug(slug.value)
  } finally {
    favoriting.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(locale.value, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
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

function googleMapsDirectionsUrl(event: { venueName: string; addressLine1: string; city: string; countryCode: string; latitude: number; longitude: number }): string {
  if (hasValidCoords(Number(event.latitude), Number(event.longitude))) {
    return `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
  }
  const address = [event.venueName, event.addressLine1, event.city, event.countryCode]
    .filter(Boolean)
    .join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function formatInterestedCount(count: number): string {
  if (count === 0) return t('eventDetail.beFirstToSave')
  if (count === 1) return t('eventDetail.personInterested')
  return t('eventDetail.peopleInterested', { count })
}

function statusLabel(status: string): string {
  const key = `eventStatus.${status}`
  const translated = t(key)
  // If vue-i18n returns the key itself, the translation is missing → fall back
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

function attendanceModeLabel(mode: string | undefined): string {
  if (mode && (mode === 'IN_PERSON' || mode === 'ONLINE' || mode === 'HYBRID')) {
    return t(`attendanceMode.${mode}`)
  }
  return t('attendanceMode.IN_PERSON')
}

// ── Add to calendar ──────────────────────────────────────────────────────────
const calendarMenuOpen = ref(false)
const calendarAdded = ref(false)
let calendarConfirmTimer: ReturnType<typeof setTimeout> | undefined
const { trackCalendarAction } = useCalendarAnalytics()

onUnmounted(() => {
  clearTimeout(calendarConfirmTimer)
})

function toggleCalendarMenu() {
  calendarMenuOpen.value = !calendarMenuOpen.value
}

function closeCalendarMenu() {
  calendarMenuOpen.value = false
}

function handleDownloadIcs() {
  if (!event.value) return
  downloadIcs(event.value)
  trackCalendarAction('ics', event.value.id, event.value.slug)
  calendarAdded.value = true
  closeCalendarMenu()
  clearTimeout(calendarConfirmTimer)
  calendarConfirmTimer = setTimeout(() => {
    calendarAdded.value = false
  }, 3000)
}

const googleCalendarUrl = computed(() =>
  event.value ? buildGoogleCalendarUrl(eventToCalendarInput(event.value)) : '#',
)

const outlookCalendarUrl = computed(() =>
  event.value ? buildOutlookCalendarUrl(eventToCalendarInput(event.value)) : '#',
)

function handleGoogleCalendarClick() {
  if (event.value) trackCalendarAction('google', event.value.id, event.value.slug)
  closeCalendarMenu()
}

function handleOutlookCalendarClick() {
  if (event.value) trackCalendarAction('outlook', event.value.id, event.value.slug)
  closeCalendarMenu()
}

/**
 * Returns a short human-readable timezone label for display in the Date & Time
 * section, e.g. "Europe/Prague" → "Prague time (CET/CEST)".
 * Falls back to the raw IANA id if Intl.DateTimeFormat doesn't have richer info.
 */
function formatTimezoneLabel(timezone: string | null): string | null {
  if (!timezone) return null
  try {
    const now = new Date()
    const shortName = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value
    return shortName ?? timezone
  } catch {
    return timezone
  }
}

function domainCatalogUrl(event: {
  domain?: {
    slug?: string
    subdomain?: string
  } | null
}): string {
  const subdomain = event.domain?.subdomain
  const slug = event.domain?.slug

  if (!subdomain || !slug) return '/'

  return buildSubdomainUrl(subdomain, slug)
}

function domainHostDisplay(event: {
  domain?: {
    name?: string
    subdomain?: string
  } | null
}): string {
  const subdomain = event.domain?.subdomain

  if (!subdomain) return event.domain?.name ?? 'Event'

  return formatSubdomainHost(subdomain)
}
</script>

<template>
  <div class="container event-detail-view">
    <!-- Loading skeleton -->
    <template v-if="loading">
      <div class="skeleton-back"></div>
      <div class="card skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-line skeleton-badge"></div>
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-sub"></div>
        </div>
        <div class="skeleton-body">
          <div class="skeleton-col">
            <div class="skeleton-line"></div>
            <div class="skeleton-line skeleton-short"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line skeleton-short"></div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="event">
      <RouterLink to="/" class="back-link">{{ t('eventDetail.backToEvents') }}</RouterLink>
      <!-- Offline stale-data notice: shown when viewing event detail without network -->
      <div v-if="isOffline" role="status" aria-live="polite" class="stale-data-notice">
        <span aria-hidden="true">📡</span>
        {{ t('eventDetail.offlineStale') }}
      </div>
      <div class="event-detail card">
        <div class="event-detail-header">
          <div class="event-detail-meta">
            <a
              v-if="event.domain?.subdomain"
              :href="domainCatalogUrl(event)"
              class="badge badge-primary domain-link"
              :aria-label="`Browse more events on ${domainHostDisplay(event)}`"
            >
              {{ domainHostDisplay(event) }}
            </a>
            <span v-else class="badge badge-primary">
              {{ event.domain?.name ?? 'Event' }}
            </span>
            <span class="badge badge-mode">{{ attendanceModeLabel(event.attendanceMode) }}</span>
            <span class="event-status badge" :class="statusBadgeClass(event.status)">
              {{ statusLabel(event.status) }}
            </span>
            <button
              v-if="authStore.isAuthenticated"
              class="favorite-btn"
              :class="{ 'is-favorited': isFavorited }"
              :aria-label="isFavorited ? t('eventCard.removeFromFavorites') : t('eventCard.addToFavorites')"
              :aria-pressed="isFavorited"
              :disabled="favoriting"
              @click="handleFavoriteToggle"
            >
              <span aria-hidden="true">{{ isFavorited ? '★' : '☆' }}</span>
              {{ isFavorited ? t('eventDetail.saved') : t('eventDetail.saveEvent') }}
            </button>
          </div>
          <h1>{{ event.name }}</h1>
          <p v-if="event.submittedBy" class="organizer">
            {{ t('eventDetail.submittedBy', { name: event.submittedBy.displayName }) }}
          </p>
        </div>
        <div class="event-detail-body">
          <div class="event-info">
            <!-- Date & Time -->
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon" aria-hidden="true">📅</span>
                {{ t('eventDetail.dateAndTime') }}
              </h3>
              <p>{{ formatDate(event.startsAtUtc) }}</p>
              <p class="text-secondary">{{ formatTime(event.startsAtUtc) }}</p>
              <template v-if="event.endsAtUtc">
                <p class="text-secondary">Until {{ formatDate(event.endsAtUtc) }}, {{ formatTime(event.endsAtUtc) }}</p>
              </template>
              <p v-if="event.timezone" class="timezone-label text-secondary">
                <span aria-hidden="true">🌐</span>
                {{ formatTimezoneLabel(event.timezone) }}
              </p>
            </div>

            <!-- Location / Venue -->
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon" aria-hidden="true">{{ isOnlineOnly ? '💻' : '📍' }}</span>
                {{ isOnlineOnly ? t('eventDetail.virtualEvent') : t('eventDetail.venueAndLocation') }}
              </h3>
              <template v-if="isOnlineOnly">
                <p class="text-secondary">{{ t('eventDetail.virtualEventDescription') }}</p>
              </template>
              <template v-else>
                <p class="venue-name">{{ event.venueName || 'TBD' }}</p>
                <p v-if="event.addressLine1 || event.city" class="text-secondary venue-address">
                  {{ [event.addressLine1, event.city, event.countryCode].filter(Boolean).join(', ') }}
                </p>
                <a
                  :href="googleMapsDirectionsUrl(event)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="directions-link"
                >
                  🗺️ {{ t('eventDetail.getDirections') }}
                </a>
              </template>
            </div>

            <!-- About -->
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon" aria-hidden="true">📝</span>
                {{ t('eventDetail.about') }}
              </h3>
              <p class="event-description">{{ event.description }}</p>
            </div>

            <!-- Pricing -->
            <div class="info-section">
              <h3 class="info-label">
                <span class="info-icon" aria-hidden="true">💳</span>
                {{ t('eventDetail.pricing') }}
              </h3>
              <p>{{ formatEventPrice(event) }}</p>
            </div>

            <!-- CTA -->
            <div class="info-section">
              <a
                :href="event.eventUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-primary"
              >
                {{ t('eventDetail.eventLink') }}
              </a>

              <!-- Add to calendar -->
              <div class="calendar-action" @keydown.escape="closeCalendarMenu">
                <button
                  class="btn btn-outline calendar-btn"
                  :aria-expanded="calendarMenuOpen"
                  aria-haspopup="menu"
                  :aria-label="calendarAdded ? t('eventDetail.calendarAdded') : t('eventDetail.addToCalendar')"
                  @click="toggleCalendarMenu"
                >
                  <span aria-hidden="true">📅</span>
                  {{ calendarAdded ? t('eventDetail.calendarAdded') : t('eventDetail.addToCalendar') }}
                  <span aria-hidden="true" class="chevron">▾</span>
                </button>

                <div
                  v-if="calendarMenuOpen"
                  class="calendar-menu"
                  role="menu"
                  aria-label="Calendar options"
                  @click.stop
                >
                  <button
                    class="calendar-menu-item"
                    role="menuitem"
                    @click="handleDownloadIcs"
                  >
                    <span aria-hidden="true">⬇</span>
                    {{ t('eventDetail.downloadIcs') }}
                  </button>
                  <a
                    :href="googleCalendarUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="calendar-menu-item"
                    role="menuitem"
                    @click="handleGoogleCalendarClick"
                  >
                    <span aria-hidden="true">🗓</span>
                    {{ t('eventDetail.googleCalendar') }}
                  </a>
                  <a
                    :href="outlookCalendarUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="calendar-menu-item"
                    role="menuitem"
                    @click="handleOutlookCalendarClick"
                  >
                    <span aria-hidden="true">📆</span>
                    {{ t('eventDetail.outlookCalendar') }}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="event-sidebar">
            <!-- Virtual event notice (replaces map for ONLINE-only events) -->
            <div
              v-if="isOnlineOnly"
              class="event-map virtual-event-notice"
              aria-label="Virtual event"
            >
              <h3 class="map-heading">{{ t('eventDetail.virtualEvent') }}</h3>
              <div class="virtual-event-content">
                <span class="virtual-event-icon" aria-hidden="true">💻</span>
                <p>{{ t('eventDetail.virtualEventDescription') }}</p>
              </div>
            </div>

            <!-- Interactive map (when coordinates available and not online-only) -->
            <div
              v-else-if="validCoords"
              class="event-map"
              aria-label="Event location map"
            >
              <h3 class="map-heading">{{ t('eventDetail.locationOnMap') }}</h3>
              <iframe
                :src="mapUrl(eventLat, eventLng)"
                :title="t('eventDetail.mapIframeTitle')"
                loading="lazy"
                sandbox="allow-scripts"
              ></iframe>
              <a
                :href="event.mapUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="map-link"
              >
                {{ t('eventDetail.openInOsm') }}
              </a>
            </div>

            <!-- Location fallback (when no coordinates) -->
            <div v-else class="event-map location-fallback" aria-label="Event location">
              <h3 class="map-heading">{{ t('eventDetail.locationFallbackHeading') }}</h3>
              <div class="location-fallback-content">
                <span class="location-icon" aria-hidden="true">📍</span>
                <div>
                  <p class="venue-name">{{ event.venueName || 'Venue TBD' }}</p>
                  <p v-if="event.city" class="text-secondary">{{ [event.city, event.countryCode].filter(Boolean).join(', ') }}</p>
                  <p v-else class="text-secondary">{{ t('eventDetail.noExactLocation') }}</p>
                </div>
              </div>
              <a
                :href="googleMapsDirectionsUrl(event)"
                target="_blank"
                rel="noopener noreferrer"
                class="map-link"
              >
                {{ t('eventDetail.searchOnGoogleMaps') }}
              </a>
            </div>

            <!-- Attendee context -->
            <div class="attendee-context" aria-label="Event interest summary">
              <h3 class="map-heading">{{ t('eventDetail.interestedSection') }}</h3>
              <div class="attendee-stats">
                <div class="stat-item">
                  <span class="stat-icon" aria-hidden="true">🔖</span>
                  <div class="stat-text">
                    <span class="stat-value">{{ event.interestedCount ?? 0 }}</span>
                    <span class="stat-label">{{ formatInterestedCount(event.interestedCount ?? 0) }}</span>
                  </div>
                </div>
              </div>
              <p v-if="!authStore.isAuthenticated" class="attendee-cta">
                <RouterLink to="/login" class="link-subtle">{{ t('common.signInLower') }}</RouterLink>
                {{ t('eventDetail.signInToSave') }}
              </p>
              <p v-else-if="!isFavorited" class="attendee-cta">
                {{ t('eventDetail.saveToShowInterest') }}
              </p>
              <p v-else class="attendee-cta attendee-cta--saved">
                ✓ {{ t('eventDetail.youveSavedThisEvent') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="detailError" class="empty-state card" role="alert">
      <div class="empty-icon">⚠️</div>
      <h2>{{ t('eventDetail.unableToLoad') }}</h2>
      <p>{{ detailError }}</p>
      <button class="btn btn-primary" @click="loadDetail">{{ t('common.tryAgain') }}</button>
    </div>

    <div v-else class="empty-state card">
      <div class="empty-icon">🔍</div>
      <h2>{{ t('eventDetail.eventNotFound') }}</h2>
      <p>{{ t('eventDetail.eventNotFoundDescription') }}</p>
      <RouterLink to="/" class="btn btn-primary">{{ t('favorites.browseEvents') }}</RouterLink>
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

/* Offline stale-data notice shown when viewing cached event details offline */
.stale-data-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  margin-bottom: 1rem;
  background: var(--color-surface-raised);
  color: var(--color-warning);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
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

.badge-mode {
  font-size: 0.6875rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(19, 127, 236, 0.12);
  color: var(--color-primary);
  font-weight: 600;
  letter-spacing: 0.03em;
}

.domain-link {
  text-decoration: none;
}

.domain-link:hover {
  text-decoration: underline;
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

.event-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0;
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

.venue-name {
  font-weight: 500;
}

.venue-address {
  margin-top: 0.125rem;
}

.directions-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-primary);
  font-weight: 500;
  text-decoration: none;
  transition: opacity 0.15s;
}

.directions-link:hover {
  opacity: 0.8;
  text-decoration: none;
}

/* Map section */
.event-map {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-bottom: 1px solid var(--color-border);
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
  height: 240px;
  border: 0;
  border-radius: var(--radius-md);
}

.map-link {
  font-size: 0.875rem;
  color: var(--color-primary);
  text-decoration: none;
}

.map-link:hover {
  text-decoration: underline;
}

/* Location fallback */
.location-fallback-content {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--color-surface-raised, var(--color-surface));
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.location-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.location-fallback-content .venue-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.location-fallback-content .text-secondary {
  font-size: 0.8125rem !important;
  margin-top: 0.125rem;
}

/* Virtual event notice */
.virtual-event-content {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--color-surface-raised, var(--color-surface));
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.virtual-event-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.virtual-event-content p {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Attendee context */
.attendee-context {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.attendee-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--color-surface-raised, var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.stat-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.stat-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.attendee-cta {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.attendee-cta--saved {
  color: var(--color-success, #22c55e);
  font-weight: 500;
}

.link-subtle {
  color: var(--color-primary);
  text-decoration: none;
}

.link-subtle:hover {
  text-decoration: underline;
}

/* Empty state */
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

/* Favorite button */
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

/* Loading skeleton */
.skeleton-back {
  height: 1.25rem;
  width: 120px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised, var(--color-surface));
  margin-bottom: 1rem;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-card {
  overflow: hidden;
}

.skeleton-header {
  padding: 2rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-body {
  padding: 2rem;
}

.skeleton-col {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-line {
  height: 1rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised, var(--color-surface));
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-badge {
  width: 80px;
  height: 1.25rem;
}

.skeleton-title {
  width: 60%;
  height: 2rem;
}

.skeleton-sub {
  width: 40%;
}

.skeleton-short {
  width: 50%;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Responsive */
@media (max-width: 900px) {
  .event-detail-body {
    grid-template-columns: 1fr;
  }

  .event-info {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .event-map {
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

  .event-info {
    padding: 1.5rem;
  }

  .event-map,
  .attendee-context {
    padding: 1.5rem;
  }
}

/* Add to calendar */
.calendar-action {
  position: relative;
  display: inline-block;
}

.calendar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.chevron {
  font-size: 0.75rem;
  opacity: 0.7;
}

.calendar-menu {
  position: absolute;
  top: calc(100% + 0.375rem);
  left: 0;
  z-index: 10;
  min-width: 200px;
  background: var(--color-surface-raised, var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.calendar-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  text-align: left;
  transition: background 0.1s;
  font-family: inherit;
}

.calendar-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  text-decoration: none;
}

.info-section .calendar-action {
  margin-top: 0.75rem;
}

.timezone-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  margin-top: 0.25rem;
}

@media (max-width: 480px) {
  .calendar-menu {
    min-width: 180px;
  }
}
</style>
