<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEventsStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import { gqlRequest } from '@/lib/graphql'
import { isValidHexColor } from '@/lib/colorUtils'
import type { AdminOverview, CatalogEvent, DomainAdministrator, User } from '@/types'

const { t, locale } = useI18n()
const eventsStore = useEventsStore()
const auth = useAuthStore()
const domainsStore = useDomainsStore()

const activeTab = ref<'events' | 'domains' | 'users'>('events')

const newDomain = ref({ name: '', slug: '', subdomain: '', description: '' })

const adminOverview = ref<AdminOverview | null>(null)
const adminLoading = ref(false)
const updatingRole = ref<string | null>(null)

// ── Domain admin management state ────────────────────────────────────────
const selectedDomainId = ref<string | null>(null)
const domainAdmins = ref<DomainAdministrator[]>([])
const domainAdminsLoading = ref(false)
const addAdminUserId = ref('')
const domainAdminError = ref('')
const domainStyleSaving = ref(false)
const domainStyleSuccess = ref(false)
const domainStyleColorErrors = ref({ primaryColor: '', accentColor: '' })
const domainStyleForm = ref({
  primaryColor: '',
  accentColor: '',
  logoUrl: '',
  bannerUrl: '',
})
const domainOverviewSaving = ref(false)
const domainOverviewSuccess = ref(false)
const domainOverviewForm = ref({
  overviewContent: '',
  whatBelongsHere: '',
  submitEventCta: '',
  curatorCredit: '',
})

// ── Community links state ─────────────────────────────────────────────────
const communityLinks = ref<{ title: string; url: string }[]>([])
const communityLinksSaving = ref(false)
const communityLinksSuccess = ref(false)
const communityLinksError = ref('')
const newLinkTitle = ref('')
const newLinkUrl = ref('')

// ── Featured events curation state ────────────────────────────────────────
const featuredEvents = ref<import('@/types').CatalogEvent[]>([])
const featuredEventsLoading = ref(false)
const featuredEventsSaving = ref(false)
const featuredEventsSuccess = ref(false)
const featuredEventsError = ref('')
const addFeaturedEventId = ref('')

async function selectDomain(domainId: string) {
  if (selectedDomainId.value === domainId) {
    selectedDomainId.value = null
    return
  }
  selectedDomainId.value = domainId
  domainAdminError.value = ''
  domainStyleSuccess.value = false
  domainStyleColorErrors.value = { primaryColor: '', accentColor: '' }
  domainOverviewSuccess.value = false
  featuredEventsSuccess.value = false
  featuredEventsError.value = ''
  addFeaturedEventId.value = ''
  communityLinksSuccess.value = false
  communityLinksError.value = ''
  newLinkTitle.value = ''
  newLinkUrl.value = ''

  const domain = domainsStore.domains.find((d) => d.id === domainId)
  if (domain) {
    domainStyleForm.value = {
      primaryColor: domain.primaryColor ?? '',
      accentColor: domain.accentColor ?? '',
      logoUrl: domain.logoUrl ?? '',
      bannerUrl: domain.bannerUrl ?? '',
    }
    domainOverviewForm.value = {
      overviewContent: domain.overviewContent ?? '',
      whatBelongsHere: domain.whatBelongsHere ?? '',
      submitEventCta: domain.submitEventCta ?? '',
      curatorCredit: domain.curatorCredit ?? '',
    }
    communityLinks.value = (domain.links ?? []).map((l) => ({ title: l.title, url: l.url }))
  }

  await Promise.all([loadDomainAdmins(domainId), loadFeaturedEvents(domainId)])
}

async function loadDomainAdmins(domainId: string) {
  domainAdminsLoading.value = true
  try {
    domainAdmins.value = await domainsStore.fetchDomainAdministrators(domainId)
  } catch {
    domainAdmins.value = []
  } finally {
    domainAdminsLoading.value = false
  }
}

async function handleAddDomainAdmin() {
  if (!selectedDomainId.value || !addAdminUserId.value) return
  domainAdminError.value = ''
  try {
    await domainsStore.addDomainAdministrator(selectedDomainId.value, addAdminUserId.value)
    addAdminUserId.value = ''
    await loadDomainAdmins(selectedDomainId.value)
  } catch {
    domainAdminError.value = 'Failed to add domain administrator.'
  }
}

async function handleRemoveDomainAdmin(userId: string) {
  if (!selectedDomainId.value) return
  domainAdminError.value = ''
  try {
    await domainsStore.removeDomainAdministrator(selectedDomainId.value, userId)
    await loadDomainAdmins(selectedDomainId.value)
  } catch {
    domainAdminError.value = 'Failed to remove domain administrator.'
  }
}

async function handleSaveDomainStyle() {
  if (!selectedDomainId.value) return
  domainStyleSaving.value = true
  domainStyleSuccess.value = false
  domainAdminError.value = ''

  const colorErrors = { primaryColor: '', accentColor: '' }
  if (!isValidHexColor(domainStyleForm.value.primaryColor))
    colorErrors.primaryColor = t('admin.domainColorError')
  if (!isValidHexColor(domainStyleForm.value.accentColor))
    colorErrors.accentColor = t('admin.domainColorError')
  domainStyleColorErrors.value = colorErrors
  if (colorErrors.primaryColor || colorErrors.accentColor) {
    domainStyleSaving.value = false
    return
  }

  try {
    await domainsStore.updateDomainStyle({
      domainId: selectedDomainId.value,
      primaryColor: domainStyleForm.value.primaryColor || null,
      accentColor: domainStyleForm.value.accentColor || null,
      logoUrl: domainStyleForm.value.logoUrl || null,
      bannerUrl: domainStyleForm.value.bannerUrl || null,
    })
    domainStyleSuccess.value = true
  } catch {
    domainAdminError.value = 'Failed to save domain style.'
  } finally {
    domainStyleSaving.value = false
  }
}

async function handleSaveDomainOverview() {
  if (!selectedDomainId.value) return
  domainOverviewSaving.value = true
  domainOverviewSuccess.value = false
  domainAdminError.value = ''
  try {
    await domainsStore.updateDomainOverview({
      domainId: selectedDomainId.value,
      overviewContent: domainOverviewForm.value.overviewContent || null,
      whatBelongsHere: domainOverviewForm.value.whatBelongsHere || null,
      submitEventCta: domainOverviewForm.value.submitEventCta || null,
      curatorCredit: domainOverviewForm.value.curatorCredit || null,
    })
    domainOverviewSuccess.value = true
  } catch {
    domainAdminError.value = 'Failed to save hub overview.'
  } finally {
    domainOverviewSaving.value = false
  }
}

async function loadFeaturedEvents(domainId: string) {
  const domain = domainsStore.domains.find((d) => d.id === domainId)
  if (!domain) return
  featuredEventsLoading.value = true
  try {
    const data = await gqlRequest<{ featuredEventsForDomain: import('@/types').CatalogEvent[] }>(
      `query FeaturedEventsForDomain($domainSlug: String!) {
        featuredEventsForDomain(domainSlug: $domainSlug) {
          id name slug status startsAtUtc
        }
      }`,
      { domainSlug: domain.slug },
    )
    featuredEvents.value = data.featuredEventsForDomain
  } catch {
    featuredEvents.value = []
  } finally {
    featuredEventsLoading.value = false
  }
}

async function handleAddFeaturedEvent() {
  if (!selectedDomainId.value || !addFeaturedEventId.value) return
  if (featuredEvents.value.length >= 5) {
    featuredEventsError.value = t('admin.featuredEventsHint')
    return
  }
  if (featuredEvents.value.some((e) => e.id === addFeaturedEventId.value)) {
    addFeaturedEventId.value = ''
    return
  }
  const eventToAdd = allAdminEvents().find((e) => e.id === addFeaturedEventId.value)
  if (eventToAdd) {
    featuredEvents.value = [...featuredEvents.value, eventToAdd]
    addFeaturedEventId.value = ''
    featuredEventsSuccess.value = false
  }
}

function handleRemoveFeaturedEvent(eventId: string) {
  featuredEvents.value = featuredEvents.value.filter((e) => e.id !== eventId)
  featuredEventsSuccess.value = false
}

async function handleSaveFeaturedEvents() {
  if (!selectedDomainId.value) return
  featuredEventsSaving.value = true
  featuredEventsSuccess.value = false
  featuredEventsError.value = ''
  try {
    await domainsStore.setDomainFeaturedEvents(
      selectedDomainId.value,
      featuredEvents.value.map((e) => e.id),
    )
    featuredEventsSuccess.value = true
  } catch {
    featuredEventsError.value = t('admin.featuredEventsError')
  } finally {
    featuredEventsSaving.value = false
  }
}

function handleAddCommunityLink() {
  const title = newLinkTitle.value.trim()
  const url = newLinkUrl.value.trim()
  if (!title || !url) return
  if (communityLinks.value.length >= 10) return
  communityLinks.value = [...communityLinks.value, { title, url }]
  newLinkTitle.value = ''
  newLinkUrl.value = ''
  communityLinksSuccess.value = false
}

function handleRemoveCommunityLink(idx: number) {
  communityLinks.value = communityLinks.value.filter((_, i) => i !== idx)
  communityLinksSuccess.value = false
}

async function handleSaveCommunityLinks() {
  if (!selectedDomainId.value) return
  communityLinksSaving.value = true
  communityLinksSuccess.value = false
  communityLinksError.value = ''
  try {
    await domainsStore.setDomainLinks(selectedDomainId.value, communityLinks.value)
    communityLinksSuccess.value = true
  } catch {
    communityLinksError.value = t('admin.communityLinksError')
  } finally {
    communityLinksSaving.value = false
  }
}

/** Published events that belong to the currently selected domain */
const domainPublishedEvents = computed<CatalogEvent[]>(() => {
  if (!selectedDomainId.value) return []
  return allAdminEvents().filter(
    (e) => e.domainId === selectedDomainId.value && e.status === 'PUBLISHED',
  )
})

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

const roleError = ref('')

async function updateUserRole(userId: string, role: 'ADMIN' | 'CONTRIBUTOR') {
  updatingRole.value = userId
  roleError.value = ''
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
  } catch {
    roleError.value = 'Failed to update user role. Please try again.'
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

async function addDomain() {
  if (!newDomain.value.name || !newDomain.value.slug || !newDomain.value.subdomain) return
  await domainsStore.upsertDomain({ ...newDomain.value })
  newDomain.value = { name: '', slug: '', subdomain: '', description: '' }
  await fetchAdminOverview()
}

async function handleReviewEvent(eventId: string, status: string) {
  try {
    await eventsStore.reviewEvent(eventId, status)
    await fetchAdminOverview()
  } catch {
    // Review failed – the events store handles the error state
  }
}
</script>

<template>
  <div class="container admin-view">
    <div class="page-header">
      <div>
        <h1>{{ t('admin.title') }}</h1>
        <p>{{ t('admin.subtitle') }}</p>
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
          {{ t('admin.tabEvents') }}
          <span class="tab-count">{{ allAdminEvents().length }}</span>
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'domains' }]"
          @click="activeTab = 'domains'"
        >
          {{ t('admin.tabDomains') }}
          <span class="tab-count">{{ domainsStore.domains.length }}</span>
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'users' }]"
          @click="activeTab = 'users'"
        >
          {{ t('admin.tabUsers') }}
          <span class="tab-count">{{ adminOverview?.users.length ?? 0 }}</span>
        </button>
      </div>

      <!-- Events management -->
      <div v-if="activeTab === 'events'" class="admin-section">
        <div v-if="adminLoading" class="loading-state card">
          <p>{{ t('common.loading') }}</p>
        </div>
        <div v-else class="events-table card">
          <table>
            <thead>
              <tr>
                <th>Event / Submitter</th>
                <th>Tag</th>
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
                  <RouterLink
                    :to="`/edit/${event.id}`"
                    class="btn btn-primary btn-sm"
                  >
                    {{ t('admin.edit') }}
                  </RouterLink>
                  <button
                    v-if="event.status !== 'PUBLISHED'"
                    class="btn btn-success btn-sm"
                    @click="handleReviewEvent(event.id, 'PUBLISHED')"
                  >
                    {{ t('admin.approve') }}
                  </button>
                  <button
                    v-if="event.status !== 'REJECTED'"
                    class="btn btn-outline btn-sm"
                    @click="handleReviewEvent(event.id, 'REJECTED')"
                  >
                    {{ t('admin.reject') }}
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

      <!-- Tags management -->
      <div v-if="activeTab === 'domains'" class="admin-section">
        <div class="add-category card">
          <h3>{{ t('admin.addDomain') }}</h3>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in domainsStore.domains"
                :key="d.id"
                :class="{ 'selected-row': selectedDomainId === d.id }"
              >
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
                <td class="actions-cell">
                  <button
                    class="btn btn-outline btn-sm"
                    @click="selectDomain(d.id)"
                  >
                  {{ selectedDomainId === d.id ? t('common.close') : t('admin.manage') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!domainsStore.domains.length" class="empty-table">
            <div class="empty-icon">🏷️</div>
            <p>No domains yet. Add one above.</p>
          </div>
        </div>

        <!-- Domain detail panel -->
        <div v-if="selectedDomainId" class="domain-detail card">
          <p v-if="domainAdminError" class="role-error" role="alert">{{ domainAdminError }}</p>

          <!-- Domain style editor -->
          <div class="domain-style-section">
            <h3>{{ t('admin.domainStyleTitle') }}</h3>
            <form class="style-form" @submit.prevent="handleSaveDomainStyle">
              <div class="style-form-grid">
                <label class="form-field">
                  <span>{{ t('admin.domainPrimaryColor') }}</span>
                  <input
                    v-model="domainStyleForm.primaryColor"
                    :class="['form-input', { 'input-error': domainStyleColorErrors.primaryColor }]"
                    type="text"
                    placeholder="#137fec"
                    aria-describedby="admin-primary-color-error"
                  />
                  <span
                    v-if="domainStyleColorErrors.primaryColor"
                    id="admin-primary-color-error"
                    class="field-error"
                    role="alert"
                  >
                    {{ domainStyleColorErrors.primaryColor }}
                  </span>
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainAccentColor') }}</span>
                  <input
                    v-model="domainStyleForm.accentColor"
                    :class="['form-input', { 'input-error': domainStyleColorErrors.accentColor }]"
                    type="text"
                    placeholder="#ff5500"
                    aria-describedby="admin-accent-color-error"
                  />
                  <span
                    v-if="domainStyleColorErrors.accentColor"
                    id="admin-accent-color-error"
                    class="field-error"
                    role="alert"
                  >
                    {{ domainStyleColorErrors.accentColor }}
                  </span>
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainLogoUrl') }}</span>
                  <input
                    v-model="domainStyleForm.logoUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/logo.png"
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainBannerUrl') }}</span>
                  <input
                    v-model="domainStyleForm.bannerUrl"
                    class="form-input"
                    type="url"
                    placeholder="https://example.com/banner.jpg"
                  />
                </label>
              </div>
              <div class="style-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="domainStyleSaving"
                >
                  {{ domainStyleSaving ? t('admin.domainSaving') : t('admin.domainSaveStyle') }}
                </button>
                <span v-if="domainStyleSuccess" class="save-success">✓ Saved</span>
              </div>
            </form>
          </div>

          <!-- Hub overview content editor -->
          <div class="domain-style-section">
            <h3>{{ t('admin.hubOverview') }}</h3>
            <form class="style-form" @submit.prevent="handleSaveDomainOverview">
              <div class="overview-form-grid">
                <label class="form-field">
                  <span>{{ t('admin.domainOverviewContent') }}</span>
                  <textarea
                    v-model="domainOverviewForm.overviewContent"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="2000"
                    placeholder="A short editorial overview about this hub…"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainWhatBelongsHere') }}</span>
                  <textarea
                    v-model="domainOverviewForm.whatBelongsHere"
                    class="form-input form-textarea"
                    rows="3"
                    maxlength="1000"
                    placeholder="Describe what types of events belong in this hub…"
                  ></textarea>
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainSubmitEventCta') }}</span>
                  <input
                    v-model="domainOverviewForm.submitEventCta"
                    class="form-input"
                    type="text"
                    maxlength="300"
                    placeholder="e.g. Organizing a blockchain event? Submit it here."
                  />
                </label>
                <label class="form-field">
                  <span>{{ t('admin.domainCuratorCredit') }}</span>
                  <input
                    v-model="domainOverviewForm.curatorCredit"
                    class="form-input"
                    type="text"
                    maxlength="200"
                    placeholder="e.g. Prague Blockchain Week organizers"
                  />
                </label>
              </div>
              <div class="style-form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="domainOverviewSaving"
                >
                  {{ domainOverviewSaving ? 'Saving…' : t('admin.saveOverview') }}
                </button>
                <span v-if="domainOverviewSuccess" class="save-success">✓ Saved</span>
              </div>
            </form>
          </div>

          <!-- Featured Events curation section -->
          <div class="domain-style-section domain-featured-section">
            <h3>{{ t('admin.featuredEvents') }}</h3>
            <p class="featured-hint text-secondary">{{ t('admin.featuredEventsHint') }}</p>
            <div v-if="featuredEventsLoading" class="loading-state">
              <p>{{ t('common.loading') }}</p>
            </div>
            <template v-else>
              <p v-if="featuredEventsError" class="role-error" role="alert">{{ featuredEventsError }}</p>
              <div class="featured-events-list">
                <div
                  v-for="(fe, idx) in featuredEvents"
                  :key="fe.id"
                  class="featured-event-item"
                >
                  <span class="featured-order-badge">{{ idx + 1 }}</span>
                  <div class="featured-event-name">
                    <strong>{{ fe.name }}</strong>
                    <span class="text-secondary">{{ new Date(fe.startsAtUtc).toLocaleDateString(locale) }}</span>
                  </div>
                  <button
                    class="btn btn-outline btn-sm"
                    type="button"
                    @click="handleRemoveFeaturedEvent(fe.id)"
                  >
                    {{ t('admin.removeFeaturedEvent') }}
                  </button>
                </div>
                <p v-if="!featuredEvents.length" class="text-secondary featured-empty">
                  {{ t('admin.featuredEventsEmpty') }}
                </p>
              </div>
              <!-- Add featured event picker -->
              <div v-if="featuredEvents.length < 5" class="add-featured-form">
                <select v-model="addFeaturedEventId" class="form-input">
                  <option value="" disabled>Select an event to feature…</option>
                  <option
                    v-for="ev in domainPublishedEvents.filter(
                      (e) => !featuredEvents.some((fe) => fe.id === e.id)
                    )"
                    :key="ev.id"
                    :value="ev.id"
                  >
                    {{ ev.name }}
                  </option>
                </select>
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  :disabled="!addFeaturedEventId"
                  @click="handleAddFeaturedEvent"
                >
                  {{ t('admin.addFeaturedEvent') }}
                </button>
              </div>
              <div class="style-form-actions">
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="featuredEventsSaving"
                  @click="handleSaveFeaturedEvents"
                >
                  {{ featuredEventsSaving ? t('admin.featuredEventsSaving') : t('admin.saveFeaturedEvents') }}
                </button>
                <span v-if="featuredEventsSuccess" class="save-success">{{ t('admin.featuredEventsSaved') }}</span>
              </div>
            </template>
          </div>

          <!-- Community links curation section -->
          <div class="domain-style-section domain-community-links-section">
            <h3>{{ t('admin.communityLinks') }}</h3>
            <p class="featured-hint text-secondary">{{ t('admin.communityLinksHint') }}</p>
            <p v-if="communityLinksError" class="role-error" role="alert">{{ communityLinksError }}</p>
            <div class="community-links-list">
              <div
                v-for="(link, idx) in communityLinks"
                :key="idx"
                class="community-link-item"
              >
                <span class="community-link-order">{{ idx + 1 }}</span>
                <div class="community-link-info">
                  <strong>{{ link.title }}</strong>
                  <span class="text-secondary community-link-url">{{ link.url }}</span>
                </div>
                <button
                  class="btn btn-outline btn-sm"
                  type="button"
                  @click="handleRemoveCommunityLink(idx)"
                >
                  {{ t('admin.removeCommunityLink') }}
                </button>
              </div>
              <p v-if="!communityLinks.length" class="text-secondary community-links-empty">
                {{ t('admin.communityLinksEmpty') }}
              </p>
            </div>
            <!-- Add new link form -->
            <div v-if="communityLinks.length < 10" class="add-community-link-form">
              <input
                v-model="newLinkTitle"
                class="form-input"
                type="text"
                :placeholder="t('admin.communityLinksLinkTitle')"
                maxlength="100"
              />
              <input
                v-model="newLinkUrl"
                class="form-input"
                type="url"
                :placeholder="t('admin.communityLinksLinkUrl')"
              />
              <button
                class="btn btn-outline btn-sm"
                type="button"
                :disabled="!newLinkTitle.trim() || !newLinkUrl.trim()"
                @click="handleAddCommunityLink"
              >
                {{ t('admin.addCommunityLink') }}
              </button>
            </div>
            <div class="style-form-actions">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="communityLinksSaving"
                @click="handleSaveCommunityLinks"
              >
                {{ communityLinksSaving ? t('admin.communityLinksSaving') : t('admin.saveCommunityLinks') }}
              </button>
              <span v-if="communityLinksSuccess" class="save-success">{{ t('admin.communityLinksSaved') }}</span>
            </div>
          </div>

          <!-- Domain administrators -->
          <div class="domain-admins-section">
            <h3>{{ t('admin.tagAdministrators') }}</h3>
            <div v-if="domainAdminsLoading" class="loading-state">
              <p>{{ t('common.loading') }}</p>
            </div>
            <template v-else>
              <div class="admin-list">
                <div
                  v-for="da in domainAdmins"
                  :key="da.id"
                  class="admin-list-item"
                >
                  <div>
                    <strong>{{ da.user.displayName }}</strong>
                    <span class="text-secondary">{{ da.user.email }}</span>
                  </div>
                  <button
                    class="btn btn-outline btn-sm"
                    @click="handleRemoveDomainAdmin(da.userId)"
                  >
                    {{ t('admin.removeDomainAdmin') }}
                  </button>
                </div>
                <p v-if="!domainAdmins.length" class="text-secondary">
                  {{ t('admin.noAdministratorsAssigned') }}
                </p>
              </div>
              <form class="add-admin-form" @submit.prevent="handleAddDomainAdmin">
                <select
                  v-model="addAdminUserId"
                  class="form-input"
                  required
                >
                  <option value="" disabled>Select user…</option>
                  <option
                    v-for="user in (adminOverview?.users ?? []).filter(
                      (u) => !domainAdmins.some((da) => da.userId === u.id)
                    )"
                    :key="user.id"
                    :value="user.id"
                  >
                    {{ user.displayName }} ({{ user.email }})
                  </option>
                </select>
                <button type="submit" class="btn btn-primary btn-sm" :disabled="!addAdminUserId">
                  {{ t('admin.addDomainAdmin') }}
                </button>
              </form>
            </template>
          </div>
        </div>
      </div>

      <!-- Users management -->
      <div v-if="activeTab === 'users'" class="admin-section">
        <p v-if="roleError" class="role-error" role="alert">{{ roleError }}</p>
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
                    {{ t('admin.makeContributor') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="adminLoading" class="empty-table">
            <p>{{ t('common.loading') }}</p>
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

.role-error {
  color: var(--color-danger, #f87171);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border-radius: var(--radius-sm, 4px);
}

/* ── Domain detail panel ──────────────────────────────────────── */

.selected-row {
  background: rgba(99, 102, 241, 0.08);
}

.domain-detail {
  margin-top: 1rem;
  padding: 1.5rem;
}

.domain-style-section,
.domain-admins-section {
  margin-bottom: 1.5rem;
}

.domain-style-section h3,
.domain-admins-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.style-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.overview-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

.form-textarea {
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  line-height: 1.5;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.style-form-actions {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.save-success {
  color: #4ade80;
  font-size: 0.875rem;
  font-weight: 500;
}

.input-error {
  border-color: var(--color-danger, #f87171) !important;
  outline-color: var(--color-danger, #f87171);
}

.field-error {
  color: var(--color-danger, #f87171);
  font-size: 0.75rem;
  margin-top: 0.25rem;
  display: block;
}

.admin-list {
  margin-bottom: 0.75rem;
}

.admin-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.admin-list-item span {
  margin-left: 0.5rem;
  font-size: 0.8125rem;
}

.add-admin-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.5rem;
}

.add-admin-form select {
  flex: 1;
}

/* ── Featured events curation ──────────────────────────── */
.domain-featured-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.featured-hint {
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.featured-events-list {
  margin-bottom: 0.75rem;
}

.featured-event-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.featured-order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  background: rgba(255, 215, 0, 0.18);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  color: #b8860b;
  flex-shrink: 0;
}

.featured-event-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.featured-event-name strong {
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.featured-event-name span {
  font-size: 0.75rem;
}

.featured-empty {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.add-featured-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.add-featured-form select {
  flex: 1;
}

/* ── Community links ──────────────────────────────────────────────────── */
.community-links-list {
  margin-bottom: 0.75rem;
}

.community-link-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.community-link-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  background: rgba(19, 127, 236, 0.15);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-primary);
  flex-shrink: 0;
}

.community-link-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.community-link-info strong {
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-link-url {
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-links-empty {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.add-community-link-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.add-community-link-form .form-input {
  flex: 1;
  min-width: 8rem;
}
</style>
