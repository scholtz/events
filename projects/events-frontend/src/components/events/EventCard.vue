<script setup lang="ts">
import type { EventItem } from '@/types'
import { useCategoriesStore } from '@/stores/categories'

defineProps<{
  event: EventItem
}>()

const categories = useCategoriesStore()

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <RouterLink :to="`/event/${event.id}`" class="event-card card">
    <div class="event-card-body">
      <div class="event-meta">
        <span
          class="badge"
          :style="{
            background: (categories.getCategoryBySlug(event.category)?.color ?? '#6b7280') + '20',
            color: categories.getCategoryBySlug(event.category)?.color ?? '#6b7280',
          }"
        >
          {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
        </span>
        <span class="event-date">{{ formatDate(event.date) }}</span>
      </div>
      <h3 class="event-title">{{ event.title }}</h3>
      <p class="event-description">{{ event.description }}</p>
      <div class="event-location">
        <span class="location-icon">📍</span>
        {{ event.location.name }}
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.event-card {
  display: block;
  text-decoration: none;
  color: inherit;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
  overflow: hidden;
}

.event-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  text-decoration: none;
}

.event-card-body {
  padding: 1.25rem;
}

.event-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.event-date {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.event-title {
  font-size: 1.0625rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.event-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.event-location {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.location-icon {
  font-size: 0.875rem;
}
</style>
