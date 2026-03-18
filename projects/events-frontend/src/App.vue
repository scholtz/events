<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'
import { useAuthStore } from '@/stores/auth'

const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()
const authStore = useAuthStore()

onMounted(async () => {
  await Promise.all([
    eventsStore.fetchEvents(),
    domainsStore.fetchDomains(),
    authStore.checkAuth(),
  ])
})
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
