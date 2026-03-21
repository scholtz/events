<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFavoritesStore } from '@/stores/favorites'
import { useAuthStore } from '@/stores/auth'
import { formatEventPrice } from '@/stores/events'
import type { AttendanceMode, CatalogEvent } from '@/types'

const { t, locale } = useI18n()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()

const upcomingFavorites = computed(() => {
  const now = new Date()
  return favoritesStore.favoriteEvents.filter((e) => new Date(e.startsAtUtc) >= now)
})

const pastFavorites = computed(() => {
  const now = new Date()
  return favoritesStore.favoriteEvents.filter((e) => new Date(e.startsAtUtc) < now)
})

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await favoritesStore.fetchFavoriteEvents()
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(locale.value, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function locationSummary(event: CatalogEvent): string {
  if (event.venueName && event.city) return `${event.venueName}, ${event.city}`
  return event.venueName || event.city || t('eventCard.locationTbd')
}

async function handleUnfavorite(eventId: string) {
  await favoritesStore.unfavoriteEvent(eventId)
}

function attendanceModeLabel(mode: AttendanceMode): string {
  return t(`attendanceMode.${mode}`)
}
</script>

<template>
  <div class="container favorites-view">
    <div class="favorites-header">
      <h1>{{ t('favorites.title') }}</h1>
      <p class="favorites-subtitle">{{ t('favorites.subtitle') }}</p>
    </div>

    <template v-if="!authStore.isAuthenticated">
      <div class="empty-state card">
        <div class="empty-icon">🔐</div>
        <h2>{{ t('favorites.signInTitle') }}</h2>
        <p>{{ t('favorites.signInDescription') }}</p>
        <RouterLink to="/login" class="btn btn-primary">{{ t('common.signIn') }}</RouterLink>
      </div>
    </template>

    <template v-else-if="favoritesStore.loading">
      <div class="loading-state">
        <p>{{ t('favorites.loadingMessage') }}</p>
      </div>
    </template>

    <template v-else-if="favoritesStore.error">
      <div class="error-state card">
        <div class="empty-icon">⚠️</div>
        <h2>{{ t('favorites.errorTitle') }}</h2>
        <p>{{ favoritesStore.error }}</p>
        <button class="btn btn-primary" @click="favoritesStore.fetchFavoriteEvents()">{{ t('common.tryAgain') }}</button>
      </div>
    </template>

    <template v-else-if="favoritesStore.favoriteEvents.length === 0">
      <div class="empty-state card">
        <div class="empty-icon">⭐</div>
        <h2>{{ t('favorites.emptyTitle') }}</h2>
        <p>{{ t('favorites.emptyDescription') }}</p>
        <RouterLink to="/" class="btn btn-primary">{{ t('favorites.browseEvents') }}</RouterLink>
      </div>
    </template>

    <template v-else>
      <section v-if="upcomingFavorites.length > 0" class="favorites-section">
        <h2 class="section-heading">{{ t('favorites.upcoming') }} ({{ upcomingFavorites.length }})</h2>
        <div class="favorites-list">
          <article
            v-for="event in upcomingFavorites"
            :key="event.id"
            class="favorite-item card"
          >
            <div class="favorite-item-body">
              <div class="favorite-item-meta">
                <div class="favorite-item-badges">
                  <span class="badge badge-primary">{{ event.domain?.name ?? 'Event' }}</span>
                  <span class="badge badge-mode">{{ attendanceModeLabel(event.attendanceMode) }}</span>
                </div>
                <span class="favorite-date">{{ formatDate(event.startsAtUtc) }} · {{ formatTime(event.startsAtUtc) }}</span>
              </div>
              <h3 class="favorite-title">
                <RouterLink :to="`/event/${event.slug}`" class="favorite-title-link">
                  {{ event.name }}
                </RouterLink>
              </h3>
              <p class="favorite-location">📍 {{ locationSummary(event) }}</p>
              <p class="favorite-price">💳 {{ formatEventPrice(event) }}</p>
              <div class="favorite-actions">
                <RouterLink :to="`/event/${event.slug}`" class="btn btn-primary btn-sm">
                  {{ t('eventCard.viewDetails') }}
                </RouterLink>
                <a
                  :href="event.eventUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-outline btn-sm"
                >
                  {{ t('eventCard.eventLink') }}
                </a>
                <button
                  class="btn btn-ghost btn-sm unsave-btn"
                  :aria-label="t('favorites.removeLabel')"
                  @click="handleUnfavorite(event.id)"
                >
                  {{ t('favorites.remove') }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-if="pastFavorites.length > 0" class="favorites-section past-section">
        <h2 class="section-heading past-heading">{{ t('favorites.past') }} ({{ pastFavorites.length }})</h2>
        <div class="favorites-list">
          <article
            v-for="event in pastFavorites"
            :key="event.id"
            class="favorite-item card past-item"
          >
            <div class="favorite-item-body">
              <div class="favorite-item-meta">
                <div class="favorite-item-badges">
                  <span class="badge badge-primary">{{ event.domain?.name ?? 'Event' }}</span>
                  <span class="badge badge-mode">{{ attendanceModeLabel(event.attendanceMode) }}</span>
                </div>
                <span class="favorite-date">{{ formatDate(event.startsAtUtc) }} · {{ formatTime(event.startsAtUtc) }}</span>
              </div>
              <h3 class="favorite-title">
                <RouterLink :to="`/event/${event.slug}`" class="favorite-title-link">
                  {{ event.name }}
                </RouterLink>
              </h3>
              <p class="favorite-location">📍 {{ locationSummary(event) }}</p>
              <p class="favorite-price">💳 {{ formatEventPrice(event) }}</p>
              <div class="favorite-actions">
                <RouterLink :to="`/event/${event.slug}`" class="btn btn-outline btn-sm">
                  {{ t('eventCard.viewDetails') }}
                </RouterLink>
                <button
                  class="btn btn-ghost btn-sm unsave-btn"
                  :aria-label="t('favorites.removeLabel')"
                  @click="handleUnfavorite(event.id)"
                >
                  {{ t('favorites.remove') }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.favorites-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.favorites-header {
  margin-bottom: 2rem;
}

.favorites-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}

.favorites-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.loading-state {
  text-align: center;
  padding: 3rem 0;
  color: var(--color-text-secondary);
}

.empty-state,
.error-state {
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

.empty-state h2,
.error-state h2 {
  font-size: 1.375rem;
  font-weight: 700;
}

.empty-state p,
.error-state p {
  color: var(--color-text-secondary);
  max-width: 380px;
}

.favorites-section {
  margin-bottom: 2.5rem;
}

.past-section {
  opacity: 0.8;
}

.section-heading {
  font-size: 1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}

.past-heading {
  color: var(--color-text-secondary);
}

.favorites-list {
  display: grid;
  gap: 1rem;
}

.favorite-item {
  transition:
    box-shadow 0.2s,
    border-color 0.2s;
}

.favorite-item:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

.past-item {
  opacity: 0.75;
}

.past-item:hover {
  opacity: 1;
}

.favorite-item-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.favorite-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.favorite-item-badges {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.favorite-date {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.favorite-title {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.4;
}

.favorite-title-link {
  color: var(--color-text);
  text-decoration: none;
}

.favorite-title-link:hover {
  color: var(--color-primary);
}

.favorite-location,
.favorite-price {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.favorite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.btn-outline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.btn-ghost {
  background: transparent;
  border: none;
}

.unsave-btn {
  color: var(--color-warning, #f59e0b);
  padding-inline: 0;
}

.unsave-btn:hover {
  text-decoration: underline;
}
</style>
