<script setup lang="ts">
import { useEventsStore } from '@/stores/events'
import EventCard from '@/components/events/EventCard.vue'
import EventFilters from '@/components/events/EventFilters.vue'

const eventsStore = useEventsStore()
</script>

<template>
  <div class="home-view">
    <section class="hero">
      <div class="container">
        <h1>Discover Events Near You</h1>
        <p>Find crypto, AI, cooking, and more events happening in your area.</p>
      </div>
    </section>
    <div class="container">
      <EventFilters />
      <div v-if="eventsStore.filteredEvents.length" class="events-grid">
        <EventCard
          v-for="event in eventsStore.filteredEvents"
          :key="event.id"
          :event="event"
        />
      </div>
      <div v-else class="empty-state card">
        <p>No events match your filters. Try adjusting your search criteria.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  color: #fff;
  padding: 3rem 0;
  margin-bottom: 2rem;
}

.hero h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.hero p {
  font-size: 1.0625rem;
  opacity: 0.9;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
