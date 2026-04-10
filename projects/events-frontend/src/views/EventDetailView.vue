<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { formatEventPrice } from '@/stores/events'
import { useEventsStore } from '@/stores/events'
import { useFavoritesStore } from '@/stores/favorites'
import { useAuthStore } from '@/stores/auth'
import { useRemindersStore } from '@/stores/reminders'
import { useDiscussionStore } from '@/stores/discussion'
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadIcs, eventToCalendarInput, validateCalendarInput } from '@/composables/useCalendar'
import { useCalendarAnalytics } from '@/composables/useCalendarAnalytics'
import { buildSubdomainUrl, formatSubdomainHost } from '@/composables/useSubdomain'
import { usePwa } from '@/composables/usePwa'
import ReminderToggle from '@/components/events/ReminderToggle.vue'
import { safeHexColor } from '@/lib/colorUtils'

const { t, locale } = useI18n()
const route = useRoute()
const eventsStore = useEventsStore()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const remindersStore = useRemindersStore()
const discussionStore = useDiscussionStore()
const { isOffline } = usePwa()

const slug = computed(() => route.params.id as string)

// Start with cached version from store, then refresh with full detail (including interestedCount)
const cachedEvent = computed(() => eventsStore.getEventBySlug(slug.value))
const event = computed(() => eventsStore.detailEvent ?? cachedEvent.value ?? null)
const loading = computed(() => eventsStore.detailLoading && !cachedEvent.value)
const detailError = computed(() => eventsStore.detailError)

/**
 * Freshness record for the currently displayed event slug.
 * Returns null if no freshness data exists for this slug (e.g. first load
 * failed, or we just navigated to a new event and the fetch is in flight).
 * This prevents Event A's stale metadata from showing on Event B's page.
 */
const currentDetailFreshness = computed(() => {
  const f = eventsStore.detailFreshness
  return f?.slug === slug.value ? f : null
})

/**
 * Human-readable age of the event detail data.
 * Used in the stale-data notice when data came from cache.
 */
const detailDataAge = computed<string | null>(() => {
  const at = currentDetailFreshness.value?.fetchedAt
  if (!at) return null
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return t('eventDetail.cachedDataRecent')
  return t('eventDetail.cachedDataMinutes', { minutes })
})

/**
 * Whether to show a stale-data notice above the event detail.
 * True when offline, OR when the SW served THIS event's response from IDB
 * cache (only when freshness data is correlated with the current slug).
 */
const showStaleNotice = computed(
  () =>
    isOffline.value ||
    (currentDetailFreshness.value?.dataSource === 'cache'),
)

/** Whether the current user is allowed to edit this event (admin or event owner). */
const canEdit = computed(() => {
  if (!authStore.isAuthenticated || !event.value) return false
  if (authStore.isAdmin) return true
  return event.value.submittedByUserId === authStore.currentUser?.id
})

/**
 * Show overviewContent excerpt in the hub context card when the domain has no short description.
 * Truncated to 120 characters with an ellipsis so the sidebar card stays compact.
 */
const hubContextOverviewExcerpt = computed(() => {
  const domain = event.value?.domain
  if (!domain || domain.description) return null
  const overview = domain.overviewContent
  if (!overview) return null
  return overview.length > 120 ? `${overview.slice(0, 120)}…` : overview
})

/** Validated hub accent color: prefers accentColor, falls back to primaryColor. */
const hubContextAccentColor = computed(() =>
  safeHexColor((event.value?.domain?.accentColor ?? event.value?.domain?.primaryColor) ?? null),
)

async function loadDetail() {
  await eventsStore.fetchEventBySlug(slug.value)
}

onMounted(async () => {
  await loadDetail()
  if (authStore.isAuthenticated) {
    await remindersStore.fetchReminders()
  }
  // Load discussion for this event slug (published events only)
  await discussionStore.fetchDiscussion(slug.value)
})
watch(slug, async (newSlug) => {
  loadDetail()
  await discussionStore.fetchDiscussion(newSlug)
})

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
const calendarError = ref(false)
const calendarBtnRef = ref<HTMLButtonElement | null>(null)
const calendarMenuRef = ref<HTMLDivElement | null>(null)
let calendarConfirmTimer: ReturnType<typeof setTimeout> | undefined
const { trackCalendarAction } = useCalendarAnalytics()

/** Close the menu when clicking outside the calendar-action container. */
function handleCalendarClickOutside(e: MouseEvent) {
  if (
    calendarMenuOpen.value &&
    calendarBtnRef.value &&
    !calendarBtnRef.value.closest('.calendar-action')?.contains(e.target as Node)
  ) {
    calendarMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleCalendarClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleCalendarClickOutside)
  clearTimeout(calendarConfirmTimer)
})

function toggleCalendarMenu() {
  calendarMenuOpen.value = !calendarMenuOpen.value
  if (calendarMenuOpen.value) {
    // Move focus to the first menu item after the DOM update
    nextTick(() => {
      const firstItem = calendarMenuRef.value?.querySelector<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      )
      firstItem?.focus()
    })
  }
}

function closeCalendarMenu(returnFocus = false) {
  calendarMenuOpen.value = false
  if (returnFocus) {
    calendarBtnRef.value?.focus()
  }
}

/** Arrow-key navigation within the calendar menu (WAI-ARIA menu pattern). */
function handleCalendarMenuKeydown(e: KeyboardEvent) {
  if (!calendarMenuRef.value) return
  const items = Array.from(
    calendarMenuRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
  )
  const idx = items.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    items[(idx + 1) % items.length]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    items[(idx - 1 + items.length) % items.length]?.focus()
  } else if (e.key === 'Home') {
    e.preventDefault()
    items[0]?.focus()
  } else if (e.key === 'End') {
    e.preventDefault()
    items[items.length - 1]?.focus()
  } else if (e.key === 'Tab') {
    // Per WAI-ARIA menu-button pattern: Tab closes the menu immediately.
    // Prevent default so focus does not cycle to another menu item.
    // Return focus to the toggle button so the user can Tab forward from
    // there — this avoids a focus trap while keeping a clean exit point.
    e.preventDefault()
    closeCalendarMenu(true)
  }
}

/** Close the menu when focus leaves the calendar-action container via any means other than Tab. */
function handleCalendarMenuFocusout(e: FocusEvent) {
  // relatedTarget is the element receiving focus; if it's outside the
  // .calendar-action container, close the menu without stealing focus.
  const container = calendarBtnRef.value?.closest('.calendar-action')
  if (container && !container.contains(e.relatedTarget as Node | null)) {
    calendarMenuOpen.value = false
  }
}

function handleDownloadIcs() {
  if (!event.value) return
  try {
    downloadIcs(event.value)
    trackCalendarAction('ics', event.value.id, event.value.slug)
    calendarAdded.value = true
    calendarError.value = false
    closeCalendarMenu()
    clearTimeout(calendarConfirmTimer)
    calendarConfirmTimer = setTimeout(() => {
      calendarAdded.value = false
    }, 3000)
  } catch {
    calendarError.value = true
    closeCalendarMenu()
    clearTimeout(calendarConfirmTimer)
    calendarConfirmTimer = setTimeout(() => {
      calendarError.value = false
    }, 5000)
  }
}

const calendarInputValid = computed(() => {
  if (!event.value) return false
  return validateCalendarInput(eventToCalendarInput(event.value)).valid
})

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

function formatEventLanguageLabel(language: string | null | undefined): string | null {
  if (!language) return null
  const key = `filters.lang${language.charAt(0).toUpperCase()}${language.slice(1).toLowerCase()}`
  const translated = t(key)
  return translated !== key ? translated : language.toUpperCase()
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

// ── Discussion section ────────────────────────────────────────────────────────

const discussionEntries = computed(() => discussionStore.getEntries(slug.value))
const discussionLoading = computed(() => discussionStore.loading)
const discussionError = computed(() => discussionStore.error)
const discussionPosting = computed(() => discussionStore.posting)
const discussionPostError = computed(() => discussionStore.postError)

/** Whether the current user can reply or hide entries (organizer or admin). */
const canModerateDiscussion = computed(() => {
  if (!authStore.isAuthenticated || !event.value) return false
  if (authStore.isAdmin) return true
  return event.value.submittedByUserId === authStore.currentUser?.id
})

const discussionNewBody = ref('')
const discussionValidationError = ref<string | null>(null)
const discussionReplyingToId = ref<string | null>(null)
const discussionReplyBody = ref('')
const discussionReplyValidationError = ref<string | null>(null)
const discussionHidingId = ref<string | null>(null)
const discussionHideError = ref<string | null>(null)

function formatDiscussionTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return t('discussion.justNow')
  return date.toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function handlePostQuestion() {
  const body = discussionNewBody.value.trim()
  if (!body) {
    discussionValidationError.value = t('discussion.validationEmpty')
    return
  }
  if (body.length > 2000) {
    discussionValidationError.value = t('discussion.validationTooLong')
    return
  }
  discussionValidationError.value = null
  if (!event.value) return
  try {
    const entry = await discussionStore.postQuestion(event.value.id, body)
    discussionStore.addEntry(slug.value, entry)
    discussionNewBody.value = ''
  } catch {
    // postError shown via discussionPostError computed
  }
}

async function handlePostReply(parentId: string) {
  const body = discussionReplyBody.value.trim()
  if (!body) {
    discussionReplyValidationError.value = t('discussion.validationEmpty')
    return
  }
  if (body.length > 2000) {
    discussionReplyValidationError.value = t('discussion.validationTooLong')
    return
  }
  discussionReplyValidationError.value = null
  try {
    const entry = await discussionStore.replyToEntry(parentId, body)
    discussionStore.addEntry(slug.value, entry)
    discussionReplyBody.value = ''
    discussionReplyingToId.value = null
  } catch {
    // postError shown via discussionPostError computed
  }
}

async function handleHideEntry(entryId: string) {
  discussionHidingId.value = entryId
  discussionHideError.value = null
  try {
    const updated = await discussionStore.hideEntry(entryId)
    discussionStore.updateEntry(slug.value, updated)
  } catch {
    discussionHideError.value = t('discussion.hideError')
  } finally {
    discussionHidingId.value = null
  }
}

function startReply(entryId: string) {
  discussionReplyingToId.value = entryId
  discussionReplyBody.value = ''
  discussionReplyValidationError.value = null
}

function cancelReply() {
  discussionReplyingToId.value = null
  discussionReplyBody.value = ''
  discussionReplyValidationError.value = null
}

/** Top-level entries only (no parent). Replies are shown beneath their parent. */
const topLevelEntries = computed(() =>
  discussionEntries.value.filter((e) => e.parentEntryId === null),
)

/** Get all replies for a given parent entry id. */
function repliesFor(parentId: string) {
  return discussionEntries.value.filter((e) => e.parentEntryId === parentId)
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
      <!-- Stale-data notice: shown when offline or when event data was served from SW cache -->
      <div v-if="showStaleNotice" role="status" aria-live="polite" class="stale-data-notice">
        <span aria-hidden="true">{{ isOffline ? '📡' : '🕐' }}</span>
        <span>{{ isOffline ? t('eventDetail.offlineStale') : (detailDataAge ?? t('eventDetail.cachedDataRecent')) }}</span>
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
            <template v-for="tag in event.eventTags ?? []" :key="tag.id">
              <RouterLink :to="`/category/${tag.domain.slug}`" class="badge badge-primary domain-link">
                {{ tag.domain.name }}
              </RouterLink>
            </template>
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
          <RouterLink v-if="canEdit" :to="`/edit/${event.id}`" class="btn btn-outline btn-sm edit-event-btn">
            {{ t('eventDetail.editEvent') }}
          </RouterLink>
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
              <p v-if="event.language" class="language-label text-secondary">
                <span aria-hidden="true">🗣</span>
                {{ t('eventDetail.language') }}: {{ formatEventLanguageLabel(event.language) }}
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

              <!-- Add to calendar (only for published events) -->
              <div v-if="event.status === 'PUBLISHED'" class="calendar-action" @keydown.escape="closeCalendarMenu(true)">
                <button
                  ref="calendarBtnRef"
                  class="btn btn-outline calendar-btn"
                  :aria-expanded="calendarMenuOpen"
                  :aria-haspopup="calendarInputValid ? 'menu' : undefined"
                  :disabled="!calendarInputValid"
                  :aria-label="!calendarInputValid ? t('eventDetail.calendarUnavailable') : calendarError ? t('eventDetail.calendarDownloadFailed') : calendarAdded ? t('eventDetail.calendarAdded') : t('eventDetail.addToCalendar')"
                  @click="calendarInputValid && toggleCalendarMenu()"
                >
                  <span aria-hidden="true">📅</span>
                  {{ !calendarInputValid ? t('eventDetail.calendarUnavailable') : calendarError ? t('eventDetail.calendarDownloadFailed') : calendarAdded ? t('eventDetail.calendarAdded') : t('eventDetail.addToCalendar') }}
                  <span v-if="calendarInputValid" aria-hidden="true" class="chevron">▾</span>
                </button>

                <div
                  v-if="calendarMenuOpen"
                  ref="calendarMenuRef"
                  class="calendar-menu"
                  role="menu"
                  :aria-label="t('eventDetail.calendarMenuLabel')"
                  @click.stop
                  @keydown="handleCalendarMenuKeydown"
                  @focusout="handleCalendarMenuFocusout"
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
              <div v-else class="attendee-cta-saved">
                <p class="attendee-cta attendee-cta--saved">
                  ✓ {{ t('eventDetail.youveSavedThisEvent') }}
                </p>
                <ReminderToggle
                  :event-id="event.id"
                  :starts-at-utc="event.startsAtUtc"
                  :is-saved="isFavorited"
                />
                <!-- Post-save calendar prompt: encourage the user to also add to calendar -->
                <div
                  v-if="event.status === 'PUBLISHED' && calendarInputValid"
                  class="calendar-prompt"
                >
                  <p class="calendar-prompt-text">{{ t('eventDetail.addToCalendarPrompt') }}</p>
                  <button
                    class="btn btn-outline btn-sm calendar-prompt-btn"
                    @click.stop="toggleCalendarMenu"
                  >
                    <span aria-hidden="true">📅</span>
                    {{ t('eventDetail.addToCalendarPromptBtn') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Hub context card: links event back to its branded category hub -->
            <div
              v-if="event.domain?.slug"
              class="hub-context"
              :style="hubContextAccentColor ? `--hub-accent: ${hubContextAccentColor}` : ''"
              aria-label="Community hub"
            >
              <h3 class="map-heading">{{ t('eventDetail.hubContextHeading') }}</h3>
              <div class="hub-context-body">
                <img
                  v-if="event.domain.logoUrl"
                  :src="event.domain.logoUrl"
                  :alt="event.domain.name"
                  class="hub-context-logo"
                />
                <div class="hub-context-info">
                  <p class="hub-context-name">{{ event.domain.name }}</p>
                  <p v-if="event.domain.description" class="hub-context-description">
                    {{ event.domain.description }}
                  </p>
                  <p v-else-if="hubContextOverviewExcerpt" class="hub-context-description">
                    {{ hubContextOverviewExcerpt }}
                  </p>
                  <p v-if="event.domain.curatorCredit" class="hub-context-curator">
                    <span class="hub-context-curator-icon" aria-hidden="true">✓</span>
                    {{ t('category.curatedBy', { credit: event.domain.curatorCredit }) }}
                  </p>
                </div>
              </div>
              <RouterLink
                :to="`/category/${event.domain.slug}`"
                class="hub-context-link"
              >
                {{ t('eventDetail.hubContextExplore', { name: event.domain.name }) }}
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Community groups section: links event back to organizing communities -->
        <div
          v-if="event.communityGroups && event.communityGroups.length > 0"
          class="community-groups-section card"
        >
          <h3 class="map-heading">{{ t('eventDetail.communityGroupsHeading') }}</h3>
          <ul class="community-groups-list">
            <li
              v-for="group in event.communityGroups"
              :key="group.id"
              class="community-group-item"
            >
              <RouterLink :to="`/community/${group.slug}`" class="community-group-link">
                <span class="community-group-name">{{ group.name }}</span>
                <span v-if="group.summary" class="community-group-summary">{{ group.summary }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- Discussion section -->
        <section class="discussion-section card" aria-label="Event discussion">
          <h2 class="discussion-heading">{{ t('discussion.heading') }}</h2>
          <p class="discussion-description">{{ t('discussion.description') }}</p>

          <!-- Load error -->
          <div v-if="discussionError" class="discussion-load-error" role="alert">
            <p>{{ t('discussion.loadError') }}</p>
            <button class="btn btn-sm btn-outline" @click="discussionStore.fetchDiscussion(slug)">
              {{ t('common.tryAgain') }}
            </button>
          </div>

          <template v-else>
            <!-- Loading state -->
            <div v-if="discussionLoading" class="discussion-loading" aria-live="polite">
              <div class="skeleton-line"></div>
              <div class="skeleton-line skeleton-short"></div>
            </div>

            <!-- Entry list -->
            <template v-else>
              <!-- Hide error -->
              <p v-if="discussionHideError" class="discussion-error" role="alert">{{ discussionHideError }}</p>

              <ol v-if="topLevelEntries.length > 0" class="discussion-list" aria-label="Discussion entries">
                <li
                  v-for="entry in topLevelEntries"
                  :key="entry.id"
                  class="discussion-entry"
                  :class="{ 'discussion-entry--hidden': entry.isHidden }"
                >
                  <!-- Hidden entry notice -->
                  <p v-if="entry.isHidden" class="discussion-hidden-notice">
                    <span aria-hidden="true">🚫</span> {{ t('discussion.hidden') }}
                  </p>

                  <!-- Normal entry -->
                  <template v-else>
                    <div class="discussion-entry-header">
                      <span class="discussion-author">{{ entry.authorDisplayName }}</span>
                      <span
                        v-if="entry.authorRole === 'ORGANIZER'"
                        class="discussion-badge discussion-badge--organizer"
                      >{{ t('discussion.badgeOrganizer') }}</span>
                      <span
                        v-else-if="entry.authorRole === 'ADMIN'"
                        class="discussion-badge discussion-badge--admin"
                      >{{ t('discussion.badgeAdmin') }}</span>
                      <time
                        class="discussion-time"
                        :datetime="entry.createdAtUtc"
                      >{{ formatDiscussionTime(entry.createdAtUtc) }}</time>
                    </div>
                    <p class="discussion-body">{{ entry.body }}</p>

                    <!-- Actions: reply (organizer/admin) and hide (organizer/admin) -->
                    <div v-if="canModerateDiscussion" class="discussion-actions">
                      <button
                        v-if="discussionReplyingToId !== entry.id"
                        class="btn btn-sm btn-outline discussion-reply-btn"
                        @click="startReply(entry.id)"
                      >{{ t('discussion.reply') }}</button>
                      <button
                        class="btn btn-sm btn-outline discussion-hide-btn"
                        :disabled="discussionHidingId === entry.id"
                        @click="handleHideEntry(entry.id)"
                      >{{ discussionHidingId === entry.id ? t('discussion.hiding') : t('discussion.hide') }}</button>
                    </div>

                    <!-- Inline reply composer -->
                    <div v-if="discussionReplyingToId === entry.id" class="discussion-reply-composer">
                      <label :for="`reply-${entry.id}`" class="visually-hidden">{{ t('discussion.replyPlaceholder') }}</label>
                      <textarea
                        :id="`reply-${entry.id}`"
                        v-model="discussionReplyBody"
                        :placeholder="t('discussion.replyPlaceholder')"
                        :disabled="discussionPosting"
                        class="discussion-textarea"
                        maxlength="2000"
                        rows="3"
                      ></textarea>
                      <p v-if="discussionReplyValidationError" class="discussion-error" role="alert">
                        {{ discussionReplyValidationError }}
                      </p>
                      <p v-if="discussionPostError" class="discussion-error" role="alert">
                        {{ t('discussion.postError') }}
                      </p>
                      <div class="discussion-composer-actions">
                        <button
                          class="btn btn-primary btn-sm"
                          :disabled="discussionPosting"
                          @click="handlePostReply(entry.id)"
                        >{{ discussionPosting ? t('discussion.posting') : t('discussion.postReply') }}</button>
                        <button
                          class="btn btn-outline btn-sm"
                          :disabled="discussionPosting"
                          @click="cancelReply"
                        >{{ t('discussion.cancel') }}</button>
                      </div>
                    </div>
                  </template>

                  <!-- Replies to this entry -->
                  <ol
                    v-if="repliesFor(entry.id).length > 0"
                    class="discussion-replies"
                    aria-label="Replies"
                  >
                    <li
                      v-for="reply in repliesFor(entry.id)"
                      :key="reply.id"
                      class="discussion-entry discussion-entry--reply"
                      :class="{ 'discussion-entry--hidden': reply.isHidden }"
                    >
                      <p v-if="reply.isHidden" class="discussion-hidden-notice">
                        <span aria-hidden="true">🚫</span> {{ t('discussion.hidden') }}
                      </p>
                      <template v-else>
                        <div class="discussion-entry-header">
                          <span class="discussion-author">{{ reply.authorDisplayName }}</span>
                          <span
                            v-if="reply.authorRole === 'ORGANIZER'"
                            class="discussion-badge discussion-badge--organizer"
                          >{{ t('discussion.badgeOrganizer') }}</span>
                          <span
                            v-else-if="reply.authorRole === 'ADMIN'"
                            class="discussion-badge discussion-badge--admin"
                          >{{ t('discussion.badgeAdmin') }}</span>
                          <time class="discussion-time" :datetime="reply.createdAtUtc">{{ formatDiscussionTime(reply.createdAtUtc) }}</time>
                        </div>
                        <p class="discussion-body">{{ reply.body }}</p>
                        <!-- Organizer/admin can also hide replies -->
                        <div v-if="canModerateDiscussion" class="discussion-actions">
                          <button
                            class="btn btn-sm btn-outline discussion-hide-btn"
                            :disabled="discussionHidingId === reply.id"
                            @click="handleHideEntry(reply.id)"
                          >{{ discussionHidingId === reply.id ? t('discussion.hiding') : t('discussion.hide') }}</button>
                        </div>
                      </template>
                    </li>
                  </ol>
                </li>
              </ol>

              <!-- Empty state -->
              <div v-else class="discussion-empty">
                <p v-if="authStore.isAuthenticated">{{ t('discussion.emptySignedIn') }}</p>
                <p v-else>{{ t('discussion.empty') }}</p>
              </div>
            </template>

            <!-- Question composer for authenticated users -->
            <div v-if="authStore.isAuthenticated" class="discussion-composer">
              <label for="discussion-new-body" class="visually-hidden">{{ t('discussion.askPlaceholder') }}</label>
              <textarea
                id="discussion-new-body"
                v-model="discussionNewBody"
                :placeholder="t('discussion.askPlaceholder')"
                :disabled="discussionPosting"
                class="discussion-textarea"
                maxlength="2000"
                rows="4"
              ></textarea>
              <p v-if="discussionValidationError" class="discussion-error" role="alert">
                {{ discussionValidationError }}
              </p>
              <p v-if="discussionPostError && !discussionReplyingToId" class="discussion-error" role="alert">
                {{ t('discussion.postError') }}
              </p>
              <button
                class="btn btn-primary discussion-submit-btn"
                :disabled="discussionPosting"
                @click="handlePostQuestion"
              >{{ discussionPosting ? t('discussion.posting') : t('discussion.postQuestion') }}</button>
            </div>

            <!-- Sign-in notice for unauthenticated users (plain text – no link to avoid ambiguity with page-level sign-in CTAs) -->
            <p v-else class="discussion-signin-cta">{{ t('discussion.signInToAsk') }}</p>
          </template>
        </section>
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

.edit-event-btn {
  margin-top: 0.5rem;
  align-self: flex-start;
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

.attendee-cta-saved {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.calendar-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--color-surface-raised, #f8f9fa);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.calendar-prompt-text {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.calendar-prompt-btn {
  align-self: flex-start;
  font-size: 0.8125rem;
}

.link-subtle {
  color: var(--color-primary);
  text-decoration: none;
}

.link-subtle:hover {
  text-decoration: underline;
}

/* Hub context card */
.hub-context {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.hub-context-body {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.hub-context-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  border: 1px solid var(--color-border);
}

.hub-context-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.hub-context-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.hub-context-description {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.hub-context-curator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.hub-context-curator-icon {
  color: var(--hub-accent, var(--color-primary));
  font-size: 0.875rem;
}

.hub-context-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--hub-accent, var(--color-primary));
  text-decoration: none;
  transition: opacity 0.15s;
}

.hub-context-link:hover {
  opacity: 0.8;
  text-decoration: none;
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
  .attendee-context,
  .hub-context {
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

/* ── Discussion section ─────────────────────────────────────────────────────── */

.discussion-section {
  margin-top: 1.5rem;
  padding: 1.5rem;
}

.discussion-heading {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.discussion-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0 0 1.25rem;
}

.discussion-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.discussion-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.discussion-entry {
  background: var(--color-bg-secondary, #f9f9f9);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
}

.discussion-entry--reply {
  margin-top: 0.5rem;
  border-left: 3px solid var(--color-primary, #2563eb);
  background: var(--color-bg, #fff);
}

.discussion-entry--hidden {
  opacity: 0.6;
}

.discussion-entry-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.375rem;
}

.discussion-author {
  font-weight: 600;
  font-size: 0.875rem;
}

.discussion-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.discussion-badge--organizer {
  background: var(--color-primary, #2563eb);
  color: #fff;
}

.discussion-badge--admin {
  background: #7c3aed;
  color: #fff;
}

.discussion-time {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-left: auto;
}

.discussion-body {
  font-size: 0.9375rem;
  line-height: 1.55;
  margin: 0;
  word-break: break-word;
}

.discussion-hidden-notice {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0;
}

.discussion-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.discussion-replies {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.discussion-reply-composer {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.discussion-composer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.discussion-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  background: var(--color-bg, #fff);
  color: var(--color-text);
}

.discussion-textarea:focus {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 1px;
}

.discussion-composer-actions {
  display: flex;
  gap: 0.5rem;
}

.discussion-submit-btn {
  align-self: flex-start;
}

.discussion-error {
  color: var(--color-danger, #dc2626);
  font-size: 0.8125rem;
  margin: 0;
}

.discussion-load-error {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.discussion-empty {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin-bottom: 1rem;
}

.discussion-signin-cta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
