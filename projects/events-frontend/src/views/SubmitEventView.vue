<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useCategoriesStore } from '@/stores/categories'

const router = useRouter()
const eventsStore = useEventsStore()
const categories = useCategoriesStore()

const form = reactive({
  title: '',
  description: '',
  category: '',
  date: '',
  endDate: '',
  locationName: '',
  locationAddress: '',
  lat: '',
  lng: '',
  link: '',
  organizer: '',
})

function handleSubmit() {
  if (!form.title || !form.description || !form.category || !form.date || !form.link) {
    return
  }

  eventsStore.addEvent({
    title: form.title,
    description: form.description,
    category: form.category,
    date: form.date,
    endDate: form.endDate || undefined,
    location: {
      name: form.locationName,
      address: form.locationAddress,
      lat: parseFloat(form.lat) || 0,
      lng: parseFloat(form.lng) || 0,
    },
    link: form.link,
    imageUrl: '',
    organizer: form.organizer,
  })

  router.push('/dashboard')
}
</script>

<template>
  <div class="container submit-view">
    <div class="page-header">
      <h1>Submit an Event</h1>
      <p>Share an upcoming event with the community. Submitted events will be reviewed before publishing.</p>
    </div>
    <form class="submit-form card" @submit.prevent="handleSubmit">
      <div class="form-grid">
        <div class="form-group full-width">
          <label class="form-label" for="event-title">Event Title *</label>
          <input
            id="event-title"
            v-model="form.title"
            class="form-input"
            type="text"
            required
            placeholder="e.g., Prague Crypto Summit 2026"
          />
        </div>
        <div class="form-group full-width">
          <label class="form-label" for="event-description">Description *</label>
          <textarea
            id="event-description"
            v-model="form.description"
            class="form-textarea"
            required
            placeholder="Tell people what this event is about..."
          ></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="event-category">Category *</label>
          <select id="event-category" v-model="form.category" class="form-select" required>
            <option value="" disabled>Select a category</option>
            <option v-for="cat in categories.categories" :key="cat.id" :value="cat.slug">
              {{ cat.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="event-organizer">Organizer</label>
          <input
            id="event-organizer"
            v-model="form.organizer"
            class="form-input"
            type="text"
            placeholder="Organization or person"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-date">Start Date *</label>
          <input id="event-date" v-model="form.date" class="form-input" type="date" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-end-date">End Date</label>
          <input id="event-end-date" v-model="form.endDate" class="form-input" type="date" />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-location-name">Venue Name</label>
          <input
            id="event-location-name"
            v-model="form.locationName"
            class="form-input"
            type="text"
            placeholder="e.g., Prague Congress Centre"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-location-address">Address</label>
          <input
            id="event-location-address"
            v-model="form.locationAddress"
            class="form-input"
            type="text"
            placeholder="e.g., Prague 4, Czech Republic"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-lat">Latitude</label>
          <input
            id="event-lat"
            v-model="form.lat"
            class="form-input"
            type="text"
            placeholder="e.g., 50.0614"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="event-lng">Longitude</label>
          <input
            id="event-lng"
            v-model="form.lng"
            class="form-input"
            type="text"
            placeholder="e.g., 14.4283"
          />
        </div>
        <div class="form-group full-width">
          <label class="form-label" for="event-link">Event Link *</label>
          <input
            id="event-link"
            v-model="form.link"
            class="form-input"
            type="url"
            required
            placeholder="https://example.com/event"
          />
        </div>
      </div>
      <div class="form-actions">
        <RouterLink to="/" class="btn btn-secondary">Cancel</RouterLink>
        <button type="submit" class="btn btn-primary">Submit Event</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.submit-view {
  padding-top: 2rem;
  padding-bottom: 2rem;
  max-width: 800px;
}

.submit-form {
  padding: 1.5rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1rem;
}

.full-width {
  grid-column: 1 / -1;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
