<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { savedSearchToFilters, useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'
import { useSavedSearchesStore } from '@/stores/savedSearches'
import type { SavedSearch } from '@/types'

const { t } = useI18n()

const authStore = useAuthStore()
const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()
const savedSearchesStore = useSavedSearchesStore()

const savedSearchName = ref('')
const savingSearch = ref(false)
const filtersExpanded = ref(false)

// Local refs that hold the raw input values for the two free-text fields.
// Changes are debounced before being committed to the store so that the
// discovery query is not re-fired on every keystroke.
const searchInput = ref(eventsStore.filters.search)
const locationInput = ref(eventsStore.filters.location)

// Keep local inputs in sync when the store is updated externally
// (e.g. when "Clear all" is pressed or a saved search is applied).
watch(
  () => eventsStore.filters.search,
  (v) => {
    searchInput.value = v
  },
)
watch(
  () => eventsStore.filters.location,
  (v) => {
    locationInput.value = v
  },
)

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
let locationDebounceTimer: ReturnType<typeof setTimeout> | undefined

function onSearchInput(value: string) {
  searchInput.value = value
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    eventsStore.setFilters({ search: value })
  }, 300)
}

function onLocationInput(value: string) {
  locationInput.value = value
  clearTimeout(locationDebounceTimer)
  locationDebounceTimer = setTimeout(() => {
    eventsStore.setFilters({ location: value })
  }, 300)
}

const canSaveSearch = computed(
  () =>
    authStore.isAuthenticated &&
    eventsStore.hasActiveFilters &&
    savedSearchName.value.trim().length > 0 &&
    !savingSearch.value,
)

async function handleSaveSearch() {
  if (!canSaveSearch.value) return

  savingSearch.value = true
  try {
    await savedSearchesStore.saveSearch(savedSearchName.value.trim(), eventsStore.filters)
    savedSearchName.value = ''
  } finally {
    savingSearch.value = false
  }
}

function applySavedSearch(savedSearch: SavedSearch) {
  eventsStore.replaceFilters(savedSearchToFilters(savedSearch))
}

async function removeSavedSearch(savedSearchId: string) {
  await savedSearchesStore.deleteSavedSearch(savedSearchId)
}

function clearFilterChip(key: string) {
  switch (key) {
    case 'search':
      eventsStore.setFilters({ search: '' })
      break
    case 'domain':
      eventsStore.setFilters({ domain: '' })
      break
    case 'dateFrom':
      eventsStore.setFilters({ dateFrom: '' })
      break
    case 'dateTo':
      eventsStore.setFilters({ dateTo: '' })
      break
    case 'location':
      eventsStore.setFilters({ location: '' })
      break
    case 'priceType':
      eventsStore.setFilters({ priceType: 'ALL' })
      break
    case 'priceMin':
      eventsStore.setFilters({ priceMin: '' })
      break
    case 'priceMax':
      eventsStore.setFilters({ priceMax: '' })
      break
    case 'sortBy':
      eventsStore.setFilters({ sortBy: 'UPCOMING' })
      break
    case 'attendanceMode':
      eventsStore.setFilters({ attendanceMode: '' })
      break
    case 'language':
      eventsStore.setFilters({ language: '' })
      break
  }
}

/**
 * Resolves a human-readable label for a filter chip.
 * For the domain chip, replaces the raw slug with the domain's display name
 * (e.g. "Domain: Crypto & Blockchain" instead of "Domain: crypto-blockchain").
 */
function resolveChipLabel(chip: { key: string; label: string }): string {
  if (chip.key === 'domain' && eventsStore.filters.domain) {
    const domainName = domainsStore.domains.find((d) => d.slug === eventsStore.filters.domain)?.name
    if (domainName) return `Domain: ${domainName}`
  }
  return chip.label
}
</script>

<template>
  <div class="event-filters card">
    <div class="filters-header">
      <div>
        <h2>{{ t('filters.title') }}</h2>
      </div>
      <div class="filters-header-actions">
        <button class="btn btn-outline" @click="eventsStore.clearFilters()">{{ t('common.clearAll') }}</button>
        <button class="btn btn-outline toggle-filters-btn" @click="filtersExpanded = !filtersExpanded">
          {{ filtersExpanded ? t('filters.hideFilters') : t('filters.moreFilters') }}
        </button>
      </div>
    </div>

    <div class="filters-grid filters-grid-primary">
      <div class="form-group filter-search">
        <label class="form-label" for="filter-search">{{ t('filters.keyword') }}</label>
        <input
          id="filter-search"
          class="form-input"
          type="text"
          :placeholder="t('filters.keywordPlaceholder')"
          :value="searchInput"
          @input="onSearchInput(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-domain">{{ t('filters.domain') }}</label>
        <select
          id="filter-domain"
          class="form-select"
          :value="eventsStore.filters.domain"
          @change="eventsStore.setFilters({ domain: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">{{ t('filters.allDomains') }}</option>
          <option v-for="domain in domainsStore.domains" :key="domain.id" :value="domain.slug">
            {{ domain.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-show="filtersExpanded" class="filters-grid">

      <div class="form-group">
        <label class="form-label" for="filter-location">{{ t('filters.location') }}</label>
        <input
          id="filter-location"
          class="form-input"
          type="text"
          :placeholder="t('filters.locationPlaceholder')"
          :value="locationInput"
          @input="onLocationInput(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-attendance-mode">{{ t('filters.mode') }}</label>
        <select
          id="filter-attendance-mode"
          class="form-select"
          :value="eventsStore.filters.attendanceMode"
          @change="
            eventsStore.setFilters({
              attendanceMode: ($event.target as HTMLSelectElement).value as
                | 'IN_PERSON'
                | 'ONLINE'
                | 'HYBRID'
                | '',
            })
          "
        >
          <option value="">{{ t('filters.anyMode') }}</option>
          <option value="IN_PERSON">{{ t('filters.inPerson') }}</option>
          <option value="ONLINE">{{ t('filters.online') }}</option>
          <option value="HYBRID">{{ t('filters.hybrid') }}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-date-from">{{ t('filters.from') }}</label>
        <input
          id="filter-date-from"
          class="form-input"
          type="date"
          :value="eventsStore.filters.dateFrom"
          @input="eventsStore.setFilters({ dateFrom: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-date-to">{{ t('filters.to') }}</label>
        <input
          id="filter-date-to"
          class="form-input"
          type="date"
          :value="eventsStore.filters.dateTo"
          @input="eventsStore.setFilters({ dateTo: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-price-type">{{ t('filters.price') }}</label>
        <select
          id="filter-price-type"
          class="form-select"
          :value="eventsStore.filters.priceType"
          @change="
            eventsStore.setFilters({
              priceType: ($event.target as HTMLSelectElement).value as 'ALL' | 'FREE' | 'PAID',
            })
          "
        >
          <option value="ALL">{{ t('filters.anyPrice') }}</option>
          <option value="FREE">{{ t('filters.free') }}</option>
          <option value="PAID">{{ t('filters.paid') }}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-price-min">{{ t('filters.minPrice') }}</label>
        <input
          id="filter-price-min"
          class="form-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          :disabled="eventsStore.filters.priceType === 'FREE'"
          :value="eventsStore.filters.priceMin"
          @input="eventsStore.setFilters({ priceMin: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-price-max">{{ t('filters.maxPrice') }}</label>
        <input
          id="filter-price-max"
          class="form-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="250"
          :disabled="eventsStore.filters.priceType === 'FREE'"
          :value="eventsStore.filters.priceMax"
          @input="eventsStore.setFilters({ priceMax: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-sort">{{ t('filters.sortBy') }}</label>
        <select
          id="filter-sort"
          class="form-select"
          :value="eventsStore.filters.sortBy"
          @change="
            eventsStore.setFilters({
              sortBy: ($event.target as HTMLSelectElement).value as
                | 'UPCOMING'
                | 'NEWEST'
                | 'RELEVANCE',
            })
          "
        >
          <option value="UPCOMING">{{ t('filters.upcoming') }}</option>
          <option value="NEWEST">{{ t('filters.newest') }}</option>
          <option value="RELEVANCE">{{ t('filters.relevance') }}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="filter-language">{{ t('filters.language') }}</label>
        <select
          id="filter-language"
          class="form-select"
          :value="eventsStore.filters.language"
          @change="eventsStore.setFilters({ language: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">{{ t('filters.anyLanguage') }}</option>
          <option value="en">{{ t('filters.langEn') }}</option>
          <option value="cs">{{ t('filters.langCs') }}</option>
          <option value="sk">{{ t('filters.langSk') }}</option>
          <option value="de">{{ t('filters.langDe') }}</option>
          <option value="fr">{{ t('filters.langFr') }}</option>
          <option value="es">{{ t('filters.langEs') }}</option>
          <option value="pl">{{ t('filters.langPl') }}</option>
        </select>
      </div>
    </div>

    <div v-if="eventsStore.activeFilterChips.length" class="active-filters">
      <span class="active-label">{{ t('filters.activeFilters') }}</span>
      <button
        v-for="chip in eventsStore.activeFilterChips"
        :key="chip.key"
        class="filter-chip"
        type="button"
        @click="clearFilterChip(chip.key)"
      >
        {{ resolveChipLabel(chip) }}
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <div v-show="filtersExpanded" class="saved-searches card-section">
      <div class="saved-searches-header">
        <div>
          <h3>{{ t('filters.savedSearches') }}</h3>
          <p v-if="authStore.isAuthenticated">{{ t('filters.savedSearchesDescription') }}</p>
          <p v-else>{{ t('filters.savedSearchesSignIn') }}</p>
        </div>
        <RouterLink v-if="!authStore.isAuthenticated" to="/login" class="btn btn-outline btn-login">
          {{ t('common.signInLower') }}
        </RouterLink>
      </div>

      <div v-if="authStore.isAuthenticated" class="saved-search-form">
        <div class="form-group saved-search-name">
          <label class="form-label" for="saved-search-name">{{ t('filters.presetName') }}</label>
          <input
            id="saved-search-name"
            v-model="savedSearchName"
            class="form-input"
            type="text"
            :placeholder="t('filters.presetPlaceholder')"
          />
        </div>
        <button class="btn btn-primary save-search-btn" :disabled="!canSaveSearch" @click="handleSaveSearch">
          {{ savingSearch ? t('filters.saving') : t('filters.saveCurrentSearch') }}
        </button>
      </div>

      <p v-if="savedSearchesStore.error" class="saved-search-error">
        {{ savedSearchesStore.error }}
      </p>

      <div v-if="authStore.isAuthenticated && savedSearchesStore.savedSearches.length" class="saved-search-list">
        <div
          v-for="savedSearch in savedSearchesStore.savedSearches"
          :key="savedSearch.id"
          class="saved-search-item"
        >
          <button class="saved-search-apply" type="button" @click="applySavedSearch(savedSearch)">
            <span class="saved-search-name-text">{{ savedSearch.name }}</span>
            <span class="saved-search-meta">
              {{ savedSearch.locationText || savedSearch.domainSlug || t('filters.reusablePreset') }}
            </span>
          </button>
          <button
            class="saved-search-delete"
            type="button"
            :aria-label="t('filters.deleteSearch', { name: savedSearch.name })"
            @click="removeSavedSearch(savedSearch.id)"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>

      <p v-else-if="authStore.isAuthenticated && !savedSearchesStore.loading" class="saved-search-empty">
        {{ t('filters.noSavedSearches') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.event-filters {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.filters-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.filters-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.toggle-filters-btn {
  white-space: nowrap;
}

.filters-header h2,
.saved-searches-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.filters-header p,
.saved-searches-header p,
.saved-search-empty,
.saved-search-error {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.875rem;
  align-items: end;
}

.filters-grid-primary {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.active-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.filter-chip {
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.card-section {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}

.saved-searches-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.875rem;
}

.btn-outline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.btn-outline:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
}

.saved-search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: end;
}

.saved-search-name {
  margin-bottom: 0;
}

.save-search-btn,
.btn-login {
  justify-content: center;
}

.saved-search-list {
  display: grid;
  gap: 0.75rem;
}

.saved-search-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.01);
}

.saved-search-apply,
.saved-search-delete {
  border: none;
  background: transparent;
  text-align: left;
  color: inherit;
}

.saved-search-apply {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.saved-search-name-text {
  font-weight: 600;
  color: var(--color-text);
}

.saved-search-meta {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.saved-search-delete {
  color: var(--color-danger);
  font-size: 0.8125rem;
}

@media (max-width: 900px) {
  .filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filters-grid-primary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .filters-header,
  .saved-searches-header,
  .saved-search-form,
  .saved-search-item {
    grid-template-columns: 1fr;
    display: grid;
  }

  .filters-grid,
  .filters-grid-primary {
    grid-template-columns: 1fr;
  }

  .save-search-btn,
  .btn-login {
    width: 100%;
  }
}
</style>
