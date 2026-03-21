<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatEventPrice } from '@/stores/events'
import { useFavoritesStore } from '@/stores/favorites'
import { useAuthStore } from '@/stores/auth'
import { useDiscoveryAnalytics } from '@/composables/useDiscoveryAnalytics'
import { useEventsStore } from '@/stores/events'
import type { CatalogEvent } from '@/types'

const props = defineProps<{
  event: CatalogEvent
}>()

const { t, locale } = useI18n()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const eventsStore = useEventsStore()
const { trackResultClick } = useDiscoveryAnalytics()

const favoriting = ref(false)

function domainUrl(event: CatalogEvent): string {
  const slug = event.domain?.slug
  if (!slug) return '/'
  return `/category/${slug}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
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

const locationSummary = computed(() => {
  if (props.event.venueName && props.event.city) return `${props.event.venueName}, ${props.event.city}`
  return props.event.venueName || props.event.city || t('eventCard.locationTbd')
})

const priceSummary = computed(() => formatEventPrice(props.event))

const attendanceModeLabel = computed(() => {
  return t(`attendanceMode.${props.event.attendanceMode}`)
})

const isFavorited = computed(() => favoritesStore.isFavorited(props.event.id))

function handleResultClick() {
  trackResultClick(props.event.slug, eventsStore.activeFilterChips.length)
}

async function handleFavoriteToggle() {
  if (!authStore.isAuthenticated) return
  favoriting.value = true
  try {
    await favoritesStore.toggleFavorite(props.event.id)
  } finally {
    favoriting.value = false
  }
}
</script>

<template>
  <article class="event-card card">
    <div class="event-card-body">
      <div class="event-meta">
        <RouterLink :to="domainUrl(event)" class="badge badge-primary domain-link">
          {{ event.domain?.name ?? 'Event' }}
        </RouterLink>
        <div class="event-meta-right">
          <span class="badge badge-mode">{{ attendanceModeLabel }}</span>
          <span class="event-date">{{ formatDate(event.startsAtUtc) }}</span>
          <button
            v-if="authStore.isAuthenticated"
            class="favorite-btn"
            :class="{ 'is-favorited': isFavorited }"
            :aria-label="isFavorited ? t('eventCard.removeFromFavorites') : t('eventCard.addToFavorites')"
            :aria-pressed="isFavorited"
            :disabled="favoriting"
            @click.prevent="handleFavoriteToggle"
          >
            {{ isFavorited ? '★' : '☆' }}
          </button>
        </div>
      </div>

      <h3 class="event-title">
        <RouterLink :to="`/event/${event.slug}`" class="event-title-link" @click="handleResultClick">
          {{ event.name }}
        </RouterLink>
      </h3>

      <p class="event-description">{{ event.description }}</p>

      <dl class="event-details">
        <div class="event-detail-item">
          <dt>{{ t('eventCard.date') }}</dt>
          <dd>{{ formatDate(event.startsAtUtc) }} · {{ formatTime(event.startsAtUtc) }}</dd>
        </div>
        <div class="event-detail-item">
          <dt>{{ t('eventCard.location') }}</dt>
          <dd>{{ locationSummary }}</dd>
        </div>
        <div class="event-detail-item">
          <dt>{{ t('eventCard.priceLbl') }}</dt>
          <dd>{{ priceSummary }}</dd>
        </div>
      </dl>

      <div class="event-actions">
        <RouterLink :to="`/event/${event.slug}`" class="btn btn-primary btn-sm" @click="handleResultClick">{{ t('eventCard.viewDetails') }}</RouterLink>
        <a
          :href="event.eventUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-outline btn-sm"
        >
          {{ t('eventCard.eventLink') }}
        </a>
        <a
          v-if="event.mapUrl"
          :href="event.mapUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-ghost btn-sm"
        >
          {{ t('eventCard.map') }}
        </a>
      </div>
    </div>
  </article>
</template>

<style scoped>
.event-card {
  color: inherit;
  transition:
    box-shadow 0.2s,
    transform 0.2s,
    border-color 0.2s;
  overflow: hidden;
}

.event-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-primary);
}

.event-card-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.event-meta-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  cursor: pointer;
  transition: opacity 0.15s;
}

.domain-link:hover {
  opacity: 0.8;
  text-decoration: none;
}

.event-date {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.event-title {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.4;
}

.event-title-link {
  color: var(--color-text);
  text-decoration: none;
}

.event-title-link:hover {
  color: var(--color-primary);
}

.event-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.event-details {
  display: grid;
  gap: 0.625rem;
  margin: 0;
}

.event-detail-item {
  display: grid;
  gap: 0.125rem;
}

.event-detail-item dt {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.event-detail-item dd {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text);
}

.event-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
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
  color: var(--color-primary);
  border: none;
  padding-inline: 0;
}

.btn-ghost:hover {
  text-decoration: underline;
}

.favorite-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.125rem;
  color: var(--color-text-secondary);
  padding: 0.125rem 0.25rem;
  line-height: 1;
  transition: color 0.15s, transform 0.1s;
  border-radius: var(--radius-sm);
}

.favorite-btn:hover:not(:disabled) {
  color: var(--color-warning, #f59e0b);
  transform: scale(1.15);
}

.favorite-btn.is-favorited {
  color: var(--color-warning, #f59e0b);
}

.favorite-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
