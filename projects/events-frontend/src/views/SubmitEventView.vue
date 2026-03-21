<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useDomainsStore } from '@/stores/domains'

const { t } = useI18n()
const router = useRouter()
const eventsStore = useEventsStore()
const domainsStore = useDomainsStore()

const submitting = ref(false)
const submitted = ref(false)
const submissionError = ref('')

const form = reactive({
  name: '',
  description: '',
  domainSlug: '',
  startsAtUtc: '',
  endsAtUtc: '',
  timezone: '',
  venueName: '',
  addressLine1: '',
  city: '',
  countryCode: 'CZ',
  isFree: true,
  priceAmount: '',
  currencyCode: 'EUR',
  latitude: '',
  longitude: '',
  eventUrl: '',
  attendanceMode: 'IN_PERSON',
})

const timezoneError = ref('')

function validateTimezone(tz: string): boolean {
  if (!tz) return true // optional field — blank is valid
  try {
    // Validate by attempting to construct an Intl.DateTimeFormat with the timezone.
    // Invalid IANA identifiers will throw a RangeError.
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

async function handleSubmit() {
  if (!form.name || !form.description || !form.domainSlug || !form.startsAtUtc || !form.eventUrl)
    return

  const parsedPrice = Number.parseFloat(form.priceAmount)
  if (!form.isFree) {
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      submissionError.value = t('submitEvent.validationPrice')
      return
    }
  }

  const tzTrimmed = form.timezone.trim()
  if (tzTrimmed && !validateTimezone(tzTrimmed)) {
    timezoneError.value = t('submitEvent.validationTimezone', { tz: tzTrimmed })
    return
  }
  timezoneError.value = ''

  submitting.value = true
  submissionError.value = ''
  try {
    await eventsStore.submitEvent({
      domainSlug: form.domainSlug,
      name: form.name,
      description: form.description,
      eventUrl: form.eventUrl,
      venueName: form.venueName,
      addressLine1: form.addressLine1,
      city: form.city,
      countryCode: form.countryCode || 'CZ',
      isFree: form.isFree,
      priceAmount: form.isFree ? 0 : parsedPrice,
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
      error instanceof Error ? error.message : t('submitEvent.submitError')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="submit-view">
    <div class="container">
      <div class="submit-header">
        <RouterLink to="/" class="back-link">{{ t('common.back') }}</RouterLink>
        <div>
          <h1>{{ t('submitEvent.title') }}</h1>
          <p>{{ t('submitEvent.subtitle') }}</p>
        </div>
      </div>

      <div v-if="submitted" class="success-card card">
        <div class="success-icon">🎉</div>
        <h2>{{ t('submitEvent.successTitle') }}</h2>
        <p>{{ t('submitEvent.successMessage') }}</p>
        <RouterLink to="/dashboard" class="btn btn-primary">{{ t('submitEvent.goToDashboard') }}</RouterLink>
      </div>

      <form v-else class="submit-form card" @submit.prevent="handleSubmit">
        <!-- Basic Info -->
        <fieldset class="form-section">
          <legend class="section-legend">{{ t('submitEvent.basicInfo') }}</legend>
          <div class="form-group">
            <label class="form-label" for="event-title">{{ t('submitEvent.eventTitle') }} *</label>
            <input
              id="event-title"
              v-model="form.name"
              class="form-input"
              type="text"
              required
              :placeholder="t('submitEvent.eventTitlePlaceholder')"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="event-description">{{ t('submitEvent.description') }} *</label>
            <textarea
              id="event-description"
              v-model="form.description"
              class="form-textarea"
              required
              :placeholder="t('submitEvent.descriptionPlaceholder')"
            ></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-domain">{{ t('filters.domain') }} *</label>
              <select id="event-domain" v-model="form.domainSlug" class="form-select" required>
                <option value="" disabled>{{ t('submitEvent.selectDomain') }}</option>
                <option v-for="d in domainsStore.domains" :key="d.id" :value="d.slug">
                  {{ d.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="event-country">{{ t('submitEvent.countryCode') }}</label>
              <input
                id="event-country"
                v-model="form.countryCode"
                class="form-input"
                type="text"
                placeholder="CZ"
              />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-attendance-mode">{{ t('submitEvent.attendanceMode') }}</label>
              <select id="event-attendance-mode" v-model="form.attendanceMode" class="form-select">
                <option value="IN_PERSON">{{ t('attendanceMode.IN_PERSON') }}</option>
                <option value="ONLINE">{{ t('attendanceMode.ONLINE') }}</option>
                <option value="HYBRID">{{ t('attendanceMode.HYBRID') }}</option>
              </select>
            </div>
          </div>
        </fieldset>

        <!-- Date & Time -->
        <fieldset class="form-section">
          <legend class="section-legend">{{ t('submitEvent.dateTime') }}</legend>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-date">{{ t('submitEvent.startDate') }} *</label>
              <input
                id="event-date"
                v-model="form.startsAtUtc"
                class="form-input"
                type="date"
                required
              />
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
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-timezone">
                {{ t('submitEvent.timezoneLabel') }}
                <span class="form-hint">{{ t('submitEvent.timezoneHint') }}</span>
              </label>
              <input
                id="event-timezone"
                v-model="form.timezone"
                :class="['form-input', timezoneError ? 'form-input--error' : '']"
                type="text"
                list="common-timezones"
                placeholder="e.g., Europe/Prague"
                autocomplete="off"
              />
              <p v-if="timezoneError" class="field-error" role="alert">{{ timezoneError }}</p>
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
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="section-legend">{{ t('submitEvent.pricing') }}</legend>
          <div class="form-group form-checkbox">
            <label class="checkbox-label" for="event-free">
              <input id="event-free" v-model="form.isFree" type="checkbox" />
              <span>{{ t('submitEvent.freeEvent') }}</span>
            </label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="event-price">{{ t('submitEvent.priceLabel') }}</label>
              <input
                id="event-price"
                v-model="form.priceAmount"
                class="form-input"
                type="number"
                min="0"
                step="0.01"
                :disabled="form.isFree"
                placeholder="49.00"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="event-currency">{{ t('submitEvent.currency') }}</label>
              <input
                id="event-currency"
                v-model="form.currencyCode"
                class="form-input"
                type="text"
                maxlength="8"
                :disabled="form.isFree"
                placeholder="EUR"
              />
            </div>
          </div>
        </fieldset>

        <!-- Location -->
        <fieldset class="form-section">
          <legend class="section-legend">{{ t('submitEvent.locationSection') }}</legend>
          <div class="form-row">
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
          </div>
          <div class="form-row">
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
          </div>
          <div class="form-row form-row--narrow">
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

        <!-- Link -->
        <fieldset class="form-section">
          <legend class="section-legend">{{ t('submitEvent.eventLinkSection') }}</legend>
          <div class="form-group">
            <label class="form-label" for="event-link">{{ t('submitEvent.websiteUrl') }} *</label>
            <input
              id="event-link"
              v-model="form.eventUrl"
              class="form-input"
              type="url"
              required
              placeholder="https://example.com/event"
            />
          </div>
        </fieldset>

        <p v-if="submissionError" class="submit-error" role="alert">{{ submissionError }}</p>

        <div class="form-actions">
          <RouterLink to="/" class="btn btn-ghost">{{ t('common.cancel') }}</RouterLink>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? t('submitEvent.submitting') : t('submitEvent.submitButton') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.submit-view {
  padding: 2rem 0 3rem;
}

.submit-header {
  margin-bottom: 1.5rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.back-link:hover {
  color: var(--color-text);
  text-decoration: none;
}

.submit-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}

.submit-header p {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.submit-form {
  max-width: 720px;
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

.form-section:not(:last-of-type) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
}

.form-group {
  padding: 0 1.5rem;
  margin-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1rem;
  padding: 0;
}

.form-row .form-group {
  padding: 0 0 0 1.5rem;
}

.form-row .form-group:last-child {
  padding: 0 1.5rem 0 0;
}

.form-row--narrow {
  max-width: 480px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
}

.submit-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  padding: 0 1.5rem;
}

.form-checkbox {
  padding-top: 0.25rem;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--color-text);
  font-size: 0.9375rem;
}

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
}

.btn-ghost:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
  text-decoration: none;
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

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .form-row .form-group,
  .form-row .form-group:last-child {
    padding: 0 1.5rem;
  }
}
</style>
