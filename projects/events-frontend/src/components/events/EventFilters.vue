<script setup lang="ts">
import { useEventsStore } from '@/stores/events'
import { useCategoriesStore } from '@/stores/categories'

const eventsStore = useEventsStore()
const categories = useCategoriesStore()
</script>

<template>
  <div class="event-filters card">
    <div class="filters-grid">
      <div class="form-group">
        <label class="form-label" for="filter-search">Search</label>
        <input
          id="filter-search"
          class="form-input"
          type="text"
          placeholder="Search events..."
          :value="eventsStore.filters.search"
          @input="eventsStore.setFilters({ search: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-category">Category</label>
        <select
          id="filter-category"
          class="form-select"
          :value="eventsStore.filters.category"
          @change="
            eventsStore.setFilters({ category: ($event.target as HTMLSelectElement).value })
          "
        >
          <option value="">All Categories</option>
          <option v-for="cat in categories.categories" :key="cat.id" :value="cat.slug">
            {{ cat.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-date-from">From</label>
        <input
          id="filter-date-from"
          class="form-input"
          type="date"
          :value="eventsStore.filters.dateFrom"
          @input="eventsStore.setFilters({ dateFrom: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-date-to">To</label>
        <input
          id="filter-date-to"
          class="form-input"
          type="date"
          :value="eventsStore.filters.dateTo"
          @input="eventsStore.setFilters({ dateTo: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-location">Location</label>
        <input
          id="filter-location"
          class="form-input"
          type="text"
          placeholder="City or venue..."
          :value="eventsStore.filters.location"
          @input="eventsStore.setFilters({ location: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="form-group filter-actions">
        <button class="btn btn-secondary" @click="eventsStore.clearFilters()">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-filters {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  align-items: end;
}

.filter-actions {
  display: flex;
  align-items: end;
}

.filter-actions .btn {
  width: 100%;
  justify-content: center;
}
</style>
