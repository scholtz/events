<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import type { EventAnalyticsItem, EventStatus } from '@/types'

const { t, locale } = useI18n()
const dashboardStore = useDashboardStore()
const auth = useAuthStore()

// ── Filters ──────────────────────────────────────────────────────────────────
type PortfolioStatus = '' | 'PUBLISHED' | 'PENDING_APPROVAL' | 'REJECTED' | 'DRAFT' | 'PAST'
type PortfolioSort = 'NEWEST' | 'OLDEST' | 'MOST_SAVES'

const filterStatus = ref<PortfolioStatus>('')
const filterDomain = ref('')
const filterLanguage = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')
const sortBy = ref<PortfolioSort>('NEWEST')

const overview = computed(() => dashboardStore.overview)

const now = new Date()

function isPast(item: EventAnalyticsItem): boolean {
  return new Date(item.startsAtUtc) < now
}

function matchesFilters(item: EventAnalyticsItem): boolean {
  // Status filter
  if (filterStatus.value === 'PAST') {
    if (!isPast(item)) return false
  } else if (filterStatus.value) {
    if (item.status !== (filterStatus.value as EventStatus)) return false
  }

  // Domain filter
  if (filterDomain.value && item.domainSlug !== filterDomain.value) return false

  // Language filter
  if (filterLanguage.value) {
    const langFilter = filterLanguage.value.trim().toLowerCase()
    if (!item.language || item.language.toLowerCase() !== langFilter) return false
  }

  // Date range
  if (filterDateFrom.value) {
    const from = new Date(filterDateFrom.value)
    if (new Date(item.startsAtUtc) < from) return false
  }
  if (filterDateTo.value) {
    const to = new Date(filterDateTo.value)
    // Include whole day
    to.setHours(23, 59, 59, 999)
    if (new Date(item.startsAtUtc) > to) return false
  }

  return true
}

const filteredAndSorted = computed<EventAnalyticsItem[]>(() => {
  if (!overview.value) return []
  const items = overview.value.eventAnalytics.filter(matchesFilters)

  switch (sortBy.value) {
    case 'OLDEST':
      return [...items].sort(
        (a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
      )
    case 'MOST_SAVES':
      return [...items].sort((a, b) => b.totalInterestedCount - a.totalInterestedCount)
    case 'NEWEST':
    default:
      return [...items].sort(
        (a, b) => new Date(b.startsAtUtc).getTime() - new Date(a.startsAtUtc).getTime(),
      )
  }
})

const hasActiveFilters = computed(
  () =>
    filterStatus.value !== '' ||
    filterDomain.value !== '' ||
    filterLanguage.value !== '' ||
    filterDateFrom.value !== '' ||
    filterDateTo.value !== '',
)

function clearFilters() {
  filterStatus.value = ''
  filterDomain.value = ''
  filterLanguage.value = ''
  filterDateFrom.value = ''
  filterDateTo.value = ''
}

// ── Summary derived values ────────────────────────────────────────────────────
const needsAttentionCount = computed(() => {
  if (!overview.value) return 0
  return (overview.value.rejectedEvents ?? 0) + (overview.value.draftEvents ?? 0)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabel(status: EventStatus): string {
  const key = `eventStatus.${status}`
  const translated = t(key)
  return translated === key ? status.toLowerCase() : translated
}

function statusBadgeClass(status: EventStatus): string {
  switch (status) {
    case 'PUBLISHED':
      return 'badge-success'
    case 'PENDING_APPROVAL':
      return 'badge-warning'
    case 'REJECTED':
      return 'badge-danger'
    case 'DRAFT':
      return 'badge-neutral'
    default:
      return ''
  }
}

function actionCue(item: EventAnalyticsItem): string | null {
  if (item.status === 'REJECTED') return t('portfolio.actionCueRejected')
  if (item.status === 'DRAFT') return t('portfolio.actionCueDraft')
  if (item.status === 'PENDING_APPROVAL') return t('portfolio.actionCuePending')
  if (isPast(item) && item.status === 'PUBLISHED') return t('portfolio.actionCuePast')
  return null
}

function actionCueClass(item: EventAnalyticsItem): string {
  if (item.status === 'REJECTED') return 'cue--danger'
  if (item.status === 'DRAFT') return 'cue--neutral'
  if (item.status === 'PENDING_APPROVAL') return 'cue--warning'
  return 'cue--muted'
}

onMounted(async () => {
  if (auth.isAuthenticated && !dashboardStore.overview) {
    await dashboardStore.fetchDashboard()
  }
})
</script>

<template>
  <div class="container portfolio-view">
    <div class="page-header">
      <div>
        <h1>{{ t('portfolio.title') }}</h1>
        <p class="page-subtitle">{{ t('portfolio.subtitle') }}</p>
      </div>
      <RouterLink v-if="auth.isAuthenticated" to="/submit" class="btn btn-primary">
        {{ t('portfolio.submitEvent') }}
      </RouterLink>
    </div>

    <!-- Unauthenticated state -->
    <template v-if="!auth.isAuthenticated">
      <div class="card empty-state" role="alert">
        <div class="empty-icon">🔒</div>
        <h2>{{ t('portfolio.pleaseLogIn') }}</h2>
        <RouterLink to="/login" class="btn btn-primary">{{ t('portfolio.signIn') }}</RouterLink>
      </div>
    </template>

    <template v-else>
      <!-- Loading state -->
      <template v-if="dashboardStore.loading">
        <div class="stats-grid">
          <div v-for="n in 3" :key="n" class="stat-card card">
            <div class="stat-icon skeleton-icon" aria-hidden="true"></div>
            <div class="stat-info">
              <div class="skeleton-line skeleton-number"></div>
              <div class="skeleton-line skeleton-short"></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div v-for="n in 4" :key="n" class="skeleton-row">
            <div class="skeleton-line skeleton-cell"></div>
            <div class="skeleton-line skeleton-cell-sm"></div>
            <div class="skeleton-line skeleton-cell-sm"></div>
          </div>
        </div>
      </template>

      <!-- Error state -->
      <div v-else-if="dashboardStore.error" class="card error-state" role="alert">
        <div class="error-icon">⚠️</div>
        <p class="error-message">{{ dashboardStore.error }}</p>
        <button class="btn btn-outline" @click="dashboardStore.fetchDashboard()">
          {{ t('portfolio.tryAgain') }}
        </button>
      </div>

      <!-- Loaded state -->
      <template v-else-if="overview">
        <!-- ── Summary cards ── -->
        <div class="stats-grid" aria-label="Portfolio overview">
          <div class="stat-card card">
            <div class="stat-icon stat-icon--total" aria-hidden="true">📊</div>
            <div class="stat-info">
              <div class="stat-number">{{ overview.totalSubmittedEvents }}</div>
              <div class="stat-label">{{ t('portfolio.totalEvents') }}</div>
              <div class="stat-helper">{{ t('portfolio.totalEventsHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--approved" aria-hidden="true">✅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--success">{{ overview.publishedEvents }}</div>
              <div class="stat-label">{{ t('portfolio.published') }}</div>
              <div class="stat-helper">{{ t('portfolio.publishedHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card" :class="{ 'stat-card--attention': needsAttentionCount > 0 }">
            <div class="stat-icon stat-icon--attention" aria-hidden="true">⚡</div>
            <div class="stat-info">
              <div
                class="stat-number"
                :class="needsAttentionCount > 0 ? 'stat-number--danger' : ''"
              >
                {{ needsAttentionCount }}
              </div>
              <div class="stat-label">{{ t('portfolio.needsAttention') }}</div>
              <div class="stat-helper">{{ t('portfolio.needsAttentionHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--interested" aria-hidden="true">🔖</div>
            <div class="stat-info">
              <div class="stat-number stat-number--primary">
                {{ overview.totalInterestedCount }}
              </div>
              <div class="stat-label">{{ t('portfolio.totalSaves') }}</div>
              <div class="stat-helper">{{ t('portfolio.totalSavesHelper') }}</div>
            </div>
          </div>
        </div>

        <!-- ── Empty state (no events at all) ── -->
        <div v-if="!overview.managedEvents.length" class="card empty-state portfolio-empty">
          <div class="empty-icon">📋</div>
          <h3>{{ t('portfolio.noEventsTitle') }}</h3>
          <p>{{ t('portfolio.noEventsDescription') }}</p>
          <RouterLink to="/submit" class="btn btn-primary">
            {{ t('portfolio.submitFirstEvent') }}
          </RouterLink>
        </div>

        <template v-else>
          <!-- ── Filters & Sort ── -->
          <div class="portfolio-controls card">
            <div class="filter-row">
              <label class="filter-field">
                <span class="filter-label">{{ t('portfolio.filterStatus') }}</span>
                <select
                  v-model="filterStatus"
                  class="form-select"
                  :aria-label="t('portfolio.ariaFilterStatus')"
                >
                  <option value="">{{ t('portfolio.filterStatusAll') }}</option>
                  <option value="PUBLISHED">{{ t('portfolio.filterStatusPublished') }}</option>
                  <option value="PENDING_APPROVAL">{{ t('portfolio.filterStatusPending') }}</option>
                  <option value="REJECTED">{{ t('portfolio.filterStatusRejected') }}</option>
                  <option value="DRAFT">{{ t('portfolio.filterStatusDraft') }}</option>
                  <option value="PAST">{{ t('portfolio.filterStatusPast') }}</option>
                </select>
              </label>

              <label class="filter-field">
                <span class="filter-label">{{ t('portfolio.filterDomain') }}</span>
                <select
                  v-model="filterDomain"
                  class="form-select"
                  :aria-label="t('portfolio.ariaFilterDomain')"
                >
                  <option value="">{{ t('portfolio.filterDomainAll') }}</option>
                  <option
                    v-for="domain in overview.availableDomains"
                    :key="domain.id"
                    :value="domain.slug"
                  >
                    {{ domain.name }}
                  </option>
                </select>
              </label>

              <label class="filter-field">
                <span class="filter-label">{{ t('portfolio.filterLanguage') }}</span>
                <input
                  v-model="filterLanguage"
                  class="form-input"
                  type="text"
                  :placeholder="t('portfolio.filterLanguagePlaceholder')"
                  :aria-label="t('portfolio.ariaFilterLanguage')"
                />
              </label>

              <label class="filter-field">
                <span class="filter-label">{{ t('portfolio.filterDateFrom') }}</span>
                <input
                  v-model="filterDateFrom"
                  class="form-input"
                  type="date"
                  :aria-label="t('portfolio.ariaFilterDateFrom')"
                />
              </label>

              <label class="filter-field">
                <span class="filter-label">{{ t('portfolio.filterDateTo') }}</span>
                <input
                  v-model="filterDateTo"
                  class="form-input"
                  type="date"
                  :aria-label="t('portfolio.ariaFilterDateTo')"
                />
              </label>

              <label class="filter-field filter-field--sort">
                <span class="filter-label">{{ t('portfolio.sortBy') }}</span>
                <select v-model="sortBy" class="form-select" :aria-label="t('portfolio.ariaSortEvents')">
                  <option value="NEWEST">{{ t('portfolio.sortNewest') }}</option>
                  <option value="OLDEST">{{ t('portfolio.sortOldest') }}</option>
                  <option value="MOST_SAVES">{{ t('portfolio.sortMostSaves') }}</option>
                </select>
              </label>
            </div>

            <button
              v-if="hasActiveFilters"
              class="btn btn-ghost btn-sm clear-filters-btn"
              @click="clearFilters"
            >
              {{ t('portfolio.clearFilters') }}
            </button>
          </div>

          <!-- ── No matching events after filters ── -->
          <div
            v-if="filteredAndSorted.length === 0"
            class="card empty-state"
            role="status"
            aria-label="No matching events"
          >
            <div class="empty-icon">🔍</div>
            <p>{{ t('portfolio.noMatchingEvents') }}</p>
            <button class="btn btn-outline" @click="clearFilters">
              {{ t('portfolio.clearFiltersAction') }}
            </button>
          </div>

          <!-- ── Event list ── -->
          <div v-else class="card portfolio-list" aria-label="Your events">
            <table class="portfolio-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('portfolio.tableEvent') }}</th>
                  <th scope="col">{{ t('portfolio.tableStatus') }}</th>
                  <th scope="col">{{ t('portfolio.tableDate') }}</th>
                  <th scope="col" class="col-category">{{ t('portfolio.tableCategory') }}</th>
                  <th scope="col" class="col-saves">{{ t('portfolio.tableSaves') }}</th>
                  <th scope="col">{{ t('portfolio.tableActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="item in filteredAndSorted" :key="item.eventId">
                  <tr :class="{ 'row--attention': item.status === 'REJECTED' || item.status === 'DRAFT' }">
                    <td class="event-name-cell">
                      <RouterLink
                        v-if="item.status === 'PUBLISHED'"
                        :to="`/event/${item.eventSlug}`"
                        class="event-link"
                      >
                        {{ item.eventName }}
                      </RouterLink>
                      <span v-else class="event-name-plain">{{ item.eventName }}</span>
                      <span
                        v-if="actionCue(item)"
                        class="action-cue"
                        :class="actionCueClass(item)"
                      >
                        {{ actionCue(item) }}
                      </span>
                    </td>
                    <td>
                      <span class="badge" :class="statusBadgeClass(item.status)">
                        {{ statusLabel(item.status) }}
                      </span>
                    </td>
                    <td class="date-cell">{{ formatDate(item.startsAtUtc) }}</td>
                    <td class="col-category">
                      <RouterLink
                        v-if="item.domainSlug"
                        :to="`/category/${item.domainSlug}`"
                        class="domain-link"
                      >
                        {{ item.domainSlug }}
                      </RouterLink>
                      <span v-else class="text-muted">—</span>
                    </td>
                    <td class="col-saves">
                      <span class="saves-count" :aria-label="`${item.totalInterestedCount} saves`">
                        {{ item.totalInterestedCount }}
                      </span>
                    </td>
                    <td class="actions-cell">
                      <RouterLink
                        v-if="item.status === 'PUBLISHED'"
                        :to="`/event/${item.eventSlug}`"
                        class="btn btn-outline btn-sm"
                      >
                        {{ t('portfolio.viewEvent') }}
                      </RouterLink>
                      <RouterLink
                        :to="`/edit/${item.eventId}`"
                        class="btn btn-outline btn-sm btn-edit"
                      >
                        {{ t('portfolio.editEvent') }}
                      </RouterLink>
                    </td>
                  </tr>
                  <!-- Rejected feedback row -->
                  <tr
                    v-if="item.status === 'REJECTED' && item.adminNotes"
                    class="feedback-row"
                    :aria-label="`Moderator feedback for ${item.eventName}`"
                  >
                    <td colspan="6" class="feedback-cell">
                      <span class="feedback-icon" aria-hidden="true">💬</span>
                      <strong>{{ t('portfolio.rejectedFeedback') }}</strong>
                      {{ item.adminNotes }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.portfolio-view {
  padding-top: 2rem;
  padding-bottom: 4rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
}

.page-subtitle {
  color: var(--color-text-secondary);
  margin: 0;
  font-size: 0.9rem;
}

/* ── Stats grid ─────────────────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
}

.stat-card--attention {
  border-left: 3px solid var(--color-danger, #e53e3e);
}

.stat-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-number {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}

.stat-number--success {
  color: var(--color-success, #38a169);
}

.stat-number--primary {
  color: var(--color-primary);
}

.stat-number--danger {
  color: var(--color-danger, #e53e3e);
}

.stat-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.stat-helper {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, var(--color-text-secondary));
  margin-top: 0.125rem;
}

/* ── Skeleton loaders ───────────────────────────────────────────────────── */
.skeleton-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: var(--color-border);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-line {
  height: 0.875rem;
  border-radius: var(--radius-sm);
  background: var(--color-border);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-number {
  width: 3rem;
  height: 1.5rem;
  margin-bottom: 0.5rem;
}

.skeleton-short {
  width: 6rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.skeleton-cell {
  flex: 2;
}

.skeleton-cell-sm {
  flex: 1;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* ── Error / empty states ───────────────────────────────────────────────── */
.error-state {
  text-align: center;
  padding: 3rem 2rem;
}

.error-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.error-message {
  color: var(--color-text-secondary);
  margin-bottom: 1.25rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.empty-state h2,
.empty-state h3 {
  margin: 0 0 0.75rem;
}

.empty-state p {
  color: var(--color-text-secondary);
  margin: 0 0 1.5rem;
  max-width: 34rem;
  margin-left: auto;
  margin-right: auto;
}

/* ── Controls bar ───────────────────────────────────────────────────────── */
.portfolio-controls {
  margin-bottom: 1.5rem;
  padding: 1.25rem;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 130px;
  flex: 1;
}

.filter-field--sort {
  margin-left: auto;
}

.filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.form-select,
.form-input {
  height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875rem;
}

.form-input {
  width: 100%;
}

.clear-filters-btn {
  margin-top: 0.75rem;
  align-self: flex-start;
}

/* ── Portfolio table ────────────────────────────────────────────────────── */
.portfolio-list {
  overflow: auto;
  padding: 0;
}

.portfolio-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.portfolio-table thead tr {
  border-bottom: 2px solid var(--color-border);
}

.portfolio-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.portfolio-table td {
  padding: 0.875rem 1rem;
  vertical-align: middle;
  border-bottom: 1px solid var(--color-border);
}

.portfolio-table tbody tr:last-child td {
  border-bottom: none;
}

.row--attention {
  background: rgba(229, 62, 62, 0.04);
}

.row--attention:hover {
  background: rgba(229, 62, 62, 0.07);
}

.portfolio-table tbody tr:not(.row--attention):hover td {
  background: var(--color-surface-raised);
}

.event-name-cell {
  max-width: 280px;
}

.event-link {
  font-weight: 500;
  color: var(--color-primary);
  text-decoration: none;
}

.event-link:hover {
  text-decoration: underline;
}

.event-name-plain {
  font-weight: 500;
  color: var(--color-text);
}

.action-cue {
  display: block;
  font-size: 0.7rem;
  margin-top: 0.2rem;
  font-weight: 500;
}

.cue--danger {
  color: var(--color-danger, #e53e3e);
}

.cue--warning {
  color: var(--color-warning, #d97706);
}

.cue--neutral {
  color: var(--color-text-secondary);
}

.cue--muted {
  color: var(--color-text-tertiary, var(--color-text-secondary));
}

.date-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.col-category {
  white-space: nowrap;
}

.col-saves {
  text-align: center;
  white-space: nowrap;
}

.saves-count {
  font-weight: 600;
  font-size: 1rem;
}

.domain-link {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  text-decoration: none;
  padding: 0.15rem 0.45rem;
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.domain-link:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.text-muted {
  color: var(--color-text-secondary);
}

.actions-cell {
  white-space: nowrap;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Feedback row ───────────────────────────────────────────────────────── */
.feedback-row td {
  background: rgba(229, 62, 62, 0.05);
  border-top: none;
}

.feedback-cell {
  padding: 0.5rem 1rem 0.75rem !important;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.feedback-icon {
  margin-right: 0.25rem;
}

/* ── Badge styles (reuse dashboard conventions) ─────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.badge-success {
  background: rgba(56, 161, 105, 0.12);
  color: #276749;
}

.badge-warning {
  background: rgba(217, 119, 6, 0.12);
  color: #92400e;
}

.badge-danger {
  background: rgba(229, 62, 62, 0.12);
  color: #9b1c1c;
}

.badge-neutral {
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .col-category {
    display: none;
  }

  .filter-field--sort {
    margin-left: 0;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
