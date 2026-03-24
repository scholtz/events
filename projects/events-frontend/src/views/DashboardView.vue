<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import type { EventAnalyticsItem, EventDomain } from '@/types'

const { t, locale } = useI18n()
const dashboardStore = useDashboardStore()
const auth = useAuthStore()
const domainsStore = useDomainsStore()

const overview = computed(() => dashboardStore.overview)

// ── Hub management state ─────────────────────────────────────────────────────
const hubStyleForms = ref<Record<string, { primaryColor: string; accentColor: string; logoUrl: string; bannerUrl: string }>>({})
const hubOverviewForms = ref<Record<string, { overviewContent: string; whatBelongsHere: string; submitEventCta: string; curatorCredit: string }>>({})
const hubStyleSaving = ref<Record<string, boolean>>({})
const hubStyleSuccess = ref<Record<string, boolean>>({})
const hubOverviewSaving = ref<Record<string, boolean>>({})
const hubOverviewSuccess = ref<Record<string, boolean>>({})
const hubManageError = ref<Record<string, string>>({})

function initHubForms(domains: EventDomain[]) {
  for (const d of domains) {
    if (!hubStyleForms.value[d.id]) {
      hubStyleForms.value[d.id] = {
        primaryColor: d.primaryColor ?? '',
        accentColor: d.accentColor ?? '',
        logoUrl: d.logoUrl ?? '',
        bannerUrl: d.bannerUrl ?? '',
      }
    }
    if (!hubOverviewForms.value[d.id]) {
      hubOverviewForms.value[d.id] = {
        overviewContent: d.overviewContent ?? '',
        whatBelongsHere: d.whatBelongsHere ?? '',
        submitEventCta: d.submitEventCta ?? '',
        curatorCredit: d.curatorCredit ?? '',
      }
    }
  }
}

async function handleSaveHubStyle(domainId: string) {
  hubStyleSaving.value[domainId] = true
  hubStyleSuccess.value[domainId] = false
  hubManageError.value[domainId] = ''
  try {
    const form = hubStyleForms.value[domainId]
    if (!form) {
      hubManageError.value[domainId] = t('dashboard.hubManageError')
      return
    }
    await domainsStore.updateDomainStyle({
      domainId,
      primaryColor: form.primaryColor || null,
      accentColor: form.accentColor || null,
      logoUrl: form.logoUrl || null,
      bannerUrl: form.bannerUrl || null,
    })
    hubStyleSuccess.value[domainId] = true
  } catch {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
  } finally {
    hubStyleSaving.value[domainId] = false
  }
}

async function handleSaveHubOverview(domainId: string) {
  hubOverviewSaving.value[domainId] = true
  hubOverviewSuccess.value[domainId] = false
  hubManageError.value[domainId] = ''
  try {
    const form = hubOverviewForms.value[domainId]
    if (!form) {
      hubManageError.value[domainId] = t('dashboard.hubManageError')
      return
    }
    await domainsStore.updateDomainOverview({
      domainId,
      overviewContent: form.overviewContent || null,
      whatBelongsHere: form.whatBelongsHere || null,
      submitEventCta: form.submitEventCta || null,
      curatorCredit: form.curatorCredit || null,
    })
    hubOverviewSuccess.value[domainId] = true
  } catch {
    hubManageError.value[domainId] = t('dashboard.hubManageError')
  } finally {
    hubOverviewSaving.value[domainId] = false
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await dashboardStore.fetchDashboard()
    await domainsStore.fetchMyManagedDomains()
    initHubForms(domainsStore.myManagedDomains)
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
              <div class="stat-helper">{{ t('dashboard.totalEventsHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--approved" aria-hidden="true">✅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--success">{{ overview.publishedEvents }}</div>
              <div class="stat-label">{{ t('dashboard.published') }}</div>
              <div class="stat-helper">{{ t('dashboard.publishedHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--pending" aria-hidden="true">⏳</div>
            <div class="stat-info">
              <div class="stat-number stat-number--warning">{{ overview.pendingApprovalEvents }}</div>
              <div class="stat-label">{{ t('dashboard.pendingReview') }}</div>
              <div class="stat-helper">{{ t('dashboard.pendingReviewHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--interested" aria-hidden="true">🔖</div>
            <div class="stat-info">
              <div class="stat-number stat-number--primary">{{ overview.totalInterestedCount }}</div>
              <div class="stat-label">{{ t('dashboard.totalSaves') }}</div>
              <div class="stat-helper">{{ t('dashboard.totalSavesHelper') }}</div>
            </div>
          </div>
          <div class="stat-card card">
            <div class="stat-icon stat-icon--calendar" aria-hidden="true">📅</div>
            <div class="stat-info">
              <div class="stat-number stat-number--calendar">{{ overview.totalCalendarActions }}</div>
              <div class="stat-label">{{ t('dashboard.calendarAdds') }}</div>
              <div class="stat-helper">{{ t('dashboard.calendarAddsHelper') }}</div>
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
                <th scope="col" class="col-saves" :title="t('dashboard.tableSavesTitle')">
                  {{ t('dashboard.tableSaves') }}
                </th>
                <th scope="col" class="col-momentum" :title="t('dashboard.tableMomentumTitle')">{{ t('dashboard.tableMomentum') }}</th>
                <th scope="col" class="col-calendar" :title="t('dashboard.tableCalendarTitle')">{{ t('dashboard.tableCalendar') }}</th>
                <th scope="col" class="col-cal-trend" :title="t('dashboard.tableCalTrendTitle')">{{ t('dashboard.tableCalTrend') }}</th>
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

          <!-- Guidance: saves exist but no calendar adds -->
          <div
            v-if="overview.totalInterestedCount > 0 && overview.totalCalendarActions === 0"
            class="low-data-guidance low-data-guidance--calendar"
            role="note"
            aria-label="Calendar engagement guidance"
          >
            <span class="guidance-icon" aria-hidden="true">📅</span>
            <div>{{ t('dashboard.guidanceNoCalendarAdds') }}</div>
          </div>
        </div>
      </template>

      <!-- ── Hub Management (for domain administrators) ──────────────────── -->
      <section
        v-if="!dashboardStore.loading && !dashboardStore.error && domainsStore.myManagedDomains.length > 0"
        class="hub-management-section"
        aria-labelledby="hub-management-heading"
      >
        <div class="section-header">
          <h2 id="hub-management-heading">{{ t('dashboard.hubManagementTitle') }}</h2>
          <p class="section-subtitle">{{ t('dashboard.hubManagementDescription') }}</p>
        </div>

        <div
          v-for="hub in domainsStore.myManagedDomains"
          :key="hub.id"
          class="hub-card card"
        >
          <div class="hub-card-header">
            <div class="hub-card-identity">
              <img
                v-if="hub.logoUrl"
                :src="hub.logoUrl"
                :alt="hub.name"
                class="hub-card-logo"
              />
              <div>
                <h3 class="hub-card-name">{{ hub.name }}</h3>
                <p v-if="hub.description" class="hub-card-description">{{ hub.description }}</p>
              </div>
            </div>
            <RouterLink
              :to="`/category/${hub.slug}`"
              class="btn btn-outline btn-sm"
              target="_blank"
              rel="noopener"
            >
              {{ t('dashboard.hubViewHub') }}
            </RouterLink>
          </div>

          <p v-if="hubManageError[hub.id]" class="hub-manage-error" role="alert">
            {{ hubManageError[hub.id] }}
          </p>

          <!-- Style form -->
          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('dashboard.hubStyleTitle') }}</h4>
            <form class="hub-style-form" @submit.prevent="handleSaveHubStyle(hub.id)">
              <div class="hub-form-grid">
                <label class="form-field">
                  <span>{{ t('dashboard.hubPrimaryColor') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.primaryColor"
                    class="form-input"
                    type="text"
                    placeholder="#137fec"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubAccentColor') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.accentColor"
                    class="form-input"
                    type="text"
                    placeholder="#ff5500"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubLogoUrl') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.logoUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/logo.png"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubBannerUrl') }}</span>
                  <input
                    v-model="hubStyleForms[hub.id]!.bannerUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/banner.jpg"
                  />
                </label>
              </div>
              <div class="hub-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="hubStyleSaving[hub.id]"
                >
                  {{ hubStyleSaving[hub.id] ? t('dashboard.hubSaving') : t('dashboard.hubSaveStyle') }}
                </button>
                <span v-if="hubStyleSuccess[hub.id]" class="hub-save-success">
                  {{ t('dashboard.hubSaved') }}
                </span>
              </div>
            </form>
          </div>

          <!-- Overview / content form -->
          <div class="hub-form-section">
            <h4 class="hub-form-title">{{ t('dashboard.hubOverviewTitle') }}</h4>
            <form class="hub-overview-form" @submit.prevent="handleSaveHubOverview(hub.id)">
              <div class="hub-form-grid hub-form-grid--full">
                <label class="form-field">
                  <span>{{ t('dashboard.hubOverviewContent') }}</span>
                  <textarea
                    v-model="hubOverviewForms[hub.id]!.overviewContent"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="2000"
                    placeholder="A short editorial overview about this hub…"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubWhatBelongsHere') }}</span>
                  <textarea
                    v-model="hubOverviewForms[hub.id]!.whatBelongsHere"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="2000"
                    placeholder="Describe what types of events belong in this hub…"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubSubmitEventCta') }}</span>
                  <input
                    v-model="hubOverviewForms[hub.id]!.submitEventCta"
                    class="form-input"
                    type="text"
                    maxlength="200"
                    placeholder="e.g. Organizing a blockchain event? Submit it here."
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('dashboard.hubCuratorCredit') }}</span>
                  <input
                    v-model="hubOverviewForms[hub.id]!.curatorCredit"
                    class="form-input"
                    type="text"
                    maxlength="200"
                    placeholder="e.g. Prague Blockchain Week organizers"
                  />
                </label>
              </div>
              <div class="hub-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="hubOverviewSaving[hub.id]"
                >
                  {{ hubOverviewSaving[hub.id] ? t('dashboard.hubSaving') : t('dashboard.hubSaveOverview') }}
                </button>
                <span v-if="hubOverviewSuccess[hub.id]" class="hub-save-success">
                  {{ t('dashboard.hubSaved') }}
                </span>
              </div>
            </form>
          </div>
        </div>
      </section>
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

.stat-helper {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  line-height: 1.3;
  opacity: 0.8;
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

/* ── Hub management ── */
.hub-management-section {
  margin-top: 2.5rem;
}

.hub-card {
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.hub-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.hub-card-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.hub-card-logo {
  height: 40px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.hub-card-name {
  font-size: 1.0625rem;
  font-weight: 700;
  margin: 0 0 0.125rem;
}

.hub-card-description {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.hub-form-section {
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
  margin-top: 1.25rem;
}

.hub-form-section:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
}

.hub-form-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  margin: 0 0 1rem;
}

.hub-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.hub-form-grid--full {
  grid-template-columns: 1fr;
}

.hub-form-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hub-save-success {
  color: #4ade80;
  font-size: 0.875rem;
  font-weight: 500;
}

.hub-manage-error {
  color: var(--color-danger, #f87171);
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: 1rem;
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

  .hub-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

