<script setup lang="ts">
import { computed } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'

const eventsStore = useEventsStore()
const auth = useAuthStore()
const categories = useCategoriesStore()

const userEvents = computed(() => eventsStore.allEvents)
const approvedCount = computed(() => userEvents.value.filter((e) => e.status === 'approved').length)
const pendingCount = computed(() => userEvents.value.filter((e) => e.status === 'pending').length)
const rejectedCount = computed(() => userEvents.value.filter((e) => e.status === 'rejected').length)

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
      <div>
        <h1>Dashboard</h1>
        <p v-if="auth.isAuthenticated">Welcome back, {{ auth.currentUser?.name }}!</p>
        <p v-else>Please log in to see your dashboard.</p>
      </div>
      <RouterLink v-if="auth.isAuthenticated" to="/submit" class="btn btn-primary">
        + Submit Event
      </RouterLink>
    </div>

    <template v-if="auth.isAuthenticated">
      <div class="stats-grid">
        <div class="stat-card card">
          <div class="stat-icon stat-icon--total">📊</div>
          <div class="stat-info">
            <div class="stat-number">{{ userEvents.length }}</div>
            <div class="stat-label">Total Events</div>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon stat-icon--approved">✅</div>
          <div class="stat-info">
            <div class="stat-number stat-number--success">{{ approvedCount }}</div>
            <div class="stat-label">Approved</div>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon stat-icon--pending">⏳</div>
          <div class="stat-info">
            <div class="stat-number stat-number--warning">{{ pendingCount }}</div>
            <div class="stat-label">Pending Review</div>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon stat-icon--rejected">❌</div>
          <div class="stat-info">
            <div class="stat-number stat-number--danger">{{ rejectedCount }}</div>
            <div class="stat-label">Rejected</div>
          </div>
        </div>
      </div>

      <div class="section-header">
        <h2>Your Events</h2>
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
                <RouterLink :to="`/event/${event.id}`" class="event-link">
                  {{ event.title }}
                </RouterLink>
              </td>
              <td>
                <span class="category-label">
                  {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
                </span>
              </td>
              <td class="date-cell">{{ formatDate(event.date) }}</td>
              <td>
                <span class="badge" :class="statusBadgeClass(event.status)">
                  {{ event.status }}
                </span>
              </td>
              <td>
                <RouterLink :to="`/event/${event.id}`" class="btn btn-outline btn-sm">
                  View
                </RouterLink>
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
          <div class="empty-icon">📭</div>
          <p>No events yet.</p>
          <RouterLink to="/submit" class="btn btn-primary">Submit your first event</RouterLink>
        </div>
      </div>
    </template>

    <div v-else class="card login-prompt">
      <div class="prompt-icon">🔐</div>
      <h2>Sign in required</h2>
      <p>You need to be logged in to access the dashboard.</p>
      <RouterLink to="/login" class="btn btn-primary">Log In</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
}

.page-header p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  font-size: 1.75rem;
  line-height: 1;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-raised);
}

.stat-info {
  min-width: 0;
}

.stat-number {
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}

.stat-number--success {
  color: #4ade80;
}

.stat-number--warning {
  color: var(--color-warning);
}

.stat-number--danger {
  color: var(--color-danger);
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.section-header {
  margin-bottom: 0.75rem;
}

.section-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
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
  background: var(--color-surface-raised);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border);
}

td {
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: var(--color-surface-raised);
}

.event-link {
  font-weight: 500;
  color: var(--color-text);
}

.event-link:hover {
  color: var(--color-primary);
}

.category-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.date-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

td:last-child {
  display: flex;
  gap: 0.375rem;
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

.btn-sm {
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
}

.empty-table {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.empty-icon {
  font-size: 2.5rem;
}

.login-prompt {
  padding: 4rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.prompt-icon {
  font-size: 2.5rem;
}

.login-prompt h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.login-prompt p {
  color: var(--color-text-secondary);
}
</style>
