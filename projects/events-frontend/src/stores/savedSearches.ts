import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import { buildDiscoveryFilterInput } from '@/stores/events'
import type { EventFilters, SavedSearch } from '@/types'

const SAVED_SEARCH_FIELDS = `
  id
  name
  searchText
  domainSlug
  locationText
  startsFromUtc
  startsToUtc
  isFree
  priceMin
  priceMax
  sortBy
  attendanceMode
  language
  timezone
  createdAtUtc
  updatedAtUtc
`

export const useSavedSearchesStore = defineStore('saved-searches', () => {
  const savedSearches = ref<SavedSearch[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchSavedSearches() {
    loading.value = true
    error.value = ''

    try {
      const data = await gqlRequest<{ mySavedSearches: SavedSearch[] }>(
        `query SavedSearches {
          mySavedSearches { ${SAVED_SEARCH_FIELDS} }
        }`,
      )
      savedSearches.value = data.mySavedSearches
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unable to load saved searches.'
      savedSearches.value = []
    } finally {
      loading.value = false
    }
  }

  async function saveSearch(name: string, filters: EventFilters) {
    const data = await gqlRequest<{ saveSearch: SavedSearch }>(
      `mutation SaveSearch($input: SavedSearchInput!) {
        saveSearch(input: $input) { ${SAVED_SEARCH_FIELDS} }
      }`,
      {
        input: {
          name,
          filter: buildDiscoveryFilterInput(filters),
        },
      },
    )
    savedSearches.value = [data.saveSearch, ...savedSearches.value]
    return data.saveSearch
  }

  async function deleteSavedSearch(savedSearchId: string) {
    await gqlRequest<{ deleteSavedSearch: boolean }>(
      `mutation DeleteSavedSearch($savedSearchId: UUID!) {
        deleteSavedSearch(savedSearchId: $savedSearchId)
      }`,
      { savedSearchId },
    )

    savedSearches.value = savedSearches.value.filter((savedSearch) => savedSearch.id !== savedSearchId)
  }

  function clearSavedSearches() {
    savedSearches.value = []
    error.value = ''
  }

  return {
    savedSearches,
    loading,
    error,
    fetchSavedSearches,
    saveSearch,
    deleteSavedSearch,
    clearSavedSearches,
  }
})
