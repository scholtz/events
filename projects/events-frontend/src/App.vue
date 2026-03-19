<script setup lang="ts">
import { onMounted, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'

const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()
const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

onMounted(async () => {
  await Promise.all([
    eventsStore.fetchEvents(),
    domainsStore.fetchDomains(),
    authStore.checkAuth(),
  ])
  if (authStore.isAuthenticated) {
    favoritesStore.fetchFavoriteEvents().catch(() => {
      // Non-critical: favorites will be unavailable until the user navigates to /favorites
    })
  }
})

watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      favoritesStore.fetchFavoriteEvents()
    } else {
      favoritesStore.clearFavorites()
    }
  },
)
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <main class="app-main">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-main {
  flex: 1;
}
</style>
