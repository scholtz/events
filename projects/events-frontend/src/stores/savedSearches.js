import { ref } from 'vue';
import { defineStore } from 'pinia';
import { gqlRequest } from '@/lib/graphql';
import { buildDiscoveryFilterInput } from '@/stores/events';
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
`;
export const useSavedSearchesStore = defineStore('saved-searches', () => {
    const savedSearches = ref([]);
    const loading = ref(false);
    const error = ref('');
    async function fetchSavedSearches() {
        loading.value = true;
        error.value = '';
        try {
            const data = await gqlRequest(`query SavedSearches {
          mySavedSearches { ${SAVED_SEARCH_FIELDS} }
        }`);
            savedSearches.value = data.mySavedSearches;
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : 'Unable to load saved searches.';
            savedSearches.value = [];
        }
        finally {
            loading.value = false;
        }
    }
    async function saveSearch(name, filters) {
        const data = await gqlRequest(`mutation SaveSearch($input: SavedSearchInput!) {
        saveSearch(input: $input) { ${SAVED_SEARCH_FIELDS} }
      }`, {
            input: {
                name,
                filter: buildDiscoveryFilterInput(filters),
            },
        });
        savedSearches.value = [data.saveSearch, ...savedSearches.value];
        return data.saveSearch;
    }
    async function deleteSavedSearch(savedSearchId) {
        await gqlRequest(`mutation DeleteSavedSearch($savedSearchId: UUID!) {
        deleteSavedSearch(savedSearchId: $savedSearchId)
      }`, { savedSearchId });
        savedSearches.value = savedSearches.value.filter((savedSearch) => savedSearch.id !== savedSearchId);
    }
    function clearSavedSearches() {
        savedSearches.value = [];
        error.value = '';
    }
    return {
        savedSearches,
        loading,
        error,
        fetchSavedSearches,
        saveSearch,
        deleteSavedSearch,
        clearSavedSearches,
    };
});
