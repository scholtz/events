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
            background: (categories.getCategoryBySlug(event.category)?.color ?? '#137fec') + '22',
            color: categories.getCategoryBySlug(event.category)?.color ?? '#137fec',
          }"
        >
          {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
        </span>
        <span class="event-date">{{ formatDate(event.date) }}</span>
      </div>
      <h3 class="event-title">{{ event.title }}</h3>
      <p class="event-description">{{ event.description }}</p>
      <div class="event-footer">
        <div class="event-location">
          <svg
            class="location-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clip-rule="evenodd"
            />
          </svg>
          {{ event.location.name || event.location.address || 'Location TBD' }}
        </div>
        <span class="event-link-hint">View →</span>
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
    transform 0.2s,
    border-color 0.2s;
  overflow: hidden;
}

.event-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-primary);
  text-decoration: none;
}

.event-card-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  color: var(--color-text);
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

.event-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.event-location {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.location-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.event-link-hint {
  font-size: 0.8125rem;
  color: var(--color-primary);
  font-weight: 500;
  white-space: nowrap;
}
</style>
