<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useCategoriesStore } from '@/stores/categories'

const router = useRouter()
const eventsStore = useEventsStore()
const categories = useCategoriesStore()

const submitting = ref(false)
const submitted = ref(false)

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

async function handleSubmit() {
  if (!form.title || !form.description || !form.category || !form.date || !form.link) return
  submitting.value = true
  try {
    await eventsStore.addEvent({
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
    submitted.value = true
    setTimeout(() => router.push('/dashboard'), 1500)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="submit-view">
    <div class="container">
      <div class="submit-header">
        <RouterLink to="/" class="back-link">← Back</RouterLink>
        <div>
          <h1>Submit an Event</h1>
          <p>Share an upcoming event with the community. Submitted events are reviewed before publishing.</p>
        </div>
      </div>

      <div v-if="submitted" class="success-card card">
        <div class="success-icon">🎉</div>
        <h2>Event Submitted!</h2>
        <p>Your event is under review. We'll publish it shortly.</p>
        <RouterLink to="/dashboard" class="btn btn-primary">Go to Dashboard</RouterLink>
      </div>

      <form v-else class="submit-form card" @submit.prevent="handleSubmit">
        <!-- Basic Info -->
        <fieldset class="form-section">
          <legend class="section-legend">Basic Information</legend>
          <div class="form-group">
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
          <div class="form-group">
            <label class="form-label" for="event-description">Description *</label>
            <textarea
              id="event-description"
              v-model="form.description"
              class="form-textarea"
              required
              placeholder="Tell people what this event is about..."
            ></textarea>
          </div>
          <div class="form-row">
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
          </div>
        </fieldset>

        <!-- Date & Time -->
        <fieldset class="form-section">
          <legend class="section-legend">Date &amp; Time</legend>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-date">Start Date *</label>
              <input id="event-date" v-model="form.date" class="form-input" type="date" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="event-end-date">End Date</label>
              <input id="event-end-date" v-model="form.endDate" class="form-input" type="date" />
            </div>
          </div>
        </fieldset>

        <!-- Location -->
        <fieldset class="form-section">
          <legend class="section-legend">Location</legend>
          <div class="form-row">
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
          </div>
          <div class="form-row form-row--narrow">
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
          </div>
        </fieldset>

        <!-- Link -->
        <fieldset class="form-section">
          <legend class="section-legend">Event Link</legend>
          <div class="form-group">
            <label class="form-label" for="event-link">Website / Registration URL *</label>
            <input
              id="event-link"
              v-model="form.link"
              class="form-input"
              type="url"
              required
              placeholder="https://example.com/event"
            />
          </div>
        </fieldset>

        <div class="form-actions">
          <RouterLink to="/" class="btn btn-ghost">Cancel</RouterLink>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? 'Submitting...' : 'Submit Event' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.submit-view {
  padding: 2rem 0 3rem;
}

.submit-header {
  margin-bottom: 1.5rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.back-link:hover {
  color: var(--color-text);
  text-decoration: none;
}

.submit-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}

.submit-header p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.submit-form {
  max-width: 720px;
}

.form-section {
  border: none;
  padding: 0;
  margin-bottom: 0;
}

.section-legend {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  padding: 1.25rem 1.5rem 0.75rem;
  width: 100%;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1.25rem;
}

.form-section:not(:last-of-type) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
}

.form-group {
  padding: 0 1.5rem;
  margin-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1rem;
  padding: 0;
}

.form-row .form-group {
  padding: 0 0 0 1.5rem;
}

.form-row .form-group:last-child {
  padding: 0 1.5rem 0 0;
}

.form-row--narrow {
  max-width: 480px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
}

.btn-ghost:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
}

.success-card {
  max-width: 480px;
  margin: 0 auto;
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.success-icon {
  font-size: 2.5rem;
}

.success-card h2 {
  font-size: 1.375rem;
  font-weight: 700;
}

.success-card p {
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .form-row .form-group,
  .form-row .form-group:last-child {
    padding: 0 1.5rem;
  }
}
</style>
