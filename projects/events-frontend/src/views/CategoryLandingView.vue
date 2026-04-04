<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import EventCard from '@/components/events/EventCard.vue'
import type { CatalogEvent, EventDomain } from '@/types'
import { gqlRequest } from '@/lib/graphql'
import { safeHexColor } from '@/lib/colorUtils'
import { useAuthStore } from '@/stores/auth'
import { useDomainsStore } from '@/stores/domains'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()
const domainsStore = useDomainsStore()

const slug = computed(() => route.params.slug as string)

const domain = ref<EventDomain | null>(null)
const events = ref<CatalogEvent[]>([])
const featuredEvents = ref<CatalogEvent[]>([])
const loading = ref(false)
const error = ref('')

const EVENT_FIELDS = `
  id name slug description eventUrl
  venueName addressLine1 city countryCode
  latitude longitude startsAtUtc endsAtUtc
  submittedAtUtc updatedAtUtc publishedAtUtc
  adminNotes status isFree priceAmount currencyCode domainId mapUrl
  attendanceMode timezone
  domain { id name slug subdomain }
  submittedBy { displayName }
`

const DOMAIN_FIELDS = `id name slug subdomain description isActive createdAtUtc
  createdByUserId primaryColor accentColor logoUrl bannerUrl
  tagline overviewContent whatBelongsHere submitEventCta curatorCredit
  publishedEventCount
  links { id title url displayOrder }`

async function fetchCategoryData() {
  loading.value = true
  error.value = ''

  try {
    // Always fetch from API to ensure publishedEventCount and all branding fields are present
    const domainData = await gqlRequest<{ domainBySlug: EventDomain | null }>(
      `query DomainBySlug($slug: String!) {
        domainBySlug(slug: $slug) { ${DOMAIN_FIELDS} }
      }`,
      { slug: slug.value },
    )
    const foundDomain = domainData.domainBySlug
    domain.value = foundDomain

    if (!foundDomain) {
      return
    }

    // Fetch events and featured events in parallel
    const [eventsData, featuredData] = await Promise.all([
      gqlRequest<{ events: CatalogEvent[] }>(
        `query CategoryEvents($filter: EventFilterInput) {
          events(filter: $filter) { ${EVENT_FIELDS} }
        }`,
        { filter: { domainSlug: slug.value, sortBy: 'UPCOMING' } },
      ),
      gqlRequest<{ featuredEventsForDomain: CatalogEvent[] }>(
        `query FeaturedEventsForDomain($domainSlug: String!) {
          featuredEventsForDomain(domainSlug: $domainSlug) { ${EVENT_FIELDS} }
        }`,
        { domainSlug: slug.value },
      ),
    ])
    events.value = eventsData.events
    featuredEvents.value = featuredData.featuredEventsForDomain
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('category.errorLoad')
    events.value = []
    featuredEvents.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchCategoryData)

watch(slug, fetchCategoryData)

// Update document title for SEO
const pageTitle = computed(() =>
  domain.value
    ? t('category.pageTitle', { name: domain.value.name })
    : t('category.pageTitleDefault'),
)

watch(
  pageTitle,
  (title) => {
    if (typeof document !== 'undefined') {
      document.title = title
    }
  },
  { immediate: true },
)

// Update meta description for SEO
const metaDescription = computed(() => {
  if (!domain.value) return ''
  return (domain.value.description || domain.value.overviewContent || '').slice(0, 160)
})

/** The social sharing image: prefer banner, fall back to logo, fall back to null. */
const socialImage = computed(() => domain.value?.bannerUrl ?? domain.value?.logoUrl ?? null)

/**
 * Upsert a `<meta>` element in `<head>`.
 * @param attr - the attribute key used to identify/select the element ('name' or 'property')
 * @param attrValue - the value for the identifying attribute (e.g. 'description', 'og:title')
 * @param content - the content to set; pass '' to clear
 */
function setMetaTag(attr: 'name' | 'property', attrValue: string, content: string): void {
  if (typeof document === 'undefined') return
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${attrValue}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, attrValue)
    document.head.appendChild(el)
  }
  el.content = content
}

/** Syncs all SEO + social meta tags whenever domain data changes. */
function updateSeoTags(
  title: string,
  desc: string,
  image: string | null,
): void {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  // Standard meta
  setMetaTag('name', 'description', desc)
  // Open Graph
  setMetaTag('property', 'og:type', 'website')
  setMetaTag('property', 'og:title', title)
  setMetaTag('property', 'og:description', desc)
  setMetaTag('property', 'og:url', url)
  setMetaTag('property', 'og:image', image ?? '')
  // Twitter / X Cards
  setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMetaTag('name', 'twitter:title', title)
  setMetaTag('name', 'twitter:description', desc)
  setMetaTag('name', 'twitter:image', image ?? '')
}

watch(
  [pageTitle, metaDescription, socialImage],
  ([title, desc, image]) => updateSeoTags(title, desc, image),
  { immediate: true },
)

const upcomingCount = computed(() => {
  const now = new Date()
  return events.value.filter((e) => new Date(e.startsAtUtc) >= now).length
})

/** Featured event IDs set for fast deduplication in the main list */
const featuredEventIds = computed(() => new Set(featuredEvents.value.map((e) => e.id)))

/** All events excluding already-featured ones */
const nonFeaturedEvents = computed(() =>
  events.value.filter((e) => !featuredEventIds.value.has(e.id)),
)

const LOW_SIGNAL_THRESHOLD = 3

const lowSignalMessage = computed(() => {
  const count = events.value.length
  if (count === 0 || count > LOW_SIGNAL_THRESHOLD) return null
  return count === 1
    ? t('home.fewResultsOne')
    : t('home.fewResultsMany', { count })
})

/** True when the authenticated user is a global admin or administers this specific domain hub. */
const isHubAdmin = computed(
  () =>
    authStore.isAuthenticated &&
    (authStore.isAdmin ||
      domainsStore.myManagedDomains.some((d: EventDomain) => d.slug === slug.value)),
)

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await domainsStore.fetchMyManagedDomains()
  }
})
</script>

<template>
  <div class="category-landing-view">
    <!-- Domain header -->
    <section
      class="category-hero"
      :style="[
        safeHexColor(domain?.primaryColor) ? `--category-color: ${safeHexColor(domain?.primaryColor)}` : '',
        safeHexColor(domain?.accentColor) ? `--category-accent-color: ${safeHexColor(domain?.accentColor)}` : '',
      ]"
    >
      <div class="container category-hero-content">
        <div class="category-hero-text">
          <nav class="category-breadcrumb" aria-label="Breadcrumb">
            <RouterLink to="/" class="breadcrumb-link">{{ t('category.allEvents') }}</RouterLink>
            <span class="breadcrumb-sep" aria-hidden="true">/</span>
            <span class="breadcrumb-current">{{ domain?.name ?? slug }}</span>
          </nav>

          <div v-if="loading" class="category-loading">
            <div class="loading-spinner" aria-hidden="true"></div>
            <span>{{ t('common.loading') }}</span>
          </div>

          <template v-else-if="domain">
            <div v-if="domain.logoUrl" class="category-logo-wrap">
              <img :src="domain.logoUrl" :alt="domain.name" class="category-logo" />
            </div>
            <h1 class="category-title">{{ t('category.heading', { name: domain.name }) }}</h1>
            <p v-if="domain.tagline" class="category-tagline">{{ domain.tagline }}</p>
            <p v-if="domain.description" class="category-description">{{ domain.description }}</p>
            <p class="category-event-count">
              {{
                domain.publishedEventCount !== undefined
                  ? (domain.publishedEventCount === 1
                      ? t('category.oneEvent')
                      : t('category.eventCount', { count: domain.publishedEventCount }))
                  : (upcomingCount === 1
                      ? t('category.oneUpcomingEvent')
                      : t('category.upcomingEventCount', { count: upcomingCount }))
              }}
            </p>
            <!-- Curator credit trust cue -->
            <p v-if="domain.curatorCredit" class="curator-credit">
              <span class="curator-icon" aria-hidden="true">✓</span>
              {{ t('category.curatedBy', { credit: domain.curatorCredit }) }}
            </p>
            <!-- Admin: manage hub link -->
            <RouterLink
              v-if="isHubAdmin"
              :to="`/hub/${domain.slug}/manage`"
              class="btn btn-outline btn-sm manage-hub-btn"
            >
              ⚙ {{ t('category.manageHub') }}
            </RouterLink>
          </template>

          <div v-else-if="!loading">
            <h1 class="category-title">{{ slug }}</h1>
          </div>
        </div>

        <div v-if="domain?.bannerUrl" class="category-banner-wrap">
          <img :src="domain.bannerUrl" :alt="domain.name" class="category-banner" />
        </div>
      </div>
    </section>

    <div class="container category-body">
      <!-- Error state -->
      <div v-if="error" class="results-state card error-state" role="alert">
        <div class="state-icon" aria-hidden="true">⚠️</div>
        <div>
          <h2>{{ t('category.errorLoad') }}</h2>
          <p>{{ error }}</p>
        </div>
        <button class="btn btn-primary" @click="fetchCategoryData">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Not found state -->
      <div v-else-if="!loading && !domain" class="results-state card empty-state">
        <div class="empty-icon">🔍</div>
        <h2>{{ t('category.notFound') }}</h2>
        <p>{{ t('category.notFoundDescription', { slug }) }}</p>
        <RouterLink to="/" class="btn btn-primary">{{ t('category.browseAll') }}</RouterLink>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="results-state card loading-state" aria-live="polite">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div>
          <h2>{{ t('common.loading') }}</h2>
        </div>
      </div>

      <!-- Events section -->
      <template v-else>
        <!-- Hub overview modules (About & What belongs here) -->
        <div v-if="domain?.overviewContent || domain?.whatBelongsHere" class="hub-overview-modules">
          <div v-if="domain.overviewContent" class="hub-module card">
            <h2 class="hub-module-title">
              <span class="hub-module-icon" aria-hidden="true">📌</span>
              {{ t('category.aboutHub') }}
            </h2>
            <p class="hub-module-body">{{ domain.overviewContent }}</p>
          </div>
          <div v-if="domain.whatBelongsHere" class="hub-module card">
            <h2 class="hub-module-title">
              <span class="hub-module-icon" aria-hidden="true">🎯</span>
              {{ t('category.whatBelongsHere') }}
            </h2>
            <p class="hub-module-body">{{ domain.whatBelongsHere }}</p>
          </div>
        </div>

        <!-- Community links section -->
        <div v-if="domain?.links?.length" class="community-links-section">
          <h2 class="community-links-title">
            <span class="community-links-icon" aria-hidden="true">🔗</span>
            {{ t('category.communityLinks') }}
          </h2>
          <ul class="community-links-list" aria-label="Community links">
            <li v-for="link in domain.links" :key="link.id" class="community-link-item">
              <a
                :href="link.url"
                class="community-link"
                target="_blank"
                rel="noopener noreferrer"
              >{{ link.title }}</a>
            </li>
          </ul>
        </div>

        <!-- Featured Events section -->
        <section v-if="featuredEvents.length" class="featured-section" aria-labelledby="featured-heading">
          <div class="featured-header">
            <div>
              <h2 id="featured-heading" class="featured-title">
                <span class="featured-icon" aria-hidden="true">⭐</span>
                {{ t('category.featuredEventsHeading') }}
              </h2>
              <p class="featured-subheading">{{ t('category.featuredEventsSubheading') }}</p>
            </div>
          </div>
          <div class="featured-grid">
            <div v-for="event in featuredEvents" :key="event.id" class="featured-card-wrap">
              <span class="featured-badge" aria-label="Featured">⭐ {{ t('category.featuredEventsHeading') }}</span>
              <EventCard :event="event" />
            </div>
          </div>
        </section>

        <div class="category-filters-row">
          <p class="results-summary" role="status" aria-live="polite">
            {{
              events.length === 1
                ? t('category.oneEventFound')
                : t('category.eventsFound', { count: events.length })
            }}
          </p>
          <RouterLink :to="`/?domain=${slug}`" class="btn btn-outline btn-sm">
            {{ t('category.filterAndExplore') }}
          </RouterLink>
        </div>

        <div v-if="lowSignalMessage" class="low-signal-notice" role="status" aria-live="polite">
          <span class="low-signal-icon" aria-hidden="true">🌱</span>
          {{ lowSignalMessage }}
        </div>

        <div v-if="events.length" class="events-grid">
          <EventCard v-for="event in nonFeaturedEvents" :key="event.id" :event="event" />
          <!-- If all events are featured, show a note instead of an empty grid -->
          <p
            v-if="!nonFeaturedEvents.length && featuredEvents.length"
            class="all-featured-note text-secondary"
          >
            {{ t('category.eventsFound', { count: events.length }) }}
          </p>
        </div>

        <!-- Hub-level empty state: hub exists but has no upcoming events -->
        <div v-else class="results-state card empty-state">
          <div class="empty-icon">📅</div>
          <h2>{{ t('category.noEvents') }}</h2>
          <p>{{ t('category.noEventsHubDescription', { name: domain?.name ?? '' }) }}</p>
          <div class="empty-state-actions">
            <RouterLink :to="`/?domain=${slug}`" class="btn btn-outline">
              {{ t('category.filterAndExplore') }}
            </RouterLink>
            <RouterLink to="/" class="btn btn-ghost">{{ t('category.browseAll') }}</RouterLink>
          </div>
        </div>

        <!-- Organizer submission CTA -->
        <div class="organizer-cta">
          <p class="organizer-cta-text">
            {{ domain?.submitEventCta || t('category.submitEventCtaDefault', { name: domain?.name ?? slug }) }}
          </p>
          <RouterLink to="/submit" class="btn btn-primary">
            {{ t('category.submitEvent') }}
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.category-hero {
  --category-color: var(--color-primary);
  --category-accent-color: var(--color-primary);
  background: linear-gradient(160deg, #0d0f14 0%, rgba(19, 127, 236, 0.12) 100%);
  border-bottom: 3px solid var(--category-color);
  padding: 2.5rem 0 2rem;
}

.category-hero-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}

.category-hero-text {
  flex: 1;
  min-width: 0;
}

.category-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
}

.breadcrumb-link {
  color: var(--color-primary);
  text-decoration: none;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-sep {
  color: var(--color-text-secondary);
}

.breadcrumb-current {
  color: var(--color-text);
  font-weight: 500;
}

.category-logo-wrap {
  margin-bottom: 1rem;
}

.category-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.category-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin-bottom: 0.5rem;
  color: var(--color-text);
}

.category-tagline {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--category-color, var(--color-text-secondary));
  max-width: 560px;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.category-description {
  font-size: 1rem;
  color: var(--color-text-secondary);
  max-width: 560px;
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.category-event-count {
  font-size: 0.9375rem;
  color: var(--category-color);
  font-weight: 600;
}

.category-banner-wrap {
  flex-shrink: 0;
}

.category-banner {
  width: 240px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.category-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.category-body {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.category-filters-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.results-summary {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Low-signal notice: only a handful of events in this hub */
.low-signal-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
}

.low-signal-icon {
  flex-shrink: 0;
  line-height: 1.4;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.results-state {
  padding: 2rem;
  display: grid;
  gap: 1rem;
}

.loading-state {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.loading-spinner {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 3px solid rgba(19, 127, 236, 0.15);
  border-top-color: var(--color-primary);
  animation: spin 0.9s linear infinite;
}

.state-icon {
  font-size: 1.75rem;
}

.empty-state {
  text-align: center;
  justify-items: center;
}

.empty-state-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.empty-icon {
  font-size: 2.5rem;
}

.error-state {
  grid-template-columns: auto 1fr auto;
  align-items: center;
}

/* ── Curator credit ─────────────────────────────────────── */
.curator-credit {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.5rem;
}

.curator-icon {
  color: var(--category-color);
  font-size: 0.9375rem;
}

/* ── Hub overview modules ────────────────────────────────── */
.hub-overview-modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.hub-module {
  padding: 1.25rem 1.5rem;
  border-left: 3px solid var(--category-accent-color);
}

.hub-module-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.625rem;
  color: var(--color-text);
}

.hub-module-icon {
  font-size: 1.125rem;
}

.hub-module-body {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.65;
  margin: 0;
}

/* ── Community links section ─────────────────────────────── */
.community-links-section {
  margin-bottom: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
}

.community-links-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--color-text);
}

.community-links-icon {
  font-size: 1.125rem;
}

.community-links-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.community-link-item {
  display: inline-flex;
}

.community-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--color-primary);
  text-decoration: none;
  padding: 0.3rem 0.75rem;
  border: 1px solid rgba(19, 127, 236, 0.3);
  border-radius: var(--radius-sm);
  background: rgba(19, 127, 236, 0.06);
  transition: background 0.15s, border-color 0.15s;
}

.community-link:hover {
  background: rgba(19, 127, 236, 0.12);
  border-color: rgba(19, 127, 236, 0.5);
  text-decoration: underline;
}

/* ── Featured events section ─────────────────────────────── */
.featured-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: rgba(255, 215, 0, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: var(--radius-md);
}

.featured-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  gap: 1rem;
}

.featured-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.featured-icon {
  font-size: 1.125rem;
}

.featured-subheading {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.featured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.featured-card-wrap {
  position: relative;
}

.featured-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #b8860b;
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.5rem;
  margin-bottom: 0.5rem;
}

.all-featured-note {
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

/* ── Organizer CTA ───────────────────────────────────────── */
.organizer-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding: 1.25rem 1.5rem;
  background: rgba(19, 127, 236, 0.06);
  border: 1px solid rgba(19, 127, 236, 0.18);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.organizer-cta-text {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin: 0;
  flex: 1;
  min-width: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .category-hero-content {
    flex-direction: column;
  }

  .category-banner-wrap {
    display: none;
  }

  .category-title {
    font-size: 1.5rem;
  }

  .error-state {
    grid-template-columns: 1fr;
  }

  .organizer-cta {
    flex-direction: column;
    align-items: flex-start;
  }

  .hub-overview-modules {
    grid-template-columns: 1fr;
  }

  .featured-grid {
    grid-template-columns: 1fr;
  }
}

.manage-hub-btn {
  margin-top: 0.75rem;
  align-self: flex-start;
}
</style>
