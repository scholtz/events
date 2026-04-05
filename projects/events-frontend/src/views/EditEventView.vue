<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'
import { gqlRequest } from '@/lib/graphql'
import { computeEventReadiness, lifecycleStatusKey, lifecycleStatusVariant } from '@/composables/useEventReadiness'
import type { CatalogEvent } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()

const eventId = route.params.id as string

// ── Step management ────────────────────────────────────────────────────────
const TOTAL_STEPS = 5
const currentStep = ref(1)

// ── Loading state ──────────────────────────────────────────────────────────
const loadingEvent = ref(true)
const loadError = ref('')
const originalEvent = ref<CatalogEvent | null>(null)

// ── Form state ─────────────────────────────────────────────────────────────
const form = reactive({
  name: '',
  description: '',
  domainSlug: '',
  additionalTagSlugs: [] as string[],
  countryCode: 'CZ',
  attendanceMode: 'IN_PERSON',
  startsAtUtc: '',
  endsAtUtc: '',
  timezone: '',
  isFree: true,
  priceAmount: '',
  currencyCode: 'EUR',
  venueName: '',
  addressLine1: '',
  city: '',
  latitude: '',
  longitude: '',
  eventUrl: '',
})

// ── UI state ───────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitted = ref(false)
const submissionError = ref('')

// ── Per-step validation errors ─────────────────────────────────────────────
const errors = reactive<Record<string, string>>({})

function clearErrors() {
  Object.keys(errors).forEach((k) => delete errors[k])
}

// ── Validation helpers ─────────────────────────────────────────────────────
function validateTimezone(tz: string): boolean {
  if (!tz) return true
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function validateStep(step: number): boolean {
  clearErrors()
  if (step === 1) {
    if (!form.name.trim()) errors.name = t('submitEvent.validationRequired', { field: t('submitEvent.eventTitle') })
    if (!form.description.trim()) errors.description = t('submitEvent.validationRequired', { field: t('submitEvent.description') })
    if (!form.domainSlug) errors.domainSlug = t('submitEvent.validationRequired', { field: t('filters.domain') })
    return !errors.name && !errors.description && !errors.domainSlug
  }
  if (step === 2) {
    if (!form.startsAtUtc) errors.startsAtUtc = t('submitEvent.validationRequired', { field: t('submitEvent.startDate') })
    const tzTrimmed = form.timezone.trim()
    if (tzTrimmed && !validateTimezone(tzTrimmed)) {
      errors.timezone = t('submitEvent.validationTimezone', { tz: tzTrimmed })
    }
    return !errors.startsAtUtc && !errors.timezone
  }
  if (step === 3) {
    if (!form.isFree) {
      const parsedPrice = Number.parseFloat(form.priceAmount)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errors.priceAmount = t('submitEvent.validationPrice')
      }
    }
    return !errors.priceAmount
  }
  if (step === 4) {
    return true
  }
  if (step === 5) {
    if (!form.eventUrl.trim()) {
      errors.eventUrl = t('submitEvent.validationRequired', { field: t('submitEvent.websiteUrl') })
    } else {
      try {
        new URL(form.eventUrl)
      } catch {
        errors.eventUrl = t('submitEvent.validationUrl')
      }
    }
    return !errors.eventUrl
  }
  return true
}

// ── Step navigation ────────────────────────────────────────────────────────
function nextStep() {
  if (!validateStep(currentStep.value)) return
  if (currentStep.value < TOTAL_STEPS) {
    currentStep.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    clearErrors()
    currentStep.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function goToStep(step: number) {
  if (step < currentStep.value) {
    clearErrors()
    currentStep.value = step
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// ── Computed helpers ──────────────────────────────────────────────────────
const stepTitle = computed(() => {
  switch (currentStep.value) {
    case 1: return t('submitEvent.basicInfo')
    case 2: return t('submitEvent.dateTime')
    case 3: return t('submitEvent.pricing')
    case 4: return t('submitEvent.locationSection')
    case 5: return t('submitEvent.eventLinkSection')
    default: return ''
  }
})

const parsedPrice = computed(() => Number.parseFloat(form.priceAmount))

// ── Submission readiness ───────────────────────────────────────────────────
const readiness = computed(() =>
  computeEventReadiness({
    name: form.name,
    description: form.description,
    domainSlug: form.domainSlug,
    startsAtUtc: form.startsAtUtc,
    eventUrl: form.eventUrl,
    timezone: form.timezone,
    attendanceMode: form.attendanceMode,
    venueName: form.venueName,
    city: form.city,
    isFree: form.isFree,
    priceAmount: form.priceAmount,
  }),
)

// ── Lifecycle helpers ──────────────────────────────────────────────────────
const eventStatus = computed(() => originalEvent.value?.status ?? null)

const statusKey = computed(() =>
  eventStatus.value ? lifecycleStatusKey(eventStatus.value as Parameters<typeof lifecycleStatusKey>[0]) : null,
)

const statusVariant = computed(() =>
  eventStatus.value ? lifecycleStatusVariant(eventStatus.value as Parameters<typeof lifecycleStatusVariant>[0]) : null,
)

// Resubmit = save changes for a rejected event (same mutation, status resets to PendingApproval server-side)
const resubmitting = ref(false)
async function handleResubmit() {
  resubmitting.value = true
  submissionError.value = ''
  try {
    await eventsStore.updateMyEvent(eventId, {
      domainSlug: form.domainSlug,
      additionalTagSlugs: form.additionalTagSlugs.length > 0 ? form.additionalTagSlugs : undefined,
      name: form.name,
      description: form.description,
      eventUrl: form.eventUrl,
      venueName: form.venueName,
      addressLine1: form.addressLine1,
      city: form.city,
      countryCode: form.countryCode || 'CZ',
      isFree: form.isFree,
      priceAmount: form.isFree ? 0 : parsedPrice.value,
      currencyCode: form.currencyCode || 'EUR',
      latitude: parseFloat(form.latitude) || 0,
      longitude: parseFloat(form.longitude) || 0,
      startsAtUtc: new Date(form.startsAtUtc).toISOString(),
      endsAtUtc: form.endsAtUtc
        ? new Date(form.endsAtUtc).toISOString()
        : new Date(form.startsAtUtc).toISOString(),
      attendanceMode: form.attendanceMode as 'IN_PERSON' | 'ONLINE' | 'HYBRID',
      timezone: form.timezone.trim() || undefined,
    })
    submitted.value = true
    setTimeout(() => router.push('/dashboard'), 1500)
  } catch (error) {
    submissionError.value =
      error instanceof Error ? error.message : t('editEvent.saveError')
  } finally {
    resubmitting.value = false
  }
}

// ── Load event data ────────────────────────────────────────────────────────
const EVENT_FIELDS = `
  id name slug description eventUrl
  venueName addressLine1 city countryCode
  latitude longitude startsAtUtc endsAtUtc
  submittedAtUtc updatedAtUtc publishedAtUtc
  adminNotes status isFree priceAmount currencyCode domainId mapUrl
  attendanceMode timezone language
  domain { id name slug subdomain }
  submittedBy { displayName }
`

async function loadEvent() {
  loadingEvent.value = true
  loadError.value = ''
  try {
    // First try from the store cache
    let event = eventsStore.getEventById(eventId)
    if (!event) {
      // Fetch from API using the event ID via the myDashboard data or direct query
      const data = await gqlRequest<{ eventById: CatalogEvent | null }>(
        `query EventById($id: UUID!) {
          eventById(id: $id) { ${EVENT_FIELDS} }
        }`,
        { id: eventId },
      )
      event = data.eventById ?? undefined
    }
    if (!event) {
      loadError.value = t('editEvent.notFound')
      return
    }
    originalEvent.value = event
    // Pre-fill form
    form.name = event.name
    form.description = event.description
    form.domainSlug = event.domain?.slug ?? ''
    form.additionalTagSlugs = (event.eventTags ?? []).map((t) => t.domain.slug)
    form.countryCode = event.countryCode ?? 'CZ'
    form.attendanceMode = event.attendanceMode ?? 'IN_PERSON'
    // Convert ISO date to date input format (YYYY-MM-DD)
    form.startsAtUtc = event.startsAtUtc ? event.startsAtUtc.slice(0, 10) : ''
    form.endsAtUtc = event.endsAtUtc ? event.endsAtUtc.slice(0, 10) : ''
    form.timezone = event.timezone ?? ''
    form.isFree = event.isFree
    form.priceAmount = event.priceAmount != null && !event.isFree ? String(event.priceAmount) : ''
    form.currencyCode = event.currencyCode ?? 'EUR'
    form.venueName = event.venueName ?? ''
    form.addressLine1 = event.addressLine1 ?? ''
    form.city = event.city ?? ''
    form.latitude = event.latitude ? String(event.latitude) : ''
    form.longitude = event.longitude ? String(event.longitude) : ''
    form.eventUrl = event.eventUrl ?? ''
  } catch {
    loadError.value = t('editEvent.loadError')
  } finally {
    loadingEvent.value = false
  }
}

// ── Save changes ───────────────────────────────────────────────────────────
async function handleSave() {
  // Validate all steps before saving
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    if (!validateStep(s)) {
      currentStep.value = s
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
  }

  submitting.value = true
  submissionError.value = ''
  try {
    await eventsStore.updateMyEvent(eventId, {
      domainSlug: form.domainSlug,
      additionalTagSlugs: form.additionalTagSlugs.length > 0 ? form.additionalTagSlugs : undefined,
      name: form.name,
      description: form.description,
      eventUrl: form.eventUrl,
      venueName: form.venueName,
      addressLine1: form.addressLine1,
      city: form.city,
      countryCode: form.countryCode || 'CZ',
      isFree: form.isFree,
      priceAmount: form.isFree ? 0 : parsedPrice.value,
      currencyCode: form.currencyCode || 'EUR',
      latitude: parseFloat(form.latitude) || 0,
      longitude: parseFloat(form.longitude) || 0,
      startsAtUtc: new Date(form.startsAtUtc).toISOString(),
      endsAtUtc: form.endsAtUtc
        ? new Date(form.endsAtUtc).toISOString()
        : new Date(form.startsAtUtc).toISOString(),
      attendanceMode: form.attendanceMode as 'IN_PERSON' | 'ONLINE' | 'HYBRID',
      timezone: form.timezone.trim() || undefined,
    })
    submitted.value = true
    setTimeout(() => router.push('/dashboard'), 1500)
  } catch (error) {
    submissionError.value =
      error instanceof Error ? error.message : t('editEvent.saveError')
  } finally {
    submitting.value = false
  }
}

onMounted(loadEvent)
</script>

<template>
  <div class="edit-view">
    <div class="container">
      <!-- Header -->
      <div class="edit-header">
        <RouterLink to="/dashboard" class="back-link">{{ t('common.back') }}</RouterLink>
        <h1>{{ t('editEvent.title') }}</h1>
        <p class="edit-subtitle">{{ t('editEvent.subtitle') }}</p>
      </div>

      <!-- Loading state -->
      <div v-if="loadingEvent" class="card loading-state" role="status">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- Load error -->
      <div v-else-if="loadError" class="card error-state" role="alert">
        <div class="error-icon">⚠️</div>
        <p class="error-message">{{ loadError }}</p>
        <button class="btn btn-outline" @click="loadEvent">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Success state -->
      <div v-else-if="submitted" class="success-card card">
        <div class="success-icon">✅</div>
        <h2>{{ t('editEvent.successTitle') }}</h2>
        <p>{{ t('editEvent.successMessage') }}</p>
        <RouterLink to="/dashboard" class="btn btn-primary">{{ t('submitEvent.goToDashboard') }}</RouterLink>
      </div>

      <template v-else-if="!loadError">
        <!-- Lifecycle status card -->
        <div
          v-if="statusKey"
          class="lifecycle-card card"
          :class="statusVariant"
          role="region"
          :aria-label="t('lifecycle.panelTitle')"
        >
          <div class="lifecycle-header">
            <span class="lifecycle-badge" :class="statusVariant">{{ t(`lifecycle.${statusKey}`) }}</span>
          </div>
          <p class="lifecycle-explanation">{{ t(`lifecycle.${statusKey}Explanation`) }}</p>
          <p class="lifecycle-action">{{ t(`lifecycle.${statusKey}Action`) }}</p>

          <!-- Admin notes for rejected events -->
          <div
            v-if="eventStatus === 'REJECTED' && originalEvent?.adminNotes"
            class="lifecycle-admin-notes"
            role="note"
          >
            <strong>{{ t('dashboard.adminNotesFeedback') }}</strong>
            {{ originalEvent.adminNotes }}
          </div>
        </div>
        <!-- Progress indicator -->
        <div class="step-progress" role="navigation" :aria-label="t('submitEvent.stepProgress')">
          <div class="step-progress-bar">
            <div
              class="step-progress-fill"
              :style="{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }"
            ></div>
          </div>
          <div class="step-indicators">
            <button
              v-for="n in TOTAL_STEPS"
              :key="n"
              class="step-dot"
              :class="{
                'step-dot--active': n === currentStep,
                'step-dot--done': n < currentStep,
              }"
              :aria-label="`Step ${n}`"
              :aria-current="n === currentStep ? 'step' : undefined"
              @click="goToStep(n)"
            >
              <span v-if="n < currentStep" aria-hidden="true">✓</span>
              <span v-else aria-hidden="true">{{ n }}</span>
            </button>
          </div>
          <p class="step-label">
            {{ t('submitEvent.stepOf', { current: currentStep, total: TOTAL_STEPS }) }}
            — <strong>{{ stepTitle }}</strong>
          </p>
        </div>

        <!-- Form card -->
        <div class="edit-form card">

          <!-- Step 1: Basic Info -->
          <fieldset v-if="currentStep === 1" class="form-section">
            <legend class="section-legend">{{ t('submitEvent.basicInfo') }}</legend>

            <div class="form-group">
              <label class="form-label" for="event-title">{{ t('submitEvent.eventTitle') }} *</label>
              <input
                id="event-title"
                v-model="form.name"
                class="form-input"
                :class="{ 'form-input--error': errors.name }"
                type="text"
                required
                :placeholder="t('submitEvent.eventTitlePlaceholder')"
              />
              <p v-if="errors.name" class="field-error" role="alert">{{ errors.name }}</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-description">{{ t('submitEvent.description') }} *</label>
              <textarea
                id="event-description"
                v-model="form.description"
                class="form-textarea"
                :class="{ 'form-input--error': errors.description }"
                required
                :placeholder="t('submitEvent.descriptionPlaceholder')"
              ></textarea>
              <p v-if="errors.description" class="field-error" role="alert">{{ errors.description }}</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-domain">{{ t('filters.domain') }} *</label>
              <select
                id="event-domain"
                v-model="form.domainSlug"
                class="form-select"
                :class="{ 'form-input--error': errors.domainSlug }"
                required
              >
                <option value="" disabled>{{ t('submitEvent.selectDomain') }}</option>
                <option v-for="d in domainsStore.domains" :key="d.id" :value="d.slug">
                  {{ d.name }}
                </option>
              </select>
              <p v-if="errors.domainSlug" class="field-error" role="alert">{{ errors.domainSlug }}</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-additional-tags">{{ t('submitEvent.additionalTags') }}</label>
              <select
                id="event-additional-tags"
                v-model="form.additionalTagSlugs"
                class="form-select"
                multiple
              >
                <option
                  v-for="d in domainsStore.domains.filter(d => d.slug !== form.domainSlug)"
                  :key="d.id"
                  :value="d.slug"
                >
                  {{ d.name }}
                </option>
              </select>
              <p class="field-hint">{{ t('submitEvent.additionalTagsHint') }}</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-attendance-mode">{{ t('submitEvent.attendanceMode') }}</label>
              <select id="event-attendance-mode" v-model="form.attendanceMode" class="form-select">
                <option value="IN_PERSON">{{ t('attendanceMode.IN_PERSON') }}</option>
                <option value="ONLINE">{{ t('attendanceMode.ONLINE') }}</option>
                <option value="HYBRID">{{ t('attendanceMode.HYBRID') }}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-country">{{ t('submitEvent.countryCode') }}</label>
              <input
                id="event-country"
                v-model="form.countryCode"
                class="form-input"
                type="text"
                maxlength="2"
                :placeholder="t('submitEvent.countryCodePlaceholder')"
              />
            </div>
          </fieldset>

          <!-- Step 2: Date & Time -->
          <fieldset v-else-if="currentStep === 2" class="form-section">
            <legend class="section-legend">{{ t('submitEvent.dateTime') }}</legend>

            <div class="form-group">
              <label class="form-label" for="event-date">{{ t('submitEvent.startDate') }} *</label>
              <input
                id="event-date"
                v-model="form.startsAtUtc"
                class="form-input"
                :class="{ 'form-input--error': errors.startsAtUtc }"
                type="date"
                required
              />
              <p v-if="errors.startsAtUtc" class="field-error" role="alert">{{ errors.startsAtUtc }}</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="event-end-date">{{ t('submitEvent.endDate') }}</label>
              <input
                id="event-end-date"
                v-model="form.endsAtUtc"
                class="form-input"
                type="date"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="event-timezone">
                {{ t('submitEvent.timezoneLabel') }}
                <span class="form-hint">{{ t('submitEvent.timezoneHint') }}</span>
              </label>
              <input
                id="event-timezone"
                v-model="form.timezone"
                :class="['form-input', errors.timezone ? 'form-input--error' : '']"
                type="text"
                list="common-timezones"
                :placeholder="t('submitEvent.timezonePlaceholder')"
                autocomplete="off"
              />
              <p v-if="errors.timezone" class="field-error" role="alert">{{ errors.timezone }}</p>
              <datalist id="common-timezones">
                <option value="Europe/Prague" />
                <option value="Europe/London" />
                <option value="Europe/Paris" />
                <option value="Europe/Berlin" />
                <option value="Europe/Vienna" />
                <option value="Europe/Warsaw" />
                <option value="Europe/Bratislava" />
                <option value="Europe/Budapest" />
                <option value="Europe/Bucharest" />
                <option value="Europe/Kiev" />
                <option value="Europe/Moscow" />
                <option value="America/New_York" />
                <option value="America/Chicago" />
                <option value="America/Denver" />
                <option value="America/Los_Angeles" />
                <option value="America/Toronto" />
                <option value="America/Vancouver" />
                <option value="America/Sao_Paulo" />
                <option value="Asia/Tokyo" />
                <option value="Asia/Shanghai" />
                <option value="Asia/Singapore" />
                <option value="Asia/Dubai" />
                <option value="Asia/Kolkata" />
                <option value="Australia/Sydney" />
                <option value="Pacific/Auckland" />
                <option value="UTC" />
              </datalist>
            </div>
          </fieldset>

          <!-- Step 3: Pricing -->
          <fieldset v-else-if="currentStep === 3" class="form-section">
            <legend class="section-legend">{{ t('submitEvent.pricing') }}</legend>

            <div class="form-group form-checkbox">
              <label class="checkbox-label" for="event-free">
                <input id="event-free" v-model="form.isFree" type="checkbox" class="checkbox-input" />
                <span>{{ t('submitEvent.freeEvent') }}</span>
              </label>
            </div>

            <div v-if="!form.isFree">
              <div class="form-group">
                <label class="form-label" for="event-price">{{ t('submitEvent.priceLabel') }} *</label>
                <input
                  id="event-price"
                  v-model="form.priceAmount"
                  class="form-input"
                  :class="{ 'form-input--error': errors.priceAmount }"
                  type="number"
                  min="0"
                  step="0.01"
                  :placeholder="t('submitEvent.pricePlaceholder')"
                />
                <p v-if="errors.priceAmount" class="field-error" role="alert">{{ errors.priceAmount }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="event-currency">{{ t('submitEvent.currency') }}</label>
                <input
                  id="event-currency"
                  v-model="form.currencyCode"
                  class="form-input"
                  type="text"
                  maxlength="8"
                  :placeholder="t('submitEvent.currencyPlaceholder')"
                />
              </div>
            </div>

            <p v-if="form.isFree" class="free-note">{{ t('submitEvent.freeEventNote') }}</p>
          </fieldset>

          <!-- Step 4: Location -->
          <fieldset v-else-if="currentStep === 4" class="form-section">
            <legend class="section-legend">{{ t('submitEvent.locationSection') }}</legend>

            <div class="form-group">
              <label class="form-label" for="event-location-name">{{ t('submitEvent.venueName') }}</label>
              <input
                id="event-location-name"
                v-model="form.venueName"
                class="form-input"
                type="text"
                :placeholder="t('submitEvent.venueNamePlaceholder')"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="event-location-address">{{ t('submitEvent.address') }}</label>
              <input
                id="event-location-address"
                v-model="form.addressLine1"
                class="form-input"
                type="text"
                :placeholder="t('submitEvent.addressPlaceholder')"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="event-city">{{ t('submitEvent.city') }}</label>
              <input
                id="event-city"
                v-model="form.city"
                class="form-input"
                type="text"
                :placeholder="t('submitEvent.cityPlaceholder')"
              />
            </div>

            <div class="form-row-two">
              <div class="form-group">
                <label class="form-label" for="event-lat">{{ t('submitEvent.latitude') }}</label>
                <input
                  id="event-lat"
                  v-model="form.latitude"
                  class="form-input"
                  type="text"
                  :placeholder="t('submitEvent.latitudePlaceholder')"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="event-lng">{{ t('submitEvent.longitude') }}</label>
                <input
                  id="event-lng"
                  v-model="form.longitude"
                  class="form-input"
                  type="text"
                  :placeholder="t('submitEvent.longitudePlaceholder')"
                />
              </div>
            </div>
          </fieldset>

          <!-- Step 5: Event Link + Preview -->
          <fieldset v-else-if="currentStep === 5" class="form-section">
            <legend class="section-legend">{{ t('submitEvent.eventLinkSection') }}</legend>

            <div class="form-group">
              <label class="form-label" for="event-link">{{ t('submitEvent.websiteUrl') }} *</label>
              <input
                id="event-link"
                v-model="form.eventUrl"
                class="form-input"
                :class="{ 'form-input--error': errors.eventUrl }"
                type="url"
                required
                :placeholder="t('submitEvent.urlPlaceholder')"
              />
              <p v-if="errors.eventUrl" class="field-error" role="alert">{{ errors.eventUrl }}</p>
            </div>

            <!-- Preview summary -->
            <div class="preview-summary">
              <h3 class="preview-title">{{ t('submitEvent.previewTitle') }}</h3>
              <dl class="preview-list">
                <div class="preview-row">
                  <dt>{{ t('submitEvent.eventTitle') }}</dt>
                  <dd>{{ form.name || '—' }}</dd>
                </div>
                <div class="preview-row">
                  <dt>{{ t('submitEvent.startDate') }}</dt>
                  <dd>{{ form.startsAtUtc || '—' }}</dd>
                </div>
                <div v-if="form.city || form.venueName" class="preview-row">
                  <dt>{{ t('submitEvent.locationSection') }}</dt>
                  <dd>{{ [form.venueName, form.city].filter(Boolean).join(', ') }}</dd>
                </div>
                <div class="preview-row">
                  <dt>{{ t('submitEvent.pricing') }}</dt>
                  <dd>{{ form.isFree ? t('submitEvent.freeEvent') : `${form.priceAmount} ${form.currencyCode}` }}</dd>
                </div>
              </dl>
            </div>
          </fieldset>

          <!-- Global save error -->
          <p v-if="submissionError" class="submit-error" role="alert">{{ submissionError }}</p>

          <!-- Readiness checklist (visible on step 5 before save/resubmit) -->
          <div
            v-if="currentStep === TOTAL_STEPS"
            class="readiness-panel"
            :class="readiness.canSubmit ? 'readiness-panel--ok' : 'readiness-panel--blocked'"
            role="region"
            :aria-label="t('readiness.panelTitle')"
          >
            <div class="readiness-header">
              <span class="readiness-icon" aria-hidden="true">{{ readiness.canSubmit ? '✅' : '⚠️' }}</span>
              <strong class="readiness-status">
                {{ readiness.canSubmit ? t('readiness.canSubmit') : t('readiness.cannotSubmit') }}
              </strong>
            </div>
            <template v-if="readiness.blockingIssues.length > 0">
              <p class="readiness-section-label">{{ t('readiness.blockingHeading') }}</p>
              <ul class="readiness-list readiness-list--blocking" aria-label="Blocking issues">
                <li v-for="item in readiness.blockingIssues" :key="item.key" class="readiness-item readiness-item--blocking">
                  <span class="readiness-item-icon" aria-hidden="true">✗</span>
                  {{ t(`readiness.${item.key}`) }}
                </li>
              </ul>
            </template>
            <template v-if="readiness.recommendations.length > 0">
              <p class="readiness-section-label">{{ t('readiness.recommendationsHeading') }}</p>
              <ul class="readiness-list readiness-list--recommendations" aria-label="Recommendations">
                <li v-for="item in readiness.recommendations" :key="item.key" class="readiness-item readiness-item--recommendation">
                  <span class="readiness-item-icon" aria-hidden="true">💡</span>
                  {{ t(`readiness.${item.key}`) }}
                </li>
              </ul>
            </template>
          </div>

          <!-- Step navigation actions -->
          <div class="form-actions">
            <button
              v-if="currentStep > 1"
              type="button"
              class="btn btn-ghost"
              @click="prevStep"
            >
              {{ t('submitEvent.back') }}
            </button>
            <RouterLink v-else to="/dashboard" class="btn btn-ghost">{{ t('common.cancel') }}</RouterLink>

            <button
              v-if="currentStep < TOTAL_STEPS"
              type="button"
              class="btn btn-primary"
              @click="nextStep"
            >
              {{ t('submitEvent.next') }}
            </button>
            <template v-else>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="submitting || resubmitting"
                @click="handleSave"
              >
                {{ submitting ? t('editEvent.saving') : t('editEvent.saveButton') }}
              </button>
              <!-- Resubmit CTA for rejected events with no blocking issues -->
              <button
                v-if="eventStatus === 'REJECTED' && readiness.canSubmit"
                type="button"
                class="btn btn-success"
                :disabled="resubmitting || submitting"
                @click="handleResubmit"
              >
                {{ resubmitting ? t('editEvent.resubmitting') : t('editEvent.resubmitButton') }}
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.edit-view {
  padding: 1.5rem 0 4rem;
}

.edit-header {
  margin-bottom: 1.25rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 0.625rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-decoration: none;
}

.back-link:hover {
  color: var(--color-text);
}

.edit-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
}

.edit-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

/* ── Step progress ── */
.step-progress {
  margin-bottom: 1.5rem;
}

.step-progress-bar {
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.step-progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.step-indicators {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.step-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
  line-height: 1;
}

.step-dot--done {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
}

.step-dot--active {
  border-color: var(--color-primary);
  background: transparent;
  color: var(--color-primary);
}

.step-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* ── Form card ── */
.edit-form {
  max-width: 600px;
}

.form-section {
  border: none;
  padding: 0;
  margin-bottom: 0;
}

.section-legend {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  padding: 1.25rem 1.5rem 0.75rem;
  width: 100%;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1.25rem;
}

.form-group {
  padding: 0 1.5rem;
  margin-bottom: 1.125rem;
}

.form-row-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 0.75rem;
}

.form-row-two .form-group {
  padding: 0 0 0 1.5rem;
}

.form-row-two .form-group:last-child {
  padding: 0 1.5rem 0 0;
}

/* ── Actions ── */
.form-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.submit-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  padding: 0 1.5rem 0.75rem;
}

/* ── Checkbox ── */
.form-checkbox {
  padding-top: 0.25rem;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--color-text);
  font-size: 0.9375rem;
  cursor: pointer;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.free-note {
  padding: 0 1.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* ── Form elements ── */
.form-input--error {
  border-color: var(--color-danger);
}

.field-error {
  color: var(--color-danger);
  font-size: 0.8125rem;
  margin-top: 0.25rem;
  padding: 0;
}

.form-hint {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
}

/* ── Preview summary ── */
.preview-summary {
  margin: 0 1.5rem 1rem;
  padding: 1rem;
  background: var(--color-surface-raised);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.preview-title {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

.preview-list {
  margin: 0;
  padding: 0;
}

.preview-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
}

.preview-row:last-child {
  border-bottom: none;
}

.preview-row dt {
  color: var(--color-text-secondary);
  min-width: 80px;
  flex-shrink: 0;
}

.preview-row dd {
  font-weight: 500;
  margin: 0;
  word-break: break-word;
}

/* ── Ghost / outline buttons ── */
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
}

.btn-ghost:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
}

.btn-outline {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-outline:hover {
  background: rgba(19, 127, 236, 0.08);
}

/* ── Loading / error / success states ── */
.loading-state {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

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

.success-card {
  max-width: 480px;
  margin: 0 auto;
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.success-icon {
  font-size: 2.5rem;
}

.success-card h2 {
  font-size: 1.375rem;
  font-weight: 700;
}

.success-card p {
  color: var(--color-text-secondary);
}

/* ── Mobile first ── */
@media (max-width: 640px) {
  .edit-view {
    padding: 1rem 0 5rem;
  }

  .edit-header h1 {
    font-size: 1.25rem;
  }

  .form-row-two {
    grid-template-columns: 1fr;
  }

  .form-row-two .form-group,
  .form-row-two .form-group:last-child {
    padding: 0 1.25rem;
  }

  .form-group {
    padding: 0 1.25rem;
  }

  .section-legend {
    padding: 1rem 1.25rem 0.75rem;
  }

  .form-actions {
    padding: 1rem 1.25rem;
    position: sticky;
    bottom: 0;
    background: var(--color-surface);
    z-index: 10;
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  }

  .preview-summary {
    margin: 0 1.25rem 1rem;
  }

  .submit-error {
    padding: 0 1.25rem 0.75rem;
  }

  .readiness-panel {
    margin: 0 1.25rem 1rem;
  }
}

/* ── Lifecycle status card ── */
.lifecycle-card {
  max-width: 600px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  border-left: 4px solid var(--color-border);
}

.lifecycle-card.status--draft {
  border-left-color: var(--color-text-secondary);
  background: rgba(0, 0, 0, 0.03);
}

.lifecycle-card.status--pending {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.06);
}

.lifecycle-card.status--published {
  border-left-color: #4ade80;
  background: rgba(74, 222, 128, 0.06);
}

.lifecycle-card.status--rejected {
  border-left-color: var(--color-danger, #ef4444);
  background: rgba(239, 68, 68, 0.06);
}

.lifecycle-header {
  margin-bottom: 0.5rem;
}

.lifecycle-badge {
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.lifecycle-badge.status--draft {
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
}

.lifecycle-badge.status--pending {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}

.lifecycle-badge.status--published {
  background: rgba(74, 222, 128, 0.15);
  color: #16a34a;
}

.lifecycle-badge.status--rejected {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.lifecycle-explanation {
  font-size: 0.875rem;
  color: var(--color-text);
  margin: 0.25rem 0;
}

.lifecycle-action {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.lifecycle-admin-notes {
  margin-top: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  line-height: 1.5;
}

/* ── Readiness panel ── */
.readiness-panel {
  margin: 1rem 0 0;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
}

.readiness-panel--ok {
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.readiness-panel--blocked {
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.35);
}

.readiness-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.readiness-icon {
  font-size: 1rem;
  line-height: 1;
}

.readiness-status {
  font-weight: 600;
}

.readiness-section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  margin: 0.75rem 0 0.25rem;
}

.readiness-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.readiness-item {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
}

.readiness-item-icon {
  flex-shrink: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.readiness-item--blocking {
  color: var(--color-text);
}

.readiness-item--recommendation {
  color: var(--color-text-secondary);
}

/* ── btn-success ── */
.btn-success {
  background: #16a34a;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-success:hover:not(:disabled) {
  background: #15803d;
}

.btn-success:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

</style>
