<script setup lang="ts">
import { ref } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'

const eventsStore = useEventsStore()
const auth = useAuthStore()
const categories = useCategoriesStore()

const activeTab = ref<'events' | 'categories'>('events')

const newCategory = ref({ name: '', slug: '', description: '', color: '#137fec' })

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

function addCategory() {
  if (!newCategory.value.name || !newCategory.value.slug) return
  categories.addCategory({ ...newCategory.value })
  newCategory.value = { name: '', slug: '', description: '', color: '#137fec' }
}
</script>

<template>
  <div class="container admin-view">
    <div class="page-header">
      <div>
        <h1>Admin Panel</h1>
        <p>Manage events, categories, and platform settings.</p>
      </div>
      <div v-if="auth.isAdmin && eventsStore.pendingEvents.length" class="pending-pill">
        <span class="pending-dot"></span>
        {{ eventsStore.pendingEvents.length }} pending
      </div>
    </div>

    <template v-if="auth.isAdmin">
      <div class="admin-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'events' }]"
          @click="activeTab = 'events'"
        >
          Events
          <span class="tab-count">{{ eventsStore.allEvents.length }}</span>
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'categories' }]"
          @click="activeTab = 'categories'"
        >
          Categories
          <span class="tab-count">{{ categories.categories.length }}</span>
        </button>
      </div>

      <!-- Events management -->
      <div v-if="activeTab === 'events'" class="admin-section">
        <div class="events-table card">
          <table>
            <thead>
              <tr>
                <th>Event / Organizer</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in eventsStore.allEvents" :key="event.id">
                <td>
                  <RouterLink :to="`/event/${event.id}`" class="event-link">
                    {{ event.title }}
                  </RouterLink>
                  <div class="text-secondary">{{ event.organizer }}</div>
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
                <td class="actions-cell">
                  <button
                    v-if="event.status !== 'approved'"
                    class="btn btn-success btn-sm"
                    @click="eventsStore.updateEventStatus(event.id, 'approved')"
                  >
                    Approve
                  </button>
                  <button
                    v-if="event.status !== 'rejected'"
                    class="btn btn-outline btn-sm"
                    @click="eventsStore.updateEventStatus(event.id, 'rejected')"
                  >
                    Reject
                  </button>
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
          <div v-if="!eventsStore.allEvents.length" class="empty-table">
            <div class="empty-icon">📋</div>
            <p>No events to manage.</p>
          </div>
        </div>
      </div>

      <!-- Categories management -->
      <div v-if="activeTab === 'categories'" class="admin-section">
        <div class="add-category card">
          <h3>Add Category</h3>
          <form class="category-form" @submit.prevent="addCategory">
            <input
              v-model="newCategory.name"
              class="form-input"
              type="text"
              placeholder="Name"
              required
            />
            <input
              v-model="newCategory.slug"
              class="form-input"
              type="text"
              placeholder="Slug (e.g. crypto)"
              required
            />
            <input
              v-model="newCategory.description"
              class="form-input"
              type="text"
              placeholder="Description (optional)"
            />
            <div class="color-field">
              <input v-model="newCategory.color" class="form-input color-input" type="color" />
            </div>
            <button type="submit" class="btn btn-primary">Add Category</button>
          </form>
        </div>
        <div class="categories-table card">
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cat in categories.categories" :key="cat.id">
                <td>
                  <span class="color-dot" :style="{ background: cat.color }"></span>
                </td>
                <td>{{ cat.name }}</td>
                <td>
                  <code class="slug-code">{{ cat.slug }}</code>
                </td>
                <td class="text-secondary">{{ cat.description }}</td>
                <td>
                  <button
                    class="btn btn-danger btn-sm"
                    @click="categories.deleteCategory(cat.id)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!categories.categories.length" class="empty-table">
            <div class="empty-icon">🏷️</div>
            <p>No categories yet. Add one above.</p>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="card login-prompt">
      <div class="prompt-icon">🛡️</div>
      <h2>Admin access required</h2>
      <p>You need admin privileges to access this page.</p>
      <RouterLink to="/login" class="btn btn-primary">Login</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.page-header {
  display: flex;
  align-items: center;
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

.pending-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.875rem;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-warning);
}

.pending-dot {
  width: 8px;
  height: 8px;
  background: var(--color-warning);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.admin-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 9999px;
  font-size: 0.75rem;
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
}

.tab-btn.active .tab-count {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.events-table,
.categories-table {
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

.text-secondary {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.category-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.date-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.actions-cell {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  align-items: center;
}

.btn-success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.btn-success:hover {
  background: rgba(34, 197, 94, 0.25);
  text-decoration: none;
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
  font-size: 2rem;
}

.add-category {
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
}

.add-category h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.category-form {
  display: flex;
  gap: 0.625rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.category-form .form-input {
  flex: 1;
  min-width: 130px;
}

.color-field {
  flex-shrink: 0;
}

.color-input {
  width: 48px !important;
  min-width: 48px !important;
  flex: none !important;
  padding: 0.25rem !important;
  height: 38px;
  cursor: pointer;
}

.color-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.slug-code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
  font-size: 0.8125rem;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
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
