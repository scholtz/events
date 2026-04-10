import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeTechDomain,
  makeApprovedEvent,
  makeAdminUser,
  type MockDiscussionEntry,
  type MockUser,
} from './helpers/mock-api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOrganizerUser(): MockUser {
  return {
    id: 'organizer-disc-1',
    email: 'organizer@disc-test.com',
    password: 'OrgPass123!',
    displayName: 'Event Organizer',
    role: 'CONTRIBUTOR',
    createdAtUtc: new Date().toISOString(),
  }
}

function makeAttendeeUser(): MockUser {
  return {
    id: 'attendee-disc-1',
    email: 'attendee@disc-test.com',
    password: 'AttPass123!',
    displayName: 'Regular Attendee',
    role: 'CONTRIBUTOR',
    createdAtUtc: new Date().toISOString(),
  }
}

function makeDiscussionEntry(overrides: Partial<MockDiscussionEntry> = {}): MockDiscussionEntry {
  return {
    id: 'disc-entry-1',
    eventId: 'disc-event-1',
    authorDisplayName: 'Regular Attendee',
    authorRole: 'ATTENDEE',
    body: 'Will there be parking available?',
    parentEntryId: null,
    isHidden: false,
    createdAtUtc: new Date(Date.now() - 60000).toISOString(),
    updatedAtUtc: new Date(Date.now() - 60000).toISOString(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Event discussion section', () => {
  test('shows discussion heading on event detail page', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'Questions & Answers' })).toBeVisible()
  })

  test('shows empty state for unauthenticated user when no questions exist', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto(`/event/${event.slug}`)

    // empty state text includes sign-in prompt
    await expect(page.locator('.discussion-empty')).toBeVisible()
    await expect(page.locator('.discussion-empty')).toContainText('Sign in to be the first to ask')
  })

  test('shows sign-in notice for unauthenticated users', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-signin-cta')).toBeVisible()
    await expect(page.locator('.discussion-signin-cta')).toContainText('Sign in to ask')
  })

  test('shows existing discussion entries', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({
      body: 'Is the venue wheelchair accessible?',
      authorDisplayName: 'Jane Doe',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-list')).toBeVisible()
    await expect(page.locator('.discussion-body').first()).toContainText(
      'Is the venue wheelchair accessible?',
    )
    await expect(page.locator('.discussion-author').first()).toContainText('Jane Doe')
  })

  test('shows ORGANIZER badge for organizer entries', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({
      id: 'disc-org-entry',
      authorRole: 'ORGANIZER',
      authorDisplayName: 'Event Organizer',
      body: 'Yes, the venue is wheelchair accessible.',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-badge--organizer')).toBeVisible()
    await expect(page.locator('.discussion-badge--organizer')).toContainText('Organizer')
  })

  test('shows ADMIN badge for admin entries', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({
      id: 'disc-admin-entry',
      authorRole: 'ADMIN',
      authorDisplayName: 'Platform Admin',
      body: 'This event complies with our platform policies.',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-badge--admin')).toBeVisible()
    await expect(page.locator('.discussion-badge--admin')).toContainText('Platform Admin')
  })

  test('shows moderation notice for hidden entries', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({
      id: 'disc-hidden-entry',
      isHidden: true,
      body: 'Spam content that was hidden',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-hidden-notice')).toBeVisible()
    await expect(page.locator('.discussion-hidden-notice')).toContainText(
      'This message was removed by the organizer',
    )
    // The original spam body must not appear in a visible way
    await expect(page.locator('.discussion-body')).toBeHidden()
  })

  test('shows reply nested under parent entry', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const parent = makeDiscussionEntry({
      id: 'parent-entry-1',
      body: 'What time does registration open?',
    })
    const reply = makeDiscussionEntry({
      id: 'reply-entry-1',
      authorRole: 'ORGANIZER',
      authorDisplayName: 'Event Organizer',
      body: 'Registration opens at 9 AM.',
      parentEntryId: 'parent-entry-1',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [parent, reply],
    })

    await page.goto(`/event/${event.slug}`)

    // Parent entry visible
    await expect(page.locator('.discussion-list .discussion-entry').first()).toContainText(
      'What time does registration open?',
    )
    // Reply nested inside replies list
    const repliesList = page.locator('.discussion-replies')
    await expect(repliesList).toBeVisible()
    await expect(repliesList.locator('.discussion-body')).toContainText('Registration opens at 9 AM.')
    await expect(repliesList.locator('.discussion-badge--organizer')).toBeVisible()
  })

  test('authenticated user sees composer textarea', async ({ page }) => {
    const organizer = makeOrganizerUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: organizer.id,
    })
    const state = setupMockApi(page, {
      users: [organizer],
      domains: [makeTechDomain()],
      events: [event],
      currentUserId: organizer.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('#discussion-new-body')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Post question' }),
    ).toBeVisible()
  })

  test('authenticated user can post a question', async ({ page }) => {
    const attendee = makeAttendeeUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
    })
    const state = setupMockApi(page, {
      users: [attendee],
      domains: [makeTechDomain()],
      events: [event],
      currentUserId: attendee.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    await page.locator('#discussion-new-body').fill('Will there be live streaming?')
    await page.getByRole('button', { name: 'Post question' }).click()

    // The new entry should appear in the discussion list
    await expect(page.locator('.discussion-body', { hasText: 'Will there be live streaming?' })).toBeVisible()
    // Textarea should be cleared
    await expect(page.locator('#discussion-new-body')).toHaveValue('')
  })

  test('shows validation error for empty submission', async ({ page }) => {
    const attendee = makeAttendeeUser()
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const state = setupMockApi(page, {
      users: [attendee],
      domains: [makeTechDomain()],
      events: [event],
      currentUserId: attendee.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    // Submit without typing anything
    await page.getByRole('button', { name: 'Post question' }).click()

    await expect(page.locator('.discussion-error')).toBeVisible()
    await expect(page.locator('.discussion-error')).toContainText('Please enter a question')
  })

  test('organizer sees reply and hide controls', async ({ page }) => {
    const organizer = makeOrganizerUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: organizer.id,
    })
    const entry = makeDiscussionEntry({
      eventId: 'disc-event-1',
      authorDisplayName: 'Attendee',
      body: 'What is the dress code?',
    })
    const state = setupMockApi(page, {
      users: [organizer],
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
      currentUserId: organizer.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-reply-btn')).toBeVisible()
    await expect(page.locator('.discussion-hide-btn').first()).toBeVisible()
  })

  test('organizer can reply to a question', async ({ page }) => {
    const organizer = makeOrganizerUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: organizer.id,
    })
    const entry = makeDiscussionEntry({
      id: 'entry-reply-test',
      eventId: 'disc-event-1',
      body: 'What time does it start?',
    })
    const state = setupMockApi(page, {
      users: [organizer],
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
      currentUserId: organizer.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    // Click reply
    await page.locator('.discussion-reply-btn').first().click()

    // Composer appears
    const replyComposer = page.locator('.discussion-reply-composer')
    await expect(replyComposer).toBeVisible()

    // Type and submit reply
    await replyComposer.locator('textarea').fill('It starts at 10 AM sharp.')
    await replyComposer.getByRole('button', { name: 'Post reply' }).click()

    // Reply appears with ORGANIZER badge
    await expect(page.locator('.discussion-replies .discussion-body')).toContainText(
      'It starts at 10 AM sharp.',
    )
    await expect(page.locator('.discussion-replies .discussion-badge--organizer')).toBeVisible()
  })

  test('organizer can hide an entry', async ({ page }) => {
    const organizer = makeOrganizerUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: organizer.id,
    })
    const entry = makeDiscussionEntry({
      id: 'entry-hide-test',
      eventId: 'disc-event-1',
      body: 'This is spam content.',
    })
    const state = setupMockApi(page, {
      users: [organizer],
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
      currentUserId: organizer.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    // Entry visible before hide
    await expect(page.locator('.discussion-body', { hasText: 'This is spam content.' })).toBeVisible()

    // Hide it
    await page.locator('.discussion-hide-btn').first().click()

    // Moderation notice appears instead of body
    await expect(page.locator('.discussion-hidden-notice')).toBeVisible()
    await expect(page.locator('.discussion-hidden-notice')).toContainText('removed by the organizer')
  })

  test('admin sees reply and hide controls on any event', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: 'some-other-user',
    })
    const entry = makeDiscussionEntry({
      eventId: 'disc-event-1',
      body: 'Question from attendee.',
    })
    const state = setupMockApi(page, {
      users: [admin],
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
      currentUserId: admin.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    // Admin can see moderation controls on events they don't own
    await expect(page.locator('.discussion-reply-btn')).toBeVisible()
    await expect(page.locator('.discussion-hide-btn').first()).toBeVisible()
  })

  test('non-organizer authenticated user does not see reply/hide controls', async ({ page }) => {
    const attendee = makeAttendeeUser()
    const event = makeApprovedEvent({
      id: 'disc-event-1',
      slug: 'disc-event-1',
      submittedByUserId: 'some-other-user',
    })
    const entry = makeDiscussionEntry({
      eventId: 'disc-event-1',
      body: 'Question from another attendee.',
    })
    const state = setupMockApi(page, {
      users: [attendee],
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
      currentUserId: attendee.id,
    })

    await page.goto('/')
    await page.evaluate((userId: string) => {
      localStorage.setItem('auth_token', `token-${userId}`)
      localStorage.setItem('auth_expires', new Date(Date.now() + 7200000).toISOString())
    }, state.currentUserId as string)
    await page.goto(`/event/${event.slug}`)

    // Attendee cannot see reply/hide controls
    await expect(page.locator('.discussion-reply-btn')).toBeHidden()
    await expect(page.locator('.discussion-hide-btn')).toBeHidden()
  })

  test('discussion section is visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({ body: 'Mobile viewport question.' })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    const section = page.locator('.discussion-section')
    await expect(section).toBeVisible()
    await expect(page.locator('.discussion-body', { hasText: 'Mobile viewport question.' })).toBeVisible()
  })

  test('privacy: author email is not visible in discussion', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'disc-event-1', slug: 'disc-event-1' })
    const entry = makeDiscussionEntry({
      authorDisplayName: 'Privacy Test User',
      body: 'What are the accessibility options?',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)
    await expect(page.locator('.discussion-section')).toBeVisible()

    // Check page source doesn't contain any email address
    const content = await page.content()
    expect(content).not.toContain('attendee@disc-test.com')
    expect(content).not.toContain('authorId')
  })
})

test.describe('Event discussion: i18n', () => {
  test('discussion heading is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'sk'))

    const event = makeApprovedEvent({ id: 'disc-i18n-sk', slug: 'disc-i18n-sk' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'Otázky & odpovede' })).toBeVisible()
  })

  test('discussion heading is localized in German', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'de'))

    const event = makeApprovedEvent({ id: 'disc-i18n-de', slug: 'disc-i18n-de' })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto(`/event/${event.slug}`)

    await expect(page.getByRole('heading', { name: 'Fragen & Antworten' })).toBeVisible()
  })

  test('organizer badge is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'sk'))

    const event = makeApprovedEvent({ id: 'disc-sk-badge', slug: 'disc-sk-badge' })
    const entry = makeDiscussionEntry({
      id: 'disc-sk-entry',
      eventId: 'disc-sk-badge',
      authorRole: 'ORGANIZER',
      authorDisplayName: 'Organizátor',
      body: 'Vitajte na podujatí.',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-badge--organizer')).toContainText('Organizátor')
  })

  test('organizer badge is localized in German', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'de'))

    const event = makeApprovedEvent({ id: 'disc-de-badge', slug: 'disc-de-badge' })
    const entry = makeDiscussionEntry({
      id: 'disc-de-entry',
      eventId: 'disc-de-badge',
      authorRole: 'ORGANIZER',
      authorDisplayName: 'Veranstalter',
      body: 'Willkommen zur Veranstaltung.',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-badge--organizer')).toContainText('Organisator')
  })

  test('hidden entry notice is localized in Slovak', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_locale', 'sk'))

    const event = makeApprovedEvent({ id: 'disc-sk-hidden', slug: 'disc-sk-hidden' })
    const entry = makeDiscussionEntry({
      id: 'disc-sk-hidden-entry',
      eventId: 'disc-sk-hidden',
      isHidden: true,
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
      discussionEntries: [entry],
    })

    await page.goto(`/event/${event.slug}`)

    await expect(page.locator('.discussion-hidden-notice')).toContainText(
      'Táto správa bola odstránená organizátorom',
    )
  })
})
