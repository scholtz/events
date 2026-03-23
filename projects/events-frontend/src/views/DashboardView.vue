<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import type { EventAnalyticsItem } from '@/types'

const { t, locale } = useI18n()
const dashboardStore = useDashboardStore()
const auth = useAuthStore()

const overview = computed(() => dashboardStore.overview)

onMounted(async () => {
  if (auth.isAuthenticated) {
    await dashboardStore.fetchDashboard()
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabel(status: string): string {
  const key = `eventStatus.${status}`
  const translated = t(key)
  return translated === key ? status.toLowerCase() : translated
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

function trendLabel(item: EventAnalyticsItem): string {
  if (item.interestedLast7Days > 0) return t('dashboard.trendThisWeek', { count: item.interestedLast7Days })
  if (item.interestedLast30Days > 0) return t('dashboard.trendThisMonth', { count: item.interestedLast30Days })
  return t('dashboard.noRecentSaves')
}

function trendClass(item: EventAnalyticsItem): string {
  if (item.interestedLast7Days > 0) return 'trend--active'
  if (item.interestedLast30Days > 0) return 'trend--recent'
  return 'trend--quiet'
}

function calendarTrendLabel(item: EventAnalyticsItem): string {
  if (item.calendarActionsLast7Days > 0) return t('dashboard.trendThisWeek', { count: item.calendarActionsLast7Days })
  if (item.calendarActionsLast30Days > 0) return t('dashboard.trendThisMonth', { count: item.calendarActionsLast30Days })
  return t('dashboard.noRecentAdds')
}

function calendarTrendClass(item: EventAnalyticsItem): string {
  if (item.calendarActionsLast7Days > 0) return 'trend--active'
  if (item.calendarActionsLast30Days > 0) return 'trend--recent'
  return 'trend--quiet'
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'GOOGLE':
      return 'Google'
    case 'OUTLOOK':
      return 'Outlook'
    case 'ICS':
      return 'ICS'
    default:
      return provider
  }
}
</script>

<template>
  <div class="container dashboard-view">
    <div class="page-header">
      <div>
        <h1>{{ t('dashboard.title') }}</h1>
        <p v-if="auth.isAuthenticated">
          {{ t('dashboard.welcomeBack', { name: auth.currentUser?.displayName }) }}
        </p>
        <p v-else>{{ t('dashboard.pleaseLogIn') }}</p>
      </div>
      <RouterLink v-if="auth.isAuthenticated" to="/submit" class="btn btn-primary">
        {{ t('dashboard.submitEvent') }}
      </RouterLink>
    </div>

    <template v-if="auth.isAuthenticated">
      <!-- Loading state -->
      <template v-if="dashboardStore.loading">
        <div class="stats-grid">
          <div v-for="n in 4" :key="n" class="stat-card card">
            <div class="stat-icon skeleton-icon" aria-hidden="true"></div>
            <div class="stat-info">
              <div class="skeleton-line skeleton-number"></div>
              <div class="skeleton-line skeleton-short"></div>
            </div>
          </div>
        </div>
        <div class="section-header">
          <div class="skeleton-line skeleton-heading"></div>
        </div>
        <div class="card events-table">
          <div v-for="n in 3" :key="n" class="skeleton-row">
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
        <button class="btn btn-outline" @click="dashboardStore.fetchDashboard()">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Loaded state -->
      <template v-else-if="overview">
        <!-- KPI stats -->
        <div class="stats-grid" aria-label="Event performance overview">
          <div class="stat-card card">
            <div class="stat-icon stat-icon--total" aria-hidden="true">📊</div>
            <div class="stat-info">
              <div class="stat-number">{{ overview.totalSubmittedEvents }}</div>
              <div class="stat-label">{{ t('dashboard.totalEvents') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--approved" aria-hidden="true">✅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--success">{{ overview.publishedEvents }}</div>
              <div class="stat-label">{{ t('dashboard.published') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--pending" aria-hidden="true">⏳</div>
            <div class="stat-info">
              <div class="stat-number stat-number--warning">{{ overview.pendingApprovalEvents }}</div>
              <div class="stat-label">{{ t('dashboard.pendingReview') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--interested" aria-hidden="true">🔖</div>
            <div class="stat-info">
              <div class="stat-number stat-number--primary">{{ overview.totalInterestedCount }}</div>
              <div class="stat-label">{{ t('dashboard.totalSaves') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--calendar" aria-hidden="true">📅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--calendar">{{ overview.totalCalendarActions }}</div>
              <div class="stat-label">{{ t('dashboard.calendarAdds') }}</div>
            </div>
          </div>
        </div>

        <!-- Analytics section -->
        <div class="section-header">
          <h2>{{ t('dashboard.eventPerformance') }}</h2>
          <p class="section-subtitle performance-description">{{ t('dashboard.performanceDescription') }}</p>
        </div>

        <!-- No events empty state -->
        <div v-if="!overview.managedEvents.length" class="card empty-state">
          <div class="empty-icon">📭</div>
          <h3>{{ t('dashboard.noEventsTitle') }}</h3>
          <p>{{ t('dashboard.noEventsDescription') }}</p>
          <RouterLink to="/submit" class="btn btn-primary">{{ t('dashboard.submitFirstEvent') }}</RouterLink>
        </div>

        <!-- Events analytics table -->
        <div v-else class="card events-table" aria-label="Per-event analytics">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.tableEvent') }}</th>
                <th scope="col">{{ t('dashboard.tableStatus') }}</th>
                <th scope="col">{{ t('dashboard.tableDate') }}</th>
                <th scope="col" class="col-saves" :title="t('dashboard.tableSaves')">
                  {{ t('dashboard.tableSaves') }}
                </th>
                <th scope="col" class="col-momentum" :title="t('dashboard.tableMomentum')">{{ t('dashboard.tableMomentum') }}</th>
                <th scope="col" class="col-calendar" :title="t('dashboard.tableCalendar')">{{ t('dashboard.tableCalendar') }}</th>
                <th scope="col" class="col-cal-trend" :title="t('dashboard.tableCalTrend')">{{ t('dashboard.tableCalTrend') }}</th>
                <th scope="col">{{ t('dashboard.tableActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in overview.eventAnalytics" :key="item.eventId">
                <td>
                  <RouterLink
                    v-if="item.status === 'PUBLISHED'"
                    :to="`/event/${item.eventSlug}`"
                    class="event-link"
                  >
                    {{ item.eventName }}
                  </RouterLink>
                  <span v-else class="event-name-plain">{{ item.eventName }}</span>
                </td>
                <td>
                  <span class="badge" :class="statusBadgeClass(item.status)">
                    {{ statusLabel(item.status) }}
                  </span>
                </td>
                <td class="date-cell">{{ formatDate(item.startsAtUtc) }}</td>
                <td class="col-saves">
                  <span class="saves-count" :aria-label="`${item.totalInterestedCount} saves`">
                    {{ item.totalInterestedCount }}
                  </span>
                </td>
                <td class="col-momentum">
                  <span class="trend-badge" :class="trendClass(item)">
                    {{ trendLabel(item) }}
                  </span>
                </td>
                <td class="col-calendar">
                  <span
                    class="saves-count"
                    :aria-label="`${item.totalCalendarActions} calendar adds`"
                  >
                    {{ item.totalCalendarActions }}
                  </span>
                  <span
                    v-if="item.calendarActionsByProvider.length"
                    class="provider-breakdown"
                    :aria-label="item.calendarActionsByProvider.map(p => `${providerLabel(p.provider)}: ${p.count}`).join(', ')"
                  >
                    <span
                      v-for="p in item.calendarActionsByProvider"
                      :key="p.provider"
                      class="provider-chip"
                      :title="`${providerLabel(p.provider)}: ${p.count}`"
                    >
                      {{ providerLabel(p.provider) }}&nbsp;{{ p.count }}
                    </span>
                  </span>
                </td>
                <td class="col-cal-trend">
                  <span class="trend-badge" :class="calendarTrendClass(item)">
                    {{ calendarTrendLabel(item) }}
                  </span>
                </td>
                <td class="actions-cell">
                  <RouterLink
                    v-if="item.status === 'PUBLISHED'"
                    :to="`/event/${item.eventSlug}`"
                    class="btn btn-outline btn-sm"
                  >
                    {{ t('dashboard.viewDetails') }}
                  </RouterLink>
                  <RouterLink
                    :to="`/edit/${item.eventId}`"
                    class="btn btn-outline btn-sm btn-edit"
                  >
                    {{ t('dashboard.editEvent') }}
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Guidance for low-data state -->
          <div
            v-if="overview.publishedEvents > 0 && overview.totalInterestedCount === 0"
            class="low-data-guidance"
            role="note"
            aria-label="Improvement tip"
          >
            <span class="guidance-icon" aria-hidden="true">💡</span>
            <div>
              <strong>No saves yet.</strong>
              Share your event link, improve your description, or ensure the date and venue are
              clear to attract interest.
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- Not authenticated -->
    <div v-else class="card login-prompt">
      <div class="prompt-icon" aria-hidden="true">🔐</div>
      <h2>{{ t('dashboard.signInRequired') }}</h2>
      <p>{{ t('dashboard.pleaseLogIn') }}</p>
      <RouterLink to="/login" class="btn btn-primary">{{ t('dashboard.logIn') }}</RouterLink>
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

/* ── KPI stats ── */
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

.stat-number--primary {
  color: var(--color-primary);
}

.stat-number--calendar {
  color: #a78bfa;
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

/* ── Section header ── */
.section-header {
  margin-bottom: 0.75rem;
}

.section-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.section-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

/* ── Table ── */
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

th[title] {
  cursor: help;
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

.event-name-plain {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.date-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.saves-count {
  font-weight: 600;
  color: var(--color-text);
}

/* ── Trend badge ── */
.trend-badge {
  display: inline-block;
  padding: 0.1875rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.trend--active {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
}

.trend--recent {
  background: rgba(19, 127, 236, 0.12);
  color: var(--color-primary);
}

.trend--quiet {
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
}

.actions-cell {
  display: flex;
  gap: 0.375rem;
  align-items: center;
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

.btn-edit {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-edit:hover {
  background: rgba(19, 127, 236, 0.08);
}

.btn-sm {
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
}

.btn-sm-placeholder {
  display: inline-block;
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.text-muted {
  color: var(--color-text-secondary);
}

/* ── Low-data guidance ── */
.low-data-guidance {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.guidance-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

/* ── Empty states ── */
.empty-state {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.empty-state h3 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 600;
}

.empty-icon {
  font-size: 2.5rem;
}

/* ── Error state ── */
.error-state {
  padding: 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.error-icon {
  font-size: 2rem;
}

.error-message {
  color: var(--color-danger);
  font-size: 0.9375rem;
}

/* ── Skeleton loading ── */
.skeleton-icon {
  background: var(--color-surface-raised);
}

.skeleton-line {
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.skeleton-number {
  height: 1.875rem;
  width: 3rem;
  margin-bottom: 0.375rem;
}

.skeleton-short {
  height: 0.75rem;
  width: 6rem;
}

.skeleton-heading {
  height: 1.125rem;
  width: 10rem;
  margin-bottom: 0.75rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.skeleton-row:last-child {
  border-bottom: none;
}

.skeleton-cell {
  height: 0.875rem;
  flex: 2;
}

.skeleton-cell-sm {
  height: 0.875rem;
  flex: 1;
}

/* ── Login prompt ── */
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

/* ── Provider breakdown ── */
.provider-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.provider-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
  font-weight: 500;
  background: rgba(167, 139, 250, 0.12);
  color: #a78bfa;
  white-space: nowrap;
  cursor: default;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .col-saves,
  .col-momentum,
  .col-calendar,
  .col-cal-trend {
    display: none;
  }
}
</style>

