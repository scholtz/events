<script setup lang="ts">
import { computed } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'

const eventsStore = useEventsStore()
const auth = useAuthStore()
const categories = useCategoriesStore()

const userEvents = computed(() => eventsStore.allEvents)

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'badge-success'
    case 'pending':
      return 'badge-warning'
    case 'rejected':
      return 'badge-danger'
    default:
      return ''
  }
}
</script>

<template>
  <div class="container dashboard-view">
    <div class="page-header">
      <h1>Dashboard</h1>
      <p v-if="auth.isAuthenticated">Welcome back, {{ auth.currentUser?.name }}!</p>
      <p v-else>Please log in to see your dashboard.</p>
    </div>

    <template v-if="auth.isAuthenticated">
      <div class="stats-grid">
        <div class="stat-card card">
          <div class="stat-number">{{ userEvents.length }}</div>
          <div class="stat-label">Total Events</div>
        </div>
        <div class="stat-card card">
          <div class="stat-number">
            {{ userEvents.filter((e) => e.status === 'approved').length }}
          </div>
          <div class="stat-label">Approved</div>
        </div>
        <div class="stat-card card">
          <div class="stat-number">
            {{ userEvents.filter((e) => e.status === 'pending').length }}
          </div>
          <div class="stat-label">Pending</div>
        </div>
      </div>

      <div class="events-table card">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Category</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in userEvents" :key="event.id">
              <td>
                <RouterLink :to="`/event/${event.id}`" class="event-link">{{
                  event.title
                }}</RouterLink>
              </td>
              <td>{{
                categories.getCategoryBySlug(event.category)?.name ?? event.category
              }}</td>
              <td>{{ formatDate(event.date) }}</td>
              <td>
                <span class="badge" :class="statusBadgeClass(event.status)">
                  {{ event.status }}
                </span>
              </td>
              <td>
                <button
                  class="btn btn-danger btn-sm"
                  @click="eventsStore.deleteEvent(event.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!userEvents.length" class="empty-table">
          <p>No events yet. <RouterLink to="/submit">Submit your first event!</RouterLink></p>
        </div>
      </div>
    </template>

    <div v-else class="card login-prompt">
      <p>You need to be logged in to access the dashboard.</p>
      <button class="btn btn-primary" @click="auth.loginAsUser()">Log In</button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  padding: 1.25rem;
  text-align: center;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.events-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
}

th {
  background: var(--color-bg);
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

td {
  border-bottom: 1px solid var(--color-border);
}

tr:last-child td {
  border-bottom: none;
}

.event-link {
  font-weight: 500;
}

.btn-sm {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.empty-table {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.login-prompt {
  padding: 3rem;
  text-align: center;
}

.login-prompt p {
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
}
</style>
