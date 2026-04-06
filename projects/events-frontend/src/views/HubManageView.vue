<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'
import { gqlRequest } from '@/lib/graphql'
import { isValidHexColor } from '@/lib/colorUtils'
import {
  fromDatetimeLocalValue,
  scheduleStatus,
  toDatetimeLocalValue,
  validateScheduleDates,
  validateScheduleInput,
} from '@/lib/scheduleUtils'
import type { CatalogEvent, EventDomain, ScheduledFeaturedEvent } from '@/types'

const { t, locale } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const domainsStore = useDomainsStore()

const slug = computed(() => route.params.slug as string)

const domain = ref<EventDomain | null>(null)
const loading = ref(false)
const error = ref('')

const MAX_FEATURED_EVENTS = 5
const MAX_COMMUNITY_LINKS = 10

// ── Style form state ──────────────────────────────────────────────────────────
const styleForm = ref({ primaryColor: '', accentColor: '', logoUrl: '', bannerUrl: '' })
const colorErrors = ref({ primaryColor: '', accentColor: '' })
const styleSaving = ref(false)
const styleSuccess = ref(false)
const styleError = ref('')

// ── Overview form state ───────────────────────────────────────────────────────
const overviewForm = ref({
  tagline: '',
  overviewContent: '',
  whatBelongsHere: '',
  submitEventCta: '',
  curatorCredit: '',
})
const overviewSaving = ref(false)
const overviewSuccess = ref(false)
const overviewError = ref('')

// ── Community links state ─────────────────────────────────────────────────────
const communityLinks = ref<{ title: string; url: string }[]>([])
const newLinkForm = ref({ title: '', url: '' })
const linksSaving = ref(false)
const linksSuccess = ref(false)
const linksError = ref('')

// ── Featured events state ─────────────────────────────────────────────────────
const featuredEvents = ref<CatalogEvent[]>([])
const featuredLoading = ref(false)
const featuredSaving = ref(false)
const featuredSuccess = ref(false)
const featuredError = ref('')
const addFeaturedEventId = ref('')
const availableEvents = ref<CatalogEvent[]>([])

// ── Scheduled featured events state ──────────────────────────────────────────
const schedules = ref<ScheduledFeaturedEvent[]>([])
const schedulesLoading = ref(false)
const schedulesError = ref('')
const schedulesSaving = ref(false)

// Form for creating a new schedule
const newScheduleForm = ref({
  eventId: '',
  startsAtUtc: '',
  endsAtUtc: '',
  priority: 0,
  isEnabled: true,
  displayLabel: '',
})
const newScheduleError = ref('')
const newScheduleSuccess = ref(false)

// Track which schedule entry is being edited inline (null = none)
const editingScheduleId = ref<string | null>(null)
const editScheduleForm = ref({
  startsAtUtc: '',
  endsAtUtc: '',
  priority: 0,
  isEnabled: true,
  displayLabel: '',
})
const editScheduleError = ref('')

function initForms(d: EventDomain) {
  styleForm.value = {
    primaryColor: d.primaryColor ?? '',
    accentColor: d.accentColor ?? '',
    logoUrl: d.logoUrl ?? '',
    bannerUrl: d.bannerUrl ?? '',
  }
  overviewForm.value = {
    tagline: d.tagline ?? '',
    overviewContent: d.overviewContent ?? '',
    whatBelongsHere: d.whatBelongsHere ?? '',
    submitEventCta: d.submitEventCta ?? '',
    curatorCredit: d.curatorCredit ?? '',
  }
  communityLinks.value = (d.links ?? []).map((l) => ({ title: l.title, url: l.url }))
}

async function loadDomain() {
  if (!auth.isAuthenticated || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await domainsStore.fetchMyManagedDomains()
    const managed = domainsStore.myManagedDomains.find((d: EventDomain) => d.slug === slug.value)
    if (managed) {
      domain.value = managed
      initForms(managed)
    } else if (auth.isAdmin) {
      // Global admin: fetch from the full domain list
      await domainsStore.fetchDomains()
      const fromAll = domainsStore.getDomainBySlug(slug.value)
      if (fromAll) {
        domain.value = fromAll
        initForms(fromAll)
      } else {
        domain.value = null
      }
    } else {
      domain.value = null
    }
    if (domain.value) {
      await loadFeaturedEvents()
      await loadAvailableEvents()
      await loadScheduledFeaturedEvents()
    }
  } catch {
    error.value = t('hubManage.errorLoad')
  } finally {
    loading.value = false
  }
}

async function loadFeaturedEvents() {
  if (!domain.value) return
  featuredLoading.value = true
  try {
    const data = await gqlRequest<{ featuredEventsForDomain: CatalogEvent[] }>(
      `query FeaturedEventsForDomain($domainSlug: String!) {
        featuredEventsForDomain(domainSlug: $domainSlug) {
          id name slug status startsAtUtc
        }
      }`,
      { domainSlug: domain.value.slug },
    )
    featuredEvents.value = data.featuredEventsForDomain
  } catch {
    featuredEvents.value = []
  } finally {
    featuredLoading.value = false
  }
}

async function loadAvailableEvents() {
  if (!domain.value) return
  try {
    const data = await gqlRequest<{ events: CatalogEvent[] }>(
      `query HubAvailableEvents($filter: EventFilterInput) {
        events(filter: $filter) { id name slug status startsAtUtc domain { id } }
      }`,
      { filter: { domainSlug: domain.value.slug, status: 'PUBLISHED' } },
    )
    availableEvents.value = data.events
  } catch {
    availableEvents.value = []
  }
}

async function loadScheduledFeaturedEvents() {
  if (!domain.value) return
  schedulesLoading.value = true
  schedulesError.value = ''
  try {
    schedules.value = await domainsStore.fetchScheduledFeaturedEvents(domain.value.id)
  } catch {
    schedulesError.value = t('hubManage.schedules.loadError')
    schedules.value = []
  } finally {
    schedulesLoading.value = false
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function newScheduleFormError(): string {
  const key = validateScheduleInput(
    newScheduleForm.value.eventId,
    newScheduleForm.value.startsAtUtc,
    newScheduleForm.value.endsAtUtc,
  )
  return key ? t(key) : ''
}

async function handleCreateSchedule() {
  newScheduleError.value = newScheduleFormError()
  if (newScheduleError.value) return
  newScheduleSuccess.value = false
  schedulesSaving.value = true
  try {
    const created = await domainsStore.scheduleFeaturedEvent(
      domain.value!.id,
      newScheduleForm.value.eventId,
      fromDatetimeLocalValue(newScheduleForm.value.startsAtUtc),
      fromDatetimeLocalValue(newScheduleForm.value.endsAtUtc),
      newScheduleForm.value.priority,
      newScheduleForm.value.isEnabled,
      newScheduleForm.value.displayLabel.trim() || null,
    )
    schedules.value = [...schedules.value, created].sort(
      (a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    )
    newScheduleForm.value = {
      eventId: '',
      startsAtUtc: '',
      endsAtUtc: '',
      priority: 0,
      isEnabled: true,
      displayLabel: '',
    }
    newScheduleSuccess.value = true
  } catch (err) {
    newScheduleError.value =
      err instanceof Error ? err.message : t('hubManage.schedules.saveError')
  } finally {
    schedulesSaving.value = false
  }
}

function startEditSchedule(s: ScheduledFeaturedEvent) {
  editingScheduleId.value = s.id
  editScheduleForm.value = {
    startsAtUtc: toDatetimeLocalValue(s.startsAtUtc),
    endsAtUtc: toDatetimeLocalValue(s.endsAtUtc),
    priority: s.priority,
    isEnabled: s.isEnabled,
    displayLabel: s.displayLabel ?? '',
  }
  editScheduleError.value = ''
}

function cancelEditSchedule() {
  editingScheduleId.value = null
  editScheduleError.value = ''
}

async function handleUpdateSchedule(scheduleId: string) {
  const dateError = validateScheduleDates(
    editScheduleForm.value.startsAtUtc,
    editScheduleForm.value.endsAtUtc,
  )
  if (dateError) {
    editScheduleError.value = t(dateError)
    return
  }
  editScheduleError.value = ''
  const starts = fromDatetimeLocalValue(editScheduleForm.value.startsAtUtc)
  const ends = fromDatetimeLocalValue(editScheduleForm.value.endsAtUtc)
  schedulesSaving.value = true
  try {
    const updated = await domainsStore.updateScheduledFeaturedEvent(
      scheduleId,
      starts,
      ends,
      editScheduleForm.value.priority,
      editScheduleForm.value.isEnabled,
      editScheduleForm.value.displayLabel.trim() || null,
    )
    schedules.value = schedules.value
      .map((s) => (s.id === scheduleId ? updated : s))
      .sort((a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime())
    editingScheduleId.value = null
  } catch (err) {
    editScheduleError.value =
      err instanceof Error ? err.message : t('hubManage.schedules.saveError')
  } finally {
    schedulesSaving.value = false
  }
}

async function handleRemoveSchedule(scheduleId: string) {
  schedulesSaving.value = true
  try {
    await domainsStore.removeScheduledFeaturedEvent(scheduleId)
    schedules.value = schedules.value.filter((s) => s.id !== scheduleId)
    if (editingScheduleId.value === scheduleId) editingScheduleId.value = null
  } catch {
    schedulesError.value = t('hubManage.schedules.saveError')
  } finally {
    schedulesSaving.value = false
  }
}

async function handleSaveStyle() {
  styleError.value = ''
  styleSuccess.value = false
  const colorErr = { primaryColor: '', accentColor: '' }
  if (!isValidHexColor(styleForm.value.primaryColor))
    colorErr.primaryColor = t('dashboard.hubColorError')
  if (!isValidHexColor(styleForm.value.accentColor))
    colorErr.accentColor = t('dashboard.hubColorError')
  colorErrors.value = colorErr
  if (colorErr.primaryColor || colorErr.accentColor) return
  styleSaving.value = true
  try {
    const updated = await domainsStore.updateDomainStyle({
      domainId: domain.value!.id,
      primaryColor: styleForm.value.primaryColor || null,
      accentColor: styleForm.value.accentColor || null,
      logoUrl: styleForm.value.logoUrl || null,
      bannerUrl: styleForm.value.bannerUrl || null,
    })
    domain.value = updated
    styleSuccess.value = true
  } catch {
    styleError.value = t('dashboard.hubManageError')
  } finally {
    styleSaving.value = false
  }
}

async function handleSaveOverview() {
  overviewError.value = ''
  overviewSuccess.value = false
  overviewSaving.value = true
  try {
    const updated = await domainsStore.updateDomainOverview({
      domainId: domain.value!.id,
      tagline: overviewForm.value.tagline || null,
      overviewContent: overviewForm.value.overviewContent || null,
      whatBelongsHere: overviewForm.value.whatBelongsHere || null,
      submitEventCta: overviewForm.value.submitEventCta || null,
      curatorCredit: overviewForm.value.curatorCredit || null,
    })
    domain.value = updated
    overviewSuccess.value = true
  } catch {
    overviewError.value = t('dashboard.hubManageError')
  } finally {
    overviewSaving.value = false
  }
}

function handleAddLink() {
  const title = newLinkForm.value.title.trim()
  const url = newLinkForm.value.url.trim()
  if (!title || !url || communityLinks.value.length >= MAX_COMMUNITY_LINKS) return
  communityLinks.value = [...communityLinks.value, { title, url }]
  newLinkForm.value = { title: '', url: '' }
  linksSuccess.value = false
}

function handleRemoveLink(index: number) {
  communityLinks.value = communityLinks.value.filter((_: { title: string; url: string }, i: number) => i !== index)
  linksSuccess.value = false
}

async function handleSaveLinks() {
  linksError.value = ''
  linksSuccess.value = false
  linksSaving.value = true
  try {
    await domainsStore.setDomainLinks(domain.value!.id, communityLinks.value)
    linksSuccess.value = true
  } catch {
    linksError.value = t('hubManage.saveError')
  } finally {
    linksSaving.value = false
  }
}

function handleAddFeaturedEvent() {
  if (!addFeaturedEventId.value) return
  if (featuredEvents.value.length >= MAX_FEATURED_EVENTS) return
  if (featuredEvents.value.some((e: CatalogEvent) => e.id === addFeaturedEventId.value)) {
    addFeaturedEventId.value = ''
    return
  }
  const ev = availableEvents.value.find((e: CatalogEvent) => e.id === addFeaturedEventId.value)
  if (ev) {
    featuredEvents.value = [...featuredEvents.value, ev]
    addFeaturedEventId.value = ''
    featuredSuccess.value = false
  }
}

function handleRemoveFeaturedEvent(eventId: string) {
  featuredEvents.value = featuredEvents.value.filter((e: CatalogEvent) => e.id !== eventId)
  featuredSuccess.value = false
}

async function handleSaveFeaturedEvents() {
  featuredError.value = ''
  featuredSuccess.value = false
  featuredSaving.value = true
  try {
    await domainsStore.setDomainFeaturedEvents(
      domain.value!.id,
      featuredEvents.value.map((e: CatalogEvent) => e.id),
    )
    featuredSuccess.value = true
  } catch {
    featuredError.value = t('dashboard.hubFeaturedEventsError')
  } finally {
    featuredSaving.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const isAuthorized = computed(
  () =>
    auth.isAuthenticated &&
    (auth.isAdmin ||
      domainsStore.myManagedDomains.some((d: EventDomain) => d.slug === slug.value)),
)

const pageTitle = computed(() =>
  domain.value ? t('hubManage.pageTitle', { name: domain.value.name }) : t('hubManage.pageTitleDefault'),
)

watch(pageTitle, (title: string) => {
  if (typeof document !== 'undefined') document.title = title
}, { immediate: true })

onMounted(loadDomain)
watch(slug, loadDomain)
// Re-load when auth state resolves (checkAuth completes after a page reload)
watch(
  () => auth.isAuthenticated,
  (isAuth) => {
    if (isAuth && !domain.value && !loading.value) loadDomain()
  },
  { immediate: true },
)

/** Published events from this domain not already featured — drives the add-featured picker */
const pickableEvents = computed(() =>
  availableEvents.value.filter(
    (e: CatalogEvent) => !featuredEvents.value.some((f: CatalogEvent) => f.id === e.id),
  ),
)
</script>

<template>
  <div class="hub-manage-view container">
    <!-- Sign-in gate -->
    <div v-if="!auth.isAuthenticated" class="card login-prompt">
      <div class="prompt-icon" aria-hidden="true">🔐</div>
      <h2>{{ t('hubManage.signInRequired') }}</h2>
      <p>{{ t('hubManage.signInDescription') }}</p>
      <RouterLink to="/login" class="btn btn-primary">{{ t('dashboard.logIn') }}</RouterLink>
    </div>

    <template v-else>
      <!-- Loading state -->
      <div v-if="loading" class="hub-loading" aria-live="polite">
        <div class="loading-spinner" aria-hidden="true"></div>
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="card error-state" role="alert">
        <div class="state-icon" aria-hidden="true">⚠️</div>
        <h2>{{ t('hubManage.errorLoad') }}</h2>
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="loadDomain">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Unauthorized state -->
      <div v-else-if="!isAuthorized || !domain" class="card unauthorized-state">
        <div class="state-icon" aria-hidden="true">🔒</div>
        <h2>{{ t('hubManage.unauthorized') }}</h2>
        <p>{{ t('hubManage.unauthorizedDescription', { slug }) }}</p>
        <RouterLink to="/dashboard" class="btn btn-primary">{{ t('hubManage.backToDashboard') }}</RouterLink>
      </div>

      <!-- Hub management form -->
      <template v-else>
        <!-- Page header -->
        <div class="hub-manage-header">
          <nav class="hub-breadcrumb" aria-label="Breadcrumb">
            <RouterLink to="/dashboard" class="breadcrumb-link">{{ t('nav.dashboard') }}</RouterLink>
            <span class="breadcrumb-sep" aria-hidden="true">/</span>
            <RouterLink :to="`/category/${domain.slug}`" class="breadcrumb-link">
              {{ domain.name }}
            </RouterLink>
            <span class="breadcrumb-sep" aria-hidden="true">/</span>
            <span class="breadcrumb-current">{{ t('hubManage.manageLabel') }}</span>
          </nav>
          <div class="hub-manage-title-row">
            <div class="hub-manage-identity">
              <img
                v-if="domain.logoUrl"
                :src="domain.logoUrl"
                :alt="domain.name"
                class="hub-manage-logo"
              />
              <div>
                <h1 class="hub-manage-title">{{ t('hubManage.heading', { name: domain.name }) }}</h1>
                <p v-if="domain.description" class="hub-manage-subtitle">{{ domain.description }}</p>
              </div>
            </div>
            <RouterLink
              :to="`/category/${domain.slug}`"
              class="btn btn-outline"
              target="_blank"
              rel="noopener"
            >
              {{ t('dashboard.hubViewHub') }}
            </RouterLink>
          </div>
        </div>

        <!-- ── Style & Branding ──────────────────────────────────── -->
        <section class="manage-section card" aria-labelledby="style-heading">
          <h2 id="style-heading" class="manage-section-title">{{ t('dashboard.hubStyleTitle') }}</h2>

          <p v-if="styleError" class="manage-error" role="alert">{{ styleError }}</p>

          <form class="hub-style-form" @submit.prevent="handleSaveStyle">
            <div class="hub-form-grid">
              <label class="form-field">
                <span>{{ t('dashboard.hubPrimaryColor') }}</span>
                <input
                  v-model="styleForm.primaryColor"
                  class="form-input"
                  :class="{ 'input-error': colorErrors.primaryColor }"
                  type="text"
                  placeholder="#137fec"
                />
                <span v-if="colorErrors.primaryColor" class="field-error" role="alert">
                  {{ colorErrors.primaryColor }}
                </span>
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubAccentColor') }}</span>
                <input
                  v-model="styleForm.accentColor"
                  class="form-input"
                  :class="{ 'input-error': colorErrors.accentColor }"
                  type="text"
                  placeholder="#ff5500"
                />
                <span v-if="colorErrors.accentColor" class="field-error" role="alert">
                  {{ colorErrors.accentColor }}
                </span>
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubLogoUrl') }}</span>
                <input
                  v-model="styleForm.logoUrl"
                  class="form-input"
                  type="url"
                  placeholder="https://example.com/logo.png"
                />
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubBannerUrl') }}</span>
                <input
                  v-model="styleForm.bannerUrl"
                  class="form-input"
                  type="url"
                  placeholder="https://example.com/banner.jpg"
                />
              </label>
            </div>
            <div class="hub-form-actions">
              <button type="submit" class="btn btn-primary" :disabled="styleSaving">
                {{ styleSaving ? t('dashboard.hubSaving') : t('dashboard.hubSaveStyle') }}
              </button>
              <span v-if="styleSuccess" class="hub-save-success">{{ t('dashboard.hubSaved') }}</span>
            </div>
          </form>
        </section>

        <!-- ── Hub Content ──────────────────────────────────────────── -->
        <section class="manage-section card" aria-labelledby="overview-heading">
          <h2 id="overview-heading" class="manage-section-title">{{ t('dashboard.hubOverviewTitle') }}</h2>

          <p v-if="overviewError" class="manage-error" role="alert">{{ overviewError }}</p>

          <form class="hub-overview-form" @submit.prevent="handleSaveOverview">
            <div class="hub-form-grid hub-form-grid--full">
              <label class="form-field">
                <span>{{ t('dashboard.hubTagline') }}</span>
                <input
                  v-model="overviewForm.tagline"
                  class="form-input"
                  type="text"
                  maxlength="150"
                  :placeholder="t('admin.domainTaglinePlaceholder')"
                />
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubOverviewContent') }}</span>
                <textarea
                  v-model="overviewForm.overviewContent"
                  class="form-input form-textarea"
                  rows="4"
                  maxlength="2000"
                  :placeholder="t('hubManage.overviewPlaceholder')"
                ></textarea>
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubWhatBelongsHere') }}</span>
                <textarea
                  v-model="overviewForm.whatBelongsHere"
                  class="form-input form-textarea"
                  rows="3"
                  maxlength="1000"
                  :placeholder="t('hubManage.whatBelongsHerePlaceholder')"
                ></textarea>
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubSubmitEventCta') }}</span>
                <input
                  v-model="overviewForm.submitEventCta"
                  class="form-input"
                  type="text"
                  maxlength="300"
                  :placeholder="t('hubManage.ctaPlaceholder')"
                />
              </label>
              <label class="form-field">
                <span>{{ t('dashboard.hubCuratorCredit') }}</span>
                <input
                  v-model="overviewForm.curatorCredit"
                  class="form-input"
                  type="text"
                  maxlength="200"
                  :placeholder="t('hubManage.curatorCreditPlaceholder')"
                />
              </label>
            </div>
            <div class="hub-form-actions">
              <button type="submit" class="btn btn-primary" :disabled="overviewSaving">
                {{ overviewSaving ? t('dashboard.hubSaving') : t('dashboard.hubSaveOverview') }}
              </button>
              <span v-if="overviewSuccess" class="hub-save-success">{{ t('dashboard.hubSaved') }}</span>
            </div>
          </form>
        </section>

        <!-- ── Featured Events ──────────────────────────────────────── -->
        <section class="manage-section card" aria-labelledby="featured-heading">
          <h2 id="featured-heading" class="manage-section-title">{{ t('dashboard.hubFeaturedEventsTitle') }}</h2>
          <p class="manage-section-hint">{{ t('dashboard.hubFeaturedEventsHint') }}</p>

          <div v-if="featuredLoading" class="hub-featured-loading text-secondary">
            {{ t('common.loading') }}
          </div>
          <template v-else>
            <ul class="hub-featured-events-list" aria-label="Featured events">
              <li
                v-for="event in featuredEvents"
                :key="event.id"
                class="hub-featured-event-item"
              >
                <div class="hub-featured-event-info">
                  <span class="hub-featured-event-name">{{ event.name }}</span>
                  <span v-if="event.startsAtUtc" class="hub-featured-event-date text-secondary">
                    {{ formatDate(event.startsAtUtc) }}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  @click="handleRemoveFeaturedEvent(event.id)"
                >
                  {{ t('dashboard.hubFeaturedEventsRemove') }}
                </button>
              </li>
              <li v-if="!featuredEvents.length" class="hub-featured-empty text-secondary">
                {{ t('dashboard.hubFeaturedEventsEmpty') }}
              </li>
            </ul>

            <div v-if="featuredEvents.length < MAX_FEATURED_EVENTS" class="hub-add-featured-form">
              <select
                v-model="addFeaturedEventId"
                class="form-input hub-featured-select"
                :aria-label="t('dashboard.hubFeaturedEventsSelectPlaceholder')"
              >
                <option value="">{{ t('dashboard.hubFeaturedEventsSelectPlaceholder') }}</option>
                <option
                  v-for="ev in pickableEvents"
                  :key="ev.id"
                  :value="ev.id"
                >
                  {{ ev.name }}
                </option>
              </select>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="!addFeaturedEventId"
                @click="handleAddFeaturedEvent"
              >
                {{ t('dashboard.hubFeaturedEventsAdd') }}
              </button>
            </div>

            <p v-if="featuredError" class="hub-featured-error field-error" role="alert">
              {{ featuredError }}
            </p>

            <div class="hub-form-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="featuredSaving"
                @click="handleSaveFeaturedEvents"
              >
                {{ featuredSaving ? t('dashboard.hubFeaturedEventsSaving') : t('dashboard.hubFeaturedEventsSave') }}
              </button>
              <span v-if="featuredSuccess" class="hub-save-success">
                {{ t('dashboard.hubFeaturedEventsSaved') }}
              </span>
            </div>
          </template>
        </section>

        <!-- ── Scheduled Featured Events ───────────────────────────── -->
        <section class="manage-section card" aria-labelledby="schedules-heading">
          <h2 id="schedules-heading" class="manage-section-title">
            {{ t('hubManage.schedules.title') }}
          </h2>
          <p class="manage-section-hint">{{ t('hubManage.schedules.hint') }}</p>

          <div v-if="schedulesLoading" class="hub-featured-loading text-secondary">
            {{ t('common.loading') }}
          </div>
          <template v-else>
            <p v-if="schedulesError" class="manage-error" role="alert">{{ schedulesError }}</p>

            <!-- Schedule list -->
            <ul class="hub-schedule-list" aria-label="Scheduled featured events">
              <li
                v-for="s in schedules"
                :key="s.id"
                class="hub-schedule-item"
                :class="`hub-schedule-item--${scheduleStatus(s)}`"
              >
                <template v-if="editingScheduleId === s.id">
                  <!-- Inline edit form -->
                  <div class="hub-schedule-edit-form">
                    <div class="hub-form-grid">
                      <label class="form-field">
                        <span>{{ t('hubManage.schedules.startsAt') }}</span>
                        <input
                          v-model="editScheduleForm.startsAtUtc"
                          class="form-input"
                          type="datetime-local"
                        />
                      </label>
                      <label class="form-field">
                        <span>{{ t('hubManage.schedules.endsAt') }}</span>
                        <input
                          v-model="editScheduleForm.endsAtUtc"
                          class="form-input"
                          type="datetime-local"
                        />
                      </label>
                      <label class="form-field">
                        <span>{{ t('hubManage.schedules.priority') }}</span>
                        <input
                          v-model.number="editScheduleForm.priority"
                          class="form-input"
                          type="number"
                          min="0"
                        />
                      </label>
                      <label class="form-field">
                        <span>{{ t('hubManage.schedules.displayLabel') }}</span>
                        <input
                          v-model="editScheduleForm.displayLabel"
                          class="form-input"
                          type="text"
                          maxlength="200"
                          :placeholder="t('hubManage.schedules.displayLabelPlaceholder')"
                        />
                      </label>
                    </div>
                    <label class="hub-schedule-toggle form-field">
                      <input
                        v-model="editScheduleForm.isEnabled"
                        class="hub-schedule-toggle-input"
                        type="checkbox"
                      />
                      <span>{{ t('hubManage.schedules.enableEntry') }}</span>
                    </label>
                    <p v-if="editScheduleError" class="field-error" role="alert">
                      {{ editScheduleError }}
                    </p>
                    <div class="hub-form-actions">
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        :disabled="schedulesSaving"
                        @click="handleUpdateSchedule(s.id)"
                      >
                        {{ t('hubManage.schedules.save') }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline btn-sm"
                        @click="cancelEditSchedule"
                      >
                        {{ t('common.cancel') }}
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="hub-schedule-info">
                    <span class="hub-schedule-event-name">{{ s.event?.name ?? s.eventId }}</span>
                    <span v-if="s.displayLabel" class="hub-schedule-label text-secondary">
                      {{ s.displayLabel }}
                    </span>
                    <span class="hub-schedule-meta text-secondary">
                      {{ formatDateTime(s.startsAtUtc) }} → {{ formatDateTime(s.endsAtUtc) }}
                    </span>
                    <span
                      class="hub-schedule-status-badge"
                      :class="`hub-schedule-status-badge--${scheduleStatus(s)}`"
                    >
                      {{ t(`hubManage.schedules.status.${scheduleStatus(s)}`) }}
                    </span>
                    <span v-if="!s.isEnabled" class="hub-schedule-disabled-badge">
                      {{ t('hubManage.schedules.disabled') }}
                    </span>
                    <span v-if="s.priority > 0" class="hub-schedule-priority text-secondary">
                      {{ t('hubManage.schedules.priorityLabel', { n: s.priority }) }}
                    </span>
                  </div>
                  <div class="hub-schedule-actions">
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      @click="startEditSchedule(s)"
                    >
                      {{ t('hubManage.schedules.edit') }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm btn-danger"
                      :disabled="schedulesSaving"
                      @click="handleRemoveSchedule(s.id)"
                    >
                      {{ t('hubManage.schedules.remove') }}
                    </button>
                  </div>
                </template>
              </li>
              <li v-if="!schedules.length" class="hub-featured-empty text-secondary">
                {{ t('hubManage.schedules.empty') }}
              </li>
            </ul>

            <!-- Create new schedule form -->
            <details class="hub-schedule-create-details">
              <summary class="hub-schedule-create-summary">
                {{ t('hubManage.schedules.addNew') }}
              </summary>
              <div class="hub-schedule-create-form">
                <div class="hub-form-grid">
                  <label class="form-field">
                    <span>{{ t('hubManage.schedules.event') }}</span>
                    <select v-model="newScheduleForm.eventId" class="form-input">
                      <option value="">{{ t('hubManage.schedules.selectEvent') }}</option>
                      <option
                        v-for="ev in availableEvents"
                        :key="ev.id"
                        :value="ev.id"
                      >
                        {{ ev.name }}
                      </option>
                    </select>
                  </label>
                  <label class="form-field">
                    <span>{{ t('hubManage.schedules.startsAt') }}</span>
                    <input
                      v-model="newScheduleForm.startsAtUtc"
                      class="form-input"
                      type="datetime-local"
                    />
                  </label>
                  <label class="form-field">
                    <span>{{ t('hubManage.schedules.endsAt') }}</span>
                    <input
                      v-model="newScheduleForm.endsAtUtc"
                      class="form-input"
                      type="datetime-local"
                    />
                  </label>
                  <label class="form-field">
                    <span>{{ t('hubManage.schedules.priority') }}</span>
                    <input
                      v-model.number="newScheduleForm.priority"
                      class="form-input"
                      type="number"
                      min="0"
                    />
                  </label>
                  <label class="form-field">
                    <span>{{ t('hubManage.schedules.displayLabel') }}</span>
                    <input
                      v-model="newScheduleForm.displayLabel"
                      class="form-input"
                      type="text"
                      maxlength="200"
                      :placeholder="t('hubManage.schedules.displayLabelPlaceholder')"
                    />
                  </label>
                </div>
                <label class="hub-schedule-toggle form-field">
                  <input
                    v-model="newScheduleForm.isEnabled"
                    class="hub-schedule-toggle-input"
                    type="checkbox"
                  />
                  <span>{{ t('hubManage.schedules.enableEntry') }}</span>
                </label>
                <p v-if="newScheduleError" class="field-error" role="alert">
                  {{ newScheduleError }}
                </p>
                <div class="hub-form-actions">
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="schedulesSaving"
                    @click="handleCreateSchedule"
                  >
                    {{ schedulesSaving ? t('common.saving') : t('hubManage.schedules.create') }}
                  </button>
                  <span v-if="newScheduleSuccess" class="hub-save-success">
                    {{ t('hubManage.schedules.created') }}
                  </span>
                </div>
              </div>
            </details>
          </template>
        </section>

        <!-- ── Community Links ─────────────────────────────────────── -->
        <section class="manage-section card" aria-labelledby="links-heading">
          <h2 id="links-heading" class="manage-section-title">{{ t('admin.communityLinks') }}</h2>
          <p class="manage-section-hint">{{ t('admin.communityLinksHint') }}</p>

          <p v-if="linksError" class="manage-error" role="alert">{{ linksError }}</p>

          <div class="hub-community-links-list">
            <div
              v-for="(link, index) in communityLinks"
              :key="`link-${index}`"
              class="hub-community-link-item"
            >
              <span class="hub-community-link-order">{{ (index as number) + 1 }}</span>
              <div class="hub-community-link-info">
                <strong>{{ link.title }}</strong>
                <span class="text-secondary hub-community-link-url">{{ link.url }}</span>
              </div>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                @click="handleRemoveLink(index)"
              >
                {{ t('admin.removeCommunityLink') }}
              </button>
            </div>
            <p v-if="!communityLinks.length" class="text-secondary hub-community-links-empty">
              {{ t('admin.communityLinksEmpty') }}
            </p>
          </div>

          <div
            v-if="communityLinks.length < MAX_COMMUNITY_LINKS"
            class="hub-add-community-link-form"
          >
            <label class="form-field">
              <span>{{ t('admin.communityLinksLinkTitle') }}</span>
              <input
                v-model="newLinkForm.title"
                class="form-input"
                type="text"
                maxlength="100"
              />
            </label>
            <label class="form-field">
              <span>{{ t('admin.communityLinksLinkUrl') }}</span>
              <input
                v-model="newLinkForm.url"
                class="form-input"
                type="url"
              />
            </label>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="!newLinkForm.title.trim() || !newLinkForm.url.trim()"
              @click="handleAddLink"
            >
              {{ t('admin.addCommunityLink') }}
            </button>
          </div>

          <div class="hub-form-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="linksSaving"
              @click="handleSaveLinks"
            >
              {{ linksSaving ? t('admin.communityLinksSaving') : t('admin.saveCommunityLinks') }}
            </button>
            <span v-if="linksSuccess" class="hub-save-success">
              {{ t('admin.communityLinksSaved') }}
            </span>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.hub-manage-view {
  padding-top: 2rem;
  padding-bottom: 3rem;
  max-width: 860px;
}

/* ── Header ── */
.hub-manage-header {
  margin-bottom: 2rem;
}

.hub-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}

.breadcrumb-link {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.breadcrumb-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.breadcrumb-sep {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.3));
}

.breadcrumb-current {
  color: var(--color-text-primary);
}

.hub-manage-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hub-manage-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.hub-manage-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.hub-manage-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.25rem;
}

.hub-manage-subtitle {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

/* ── Sections ── */
.manage-section {
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.manage-section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 1.25rem;
}

.manage-section-hint {
  margin: -0.75rem 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

/* ── Form helpers (shared with DashboardView) ── */
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

.manage-error {
  color: var(--color-danger, #f87171);
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: 1rem;
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

/* ── Featured events ── */
.hub-featured-events-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hub-featured-event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-secondary, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.hub-featured-event-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.hub-featured-event-name {
  font-size: 0.875rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-featured-event-date {
  font-size: 0.75rem;
}

.hub-featured-empty {
  font-size: 0.875rem;
  padding: 0.5rem 0;
  list-style: none;
}

.hub-featured-loading {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.hub-featured-error {
  margin-bottom: 0.5rem;
}

.hub-add-featured-form {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.hub-featured-select {
  flex: 1;
  min-width: 180px;
}

/* ── Community links ── */
.hub-community-links-list {
  margin-bottom: 0.75rem;
}

.hub-community-link-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.hub-community-link-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: rgba(19, 127, 236, 0.15);
  color: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.hub-community-link-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.hub-community-link-url,
.hub-community-links-empty {
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-community-links-empty {
  padding: 0.5rem 0;
}

.hub-add-community-link-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 0.75rem;
}

/* ── States ── */
.hub-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 0;
  color: var(--color-text-secondary);
}

.login-prompt,
.error-state,
.unauthorized-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 2rem;
  margin-top: 2rem;
}

.state-icon,
.prompt-icon {
  font-size: 2rem;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .hub-manage-title-row {
    flex-direction: column;
  }

  .hub-form-grid {
    grid-template-columns: 1fr;
  }

  .hub-add-community-link-form {
    grid-template-columns: 1fr;
  }
}

/* ── Scheduled featured events ── */
.hub-schedule-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hub-schedule-item {
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  background: var(--color-surface-secondary, rgba(255, 255, 255, 0.04));
  padding: 0.75rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hub-schedule-item--active {
  border-color: rgba(74, 222, 128, 0.4);
}

.hub-schedule-item--expired {
  opacity: 0.6;
}

.hub-schedule-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}

.hub-schedule-event-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.hub-schedule-meta {
  font-size: 0.75rem;
}

.hub-schedule-priority {
  font-size: 0.75rem;
}

.hub-schedule-status-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.4rem;
  border-radius: 999px;
  background: var(--color-border, rgba(255, 255, 255, 0.1));
  width: fit-content;
}

.hub-schedule-status-badge--active {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.hub-schedule-status-badge--upcoming {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
}

.hub-schedule-status-badge--expired {
  background: rgba(148, 163, 184, 0.12);
  color: var(--color-text-secondary);
}

.hub-schedule-disabled-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.4rem;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.12);
  color: var(--color-danger, #f87171);
  width: fit-content;
}

.hub-schedule-label {
  font-size: 0.8rem;
  font-style: italic;
}

.hub-schedule-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.hub-schedule-toggle-input {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.hub-schedule-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.hub-schedule-edit-form {
  width: 100%;
}

.hub-schedule-create-details {
  margin-top: 0.5rem;
}

.hub-schedule-create-summary {
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary, #137fec);
  padding: 0.375rem 0;
  user-select: none;
}

.hub-schedule-create-form {
  padding-top: 0.75rem;
}

.btn-danger {
  color: var(--color-danger, #f87171);
  border-color: rgba(248, 113, 113, 0.3);
}

.btn-danger:hover {
  background: rgba(248, 113, 113, 0.08);
}
</style>
