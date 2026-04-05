/**
 * useEventReadiness – deterministic submission-readiness model for event drafts.
 *
 * Computes blocking issues (prevent submission) and non-blocking recommendations
 * (improve quality) from a plain form-state object.  All functions are pure and
 * side-effect-free so they can be unit-tested without a Vue context.
 *
 * Callers map the returned `key` values to locale-specific text via `t()`.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal form-state snapshot used for readiness computation. */
export interface EventFormSnapshot {
  name: string
  description: string
  domainSlug: string
  startsAtUtc: string
  eventUrl: string
  timezone: string
  attendanceMode: string
  venueName: string
  city: string
  isFree: boolean
  priceAmount: string
}

/** A single readiness check result. */
export interface ReadinessItem {
  /** Stable key used for i18n look-up: `readiness.<key>`. */
  key: string
  /** True = must be resolved before the event can be submitted. */
  blocking: boolean
}

/** Aggregated readiness result for a draft. */
export interface EventReadiness {
  /** Ordered list of all readiness items (blocking first, then recommended). */
  items: ReadinessItem[]
  /** True when there are no blocking issues — the draft may be submitted. */
  canSubmit: boolean
  /** Blocking items only. */
  blockingIssues: ReadinessItem[]
  /** Non-blocking items only. */
  recommendations: ReadinessItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimum description length before the short-description recommendation fires. */
export const MIN_DESCRIPTION_LENGTH = 50

// ── Core readiness function ───────────────────────────────────────────────────

/**
 * Compute the submission readiness for the given form snapshot.
 *
 * Blocking issues prevent submission.  Recommendations are surfaced as
 * helpful guidance but do not block saves or submission.
 */
export function computeEventReadiness(form: EventFormSnapshot): EventReadiness {
  const items: ReadinessItem[] = []

  // ── Blocking ────────────────────────────────────────────────────────────────

  if (!form.name.trim()) {
    items.push({ key: 'missingTitle', blocking: true })
  }

  if (!form.description.trim()) {
    items.push({ key: 'missingDescription', blocking: true })
  }

  if (!form.domainSlug) {
    items.push({ key: 'missingDomain', blocking: true })
  }

  if (!form.startsAtUtc) {
    items.push({ key: 'missingStartDate', blocking: true })
  }

  if (!form.eventUrl.trim()) {
    items.push({ key: 'missingEventUrl', blocking: true })
  } else {
    try {
      new URL(form.eventUrl)
    } catch {
      items.push({ key: 'invalidEventUrl', blocking: true })
    }
  }

  if (!form.isFree) {
    const price = Number.parseFloat(form.priceAmount)
    if (!Number.isFinite(price) || price < 0) {
      items.push({ key: 'invalidPrice', blocking: true })
    }
  }

  // ── Recommendations (non-blocking) ──────────────────────────────────────────

  if (!form.timezone.trim()) {
    items.push({ key: 'missingTimezone', blocking: false })
  }

  const needsVenue = form.attendanceMode === 'IN_PERSON' || form.attendanceMode === 'HYBRID'
  if (needsVenue && !form.venueName.trim()) {
    items.push({ key: 'missingVenue', blocking: false })
  }

  if (needsVenue && !form.city.trim()) {
    items.push({ key: 'missingCity', blocking: false })
  }

  if (form.description.trim().length > 0 && form.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    items.push({ key: 'shortDescription', blocking: false })
  }

  const blockingIssues = items.filter((i) => i.blocking)
  const recommendations = items.filter((i) => !i.blocking)

  return {
    items,
    canSubmit: blockingIssues.length === 0,
    blockingIssues,
    recommendations,
  }
}

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

/**
 * Event lifecycle statuses as returned by the backend.
 */
export type EventLifecycleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'

/**
 * Returns the i18n key suffix for the lifecycle status label.
 * Callers render with `t('lifecycle.<key>')`.
 */
export function lifecycleStatusKey(status: EventLifecycleStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'draft'
    case 'PENDING_APPROVAL':
      return 'pending'
    case 'PUBLISHED':
      return 'published'
    case 'REJECTED':
      return 'rejected'
  }
}

/**
 * Returns the CSS modifier class for the lifecycle status badge.
 */
export function lifecycleStatusVariant(status: EventLifecycleStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'status--draft'
    case 'PENDING_APPROVAL':
      return 'status--pending'
    case 'PUBLISHED':
      return 'status--published'
    case 'REJECTED':
      return 'status--rejected'
  }
}
