import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { gqlRequest } from '@/lib/graphql';
const EVENT_FIELDS = `
  id
  name
  slug
  description
  eventUrl
  venueName
  addressLine1
  city
  countryCode
  latitude
  longitude
  startsAtUtc
  endsAtUtc
  submittedAtUtc
  updatedAtUtc
  publishedAtUtc
  adminNotes
  status
  isFree
  priceAmount
  currencyCode
  domainId
  attendanceMode
  timezone
  domain { id name slug subdomain description isActive createdAtUtc }
  submittedByUserId
  submittedBy { displayName }
  reviewedByUserId
  reviewedBy { displayName }
  mapUrl
`;
export const useFavoritesStore = defineStore('favorites', () => {
    const favoriteEvents = ref([]);
    const favoriteEventIds = ref(new Set());
    const loading = ref(false);
    const error = ref('');
    const isFavorited = computed(() => (eventId) => favoriteEventIds.value.has(eventId));
    async function fetchFavoriteEvents() {
        loading.value = true;
        error.value = '';
        try {
            const data = await gqlRequest(`query MyFavoriteEvents {
          myFavoriteEvents { ${EVENT_FIELDS} }
        }`);
            favoriteEvents.value = data.myFavoriteEvents;
            favoriteEventIds.value = new Set(data.myFavoriteEvents.map((e) => e.id));
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : 'Unable to load favorite events.';
            favoriteEvents.value = [];
            favoriteEventIds.value = new Set();
        }
        finally {
            loading.value = false;
        }
    }
    async function favoriteEvent(eventId) {
        await gqlRequest(`mutation FavoriteEvent($eventId: UUID!) {
        favoriteEvent(eventId: $eventId) { id eventId }
      }`, { eventId });
        favoriteEventIds.value = new Set([...favoriteEventIds.value, eventId]);
    }
    async function unfavoriteEvent(eventId) {
        await gqlRequest(`mutation UnfavoriteEvent($eventId: UUID!) {
        unfavoriteEvent(eventId: $eventId)
      }`, { eventId });
        favoriteEventIds.value = new Set([...favoriteEventIds.value].filter((id) => id !== eventId));
        favoriteEvents.value = favoriteEvents.value.filter((e) => e.id !== eventId);
    }
    async function toggleFavorite(eventId) {
        if (favoriteEventIds.value.has(eventId)) {
            await unfavoriteEvent(eventId);
        }
        else {
            await favoriteEvent(eventId);
        }
    }
    function clearFavorites() {
        favoriteEvents.value = [];
        favoriteEventIds.value = new Set();
        error.value = '';
    }
    return {
        favoriteEvents,
        favoriteEventIds,
        loading,
        error,
        isFavorited,
        fetchFavoriteEvents,
        favoriteEvent,
        unfavoriteEvent,
        toggleFavorite,
        clearFavorites,
    };
});
