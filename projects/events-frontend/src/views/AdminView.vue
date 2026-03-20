<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import { gqlRequest } from '@/lib/graphql'
import type { AdminOverview, User } from '@/types'

const eventsStore = useEventsStore()
const auth = useAuthStore()
const domainsStore = useDomainsStore()

const activeTab = ref<'events' | 'domains' | 'users'>('events')

const newDomain = ref({ name: '', slug: '', subdomain: '', description: '' })

const adminOverview = ref<AdminOverview | null>(null)
const adminLoading = ref(false)
const updatingRole = ref<string | null>(null)

async function fetchAdminOverview() {
  if (!auth.isAdmin) return
  adminLoading.value = true
  try {
    const data = await gqlRequest<{ adminOverview: AdminOverview }>(
      `query AdminOverview {
        adminOverview {
          totalUsers
          totalDomains
          totalPublishedEvents
          totalPendingEvents
          users { id displayName email role createdAtUtc }
          pendingReviewEvents {
            id name slug description eventUrl
            venueName addressLine1 city countryCode
            latitude longitude startsAtUtc endsAtUtc
            submittedAtUtc updatedAtUtc publishedAtUtc
            adminNotes status isFree priceAmount currencyCode domainId mapUrl
            attendanceMode timezone
            domain { id name slug subdomain }
            submittedBy { displayName }
          }
          domains { id name slug subdomain description isActive createdAtUtc }
        }
      }`,
    )
    adminOverview.value = data.adminOverview
  } catch {
    // Admin overview fetch failed – fall back to basic event list
  } finally {
    adminLoading.value = false
  }
}

async function updateUserRole(userId: string, role: 'ADMIN' | 'CONTRIBUTOR') {
  updatingRole.value = userId
  try {
    const data = await gqlRequest<{ updateUserRole: User }>(
      `mutation UpdateUserRole($input: UpdateUserRoleInput!) {
        updateUserRole(input: $input) {
          id displayName email role createdAtUtc
        }
      }`,
      { input: { userId, role } },
    )
    if (adminOverview.value) {
      const idx = adminOverview.value.users.findIndex((u) => u.id === data.updateUserRole.id)
      if (idx >= 0) {
        adminOverview.value.users[idx] = data.updateUserRole
      }
    }
  } finally {
    updatingRole.value = null
  }
}

onMounted(() => {
  fetchAdminOverview()
})

function allAdminEvents() {
  // Prefer events from adminOverview which includes pending; fall back to events store
  if (adminOverview.value) {
    // Combine pending review events with published events (adminOverview includes all)
    return [
      ...adminOverview.value.pendingReviewEvents,
      ...eventsStore.allEvents.filter(
        (e) => !adminOverview.value!.pendingReviewEvents.some((pe) => pe.id === e.id),
      ),
    ]
  }
  return eventsStore.allEvents
}

function pendingCount() {
  if (adminOverview.value) {
    return adminOverview.value.totalPendingEvents
  }
  return eventsStore.pendingEvents.length
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'published'
    case 'PENDING_APPROVAL':
      return 'pending'
    case 'REJECTED':
      return 'rejected'
    default:
      return status.toLowerCase()
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'badge-success'
    case 'PENDING_APPROVAL':
      return 'badge-warning'
    case 'REJECTED':
      return 'badge-danger'
    default:
      return ''
  }
}

async function addDomain() {
  if (!newDomain.value.name || !newDomain.value.slug || !newDomain.value.subdomain) return
  await domainsStore.upsertDomain({ ...newDomain.value })
  newDomain.value = { name: '', slug: '', subdomain: '', description: '' }
  await fetchAdminOverview()
}

async function handleReviewEvent(eventId: string, status: string) {
  await eventsStore.reviewEvent(eventId, status)
  await fetchAdminOverview()
}
</script>

<template>
  <div class="container admin-view">
    <div class="page-header">
      <div>
        <h1>Admin Panel</h1>
        <p>Manage events, domains, and platform settings.</p>
      </div>
      <div v-if="auth.isAdmin && pendingCount()" class="pending-pill">
        <span class="pending-dot"></span>
        {{ pendingCount() }} pending
      </div>
    </div>

    <template v-if="auth.isAdmin">
      <div class="admin-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'events' }]"
          @click="activeTab = 'events'"
        >
          Events
          <span class="tab-count">{{ allAdminEvents().length }}</span>
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'domains' }]"
          @click="activeTab = 'domains'"
        >
          Domains
          <span class="tab-count">{{ domainsStore.domains.length }}</span>
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'users' }]"
          @click="activeTab = 'users'"
        >
          Users
          <span class="tab-count">{{ adminOverview?.users.length ?? 0 }}</span>
        </button>
      </div>

      <!-- Events management -->
      <div v-if="activeTab === 'events'" class="admin-section">
        <div v-if="adminLoading" class="loading-state card">
          <p>Loading events…</p>
        </div>
        <div v-else class="events-table card">
          <table>
            <thead>
              <tr>
                <th>Event / Submitter</th>
                <th>Domain</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in allAdminEvents()" :key="event.id">
                <td>
                  <RouterLink :to="`/event/${event.slug}`" class="event-link">
                    {{ event.name }}
                  </RouterLink>
                  <div class="text-secondary">{{ event.submittedBy?.displayName }}</div>
                </td>
                <td>
                  <span class="category-label">
                    {{ event.domain?.name ?? '—' }}
                  </span>
                </td>
                <td class="date-cell">{{ formatDate(event.startsAtUtc) }}</td>
                <td>
                  <span class="badge" :class="statusBadgeClass(event.status)">
                    {{ statusLabel(event.status) }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button
                    v-if="event.status !== 'PUBLISHED'"
                    class="btn btn-success btn-sm"
                    @click="handleReviewEvent(event.id, 'PUBLISHED')"
                  >
                    Approve
                  </button>
                  <button
                    v-if="event.status !== 'REJECTED'"
                    class="btn btn-outline btn-sm"
                    @click="handleReviewEvent(event.id, 'REJECTED')"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!allAdminEvents().length" class="empty-table">
            <div class="empty-icon">📋</div>
            <p>No events to manage.</p>
          </div>
        </div>
      </div>

      <!-- Domains management -->
      <div v-if="activeTab === 'domains'" class="admin-section">
        <div class="add-category card">
          <h3>Add Domain</h3>
          <form class="category-form" @submit.prevent="addDomain">
            <input
              v-model="newDomain.name"
              class="form-input"
              type="text"
              placeholder="Name"
              required
            />
            <input
              v-model="newDomain.slug"
              class="form-input"
              type="text"
              placeholder="Slug (e.g. crypto)"
              required
            />
            <input
              v-model="newDomain.subdomain"
              class="form-input"
              type="text"
              placeholder="Subdomain (e.g. crypto)"
              required
            />
            <input
              v-model="newDomain.description"
              class="form-input"
              type="text"
              placeholder="Description (optional)"
            />
            <button type="submit" class="btn btn-primary">Add Domain</button>
          </form>
        </div>
        <div class="categories-table card">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Subdomain</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in domainsStore.domains" :key="d.id">
                <td>
                  <span
                    class="color-dot"
                    :style="{ background: d.isActive ? '#4ade80' : '#f87171' }"
                  ></span>
                </td>
                <td>{{ d.name }}</td>
                <td>
                  <code class="slug-code">{{ d.slug }}</code>
                </td>
                <td>
                  <code class="slug-code">{{ d.subdomain }}</code>
                </td>
                <td class="text-secondary">{{ d.description }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!domainsStore.domains.length" class="empty-table">
            <div class="empty-icon">🏷️</div>
            <p>No domains yet. Add one above.</p>
          </div>
        </div>
      </div>

      <!-- Users management -->
      <div v-if="activeTab === 'users'" class="admin-section">
        <div class="users-table card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in (adminOverview?.users ?? [])" :key="user.id">
                <td class="user-name-cell">{{ user.displayName }}</td>
                <td class="text-secondary">{{ user.email }}</td>
                <td>
                  <span class="badge" :class="user.role === 'ADMIN' ? 'badge-admin' : 'badge-contributor'">
                    {{ user.role === 'ADMIN' ? 'Admin' : 'Contributor' }}
                  </span>
                </td>
                <td class="date-cell">{{ formatDate(user.createdAtUtc) }}</td>
                <td class="actions-cell">
                  <button
                    v-if="user.role !== 'ADMIN'"
                    class="btn btn-success btn-sm"
                    :disabled="updatingRole === user.id"
                    @click="updateUserRole(user.id, 'ADMIN')"
                  >
                    Make Admin
                  </button>
                  <button
                    v-if="user.role === 'ADMIN' && user.id !== auth.currentUser?.id"
                    class="btn btn-outline btn-sm"
                    :disabled="updatingRole === user.id"
                    @click="updateUserRole(user.id, 'CONTRIBUTOR')"
                  >
                    Remove Admin
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="adminLoading" class="empty-table">
            <p>Loading users…</p>
          </div>
          <div v-else-if="!adminOverview?.users.length" class="empty-table">
            <div class="empty-icon">👤</div>
            <p>No users found.</p>
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

.users-table {
  overflow-x: auto;
}

.user-name-cell {
  font-weight: 500;
}

.badge-admin {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.badge-contributor {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
