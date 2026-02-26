<script setup lang="ts">
import { ref } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'

const eventsStore = useEventsStore()
const auth = useAuthStore()
const categories = useCategoriesStore()

const activeTab = ref<'events' | 'categories'>('events')

const newCategory = ref({ name: '', slug: '', description: '', color: '#4f46e5' })

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
  newCategory.value = { name: '', slug: '', description: '', color: '#4f46e5' }
}
</script>

<template>
  <div class="container admin-view">
    <div class="page-header">
      <h1>Admin Panel</h1>
      <p>Manage events, categories, and platform settings.</p>
    </div>

    <template v-if="auth.isAdmin">
      <div class="admin-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'events' }]"
          @click="activeTab = 'events'"
        >
          Events ({{ eventsStore.allEvents.length }})
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'categories' }]"
          @click="activeTab = 'categories'"
        >
          Categories ({{ categories.categories.length }})
        </button>
      </div>

      <!-- Events management -->
      <div v-if="activeTab === 'events'" class="admin-section">
        <div v-if="eventsStore.pendingEvents.length" class="pending-banner">
          ⚠️ {{ eventsStore.pendingEvents.length }} event(s) pending approval
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
              <tr v-for="event in eventsStore.allEvents" :key="event.id">
                <td>
                  <RouterLink :to="`/event/${event.id}`" class="event-link">
                    {{ event.title }}
                  </RouterLink>
                  <div class="text-secondary">{{ event.organizer }}</div>
                </td>
                <td>
                  {{ categories.getCategoryBySlug(event.category)?.name ?? event.category }}
                </td>
                <td>{{ formatDate(event.date) }}</td>
                <td>
                  <span class="badge" :class="statusBadgeClass(event.status)">
                    {{ event.status }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button
                    v-if="event.status !== 'approved'"
                    class="btn btn-primary btn-sm"
                    @click="eventsStore.updateEventStatus(event.id, 'approved')"
                  >
                    Approve
                  </button>
                  <button
                    v-if="event.status !== 'rejected'"
                    class="btn btn-secondary btn-sm"
                    @click="eventsStore.updateEventStatus(event.id, 'rejected')"
                  >
                    Reject
                  </button>
                  <button class="btn btn-danger btn-sm" @click="eventsStore.deleteEvent(event.id)">
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
              placeholder="Slug"
              required
            />
            <input
              v-model="newCategory.description"
              class="form-input"
              type="text"
              placeholder="Description"
            />
            <input v-model="newCategory.color" class="form-input color-input" type="color" />
            <button type="submit" class="btn btn-primary">Add</button>
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
                  <code>{{ cat.slug }}</code>
                </td>
                <td>{{ cat.description }}</td>
                <td>
                  <button class="btn btn-danger btn-sm" @click="categories.deleteCategory(cat.id)">
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else class="card login-prompt">
      <p>You need admin privileges to access this page.</p>
      <RouterLink to="/login" class="btn btn-primary">Login</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.admin-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--color-border);
}

.tab-btn {
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.pending-banner {
  padding: 0.75rem 1rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1rem;
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

.text-secondary {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.actions-cell {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.add-category {
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.add-category h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.category-form {
  display: flex;
  gap: 0.5rem;
  align-items: end;
  flex-wrap: wrap;
}

.category-form .form-input {
  flex: 1;
  min-width: 120px;
}

.color-input {
  width: 50px !important;
  min-width: 50px !important;
  flex: 0 !important;
  padding: 0.25rem !important;
  height: 38px;
}

.color-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
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
