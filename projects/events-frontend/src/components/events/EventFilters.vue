<script setup lang="ts">
import { useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'

const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()
</script>

<template>
  <div class="event-filters card">
    <div class="filters-grid">
      <div class="form-group filter-search">
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
        <label class="form-label" for="filter-domain">Domain</label>
        <select
          id="filter-domain"
          class="form-select"
          :value="eventsStore.filters.domain"
          @change="
            eventsStore.setFilters({ domain: ($event.target as HTMLSelectElement).value })
          "
        >
          <option value="">All Domains</option>
          <option v-for="d in domainsStore.domains" :key="d.id" :value="d.slug">
            {{ d.name }}
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
        <label class="form-label" for="filter-city">City</label>
        <input
          id="filter-city"
          class="form-input"
          type="text"
          placeholder="City or venue..."
          :value="eventsStore.filters.city"
          @input="eventsStore.setFilters({ city: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="form-group filter-actions">
        <button class="btn btn-outline" @click="eventsStore.clearFilters()">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-filters {
  padding: 1.125rem 1.25rem;
  margin-bottom: 1.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: 2fr repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.625rem;
  align-items: end;
}

.filter-search {
  grid-column: span 1;
}

.filter-actions {
  display: flex;
  align-items: flex-end;
}

.btn-outline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  width: 100%;
  justify-content: center;
}

.btn-outline:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
}

@media (max-width: 768px) {
  .filters-grid {
    grid-template-columns: 1fr 1fr;
  }

  .filter-search {
    grid-column: 1 / -1;
  }
}
</style>
