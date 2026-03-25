import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makePublicGroup,
  makePrivateGroup,
  makeActiveMembership,
  makePendingMembership,
  makeApprovedEvent,
  makePendingReviewClaim,
  makeVerifiedClaim,
  loginAs,
} from './helpers/mock-api'

// ── Communities list page ─────────────────────────────────────────────────────

test.describe('Communities list page', () => {
  test('shows public groups without authentication', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    state.communityGroups.push(makePrivateGroup())

    await page.goto('/communities')
    await expect(page.getByRole('heading', { name: 'Community Groups', exact: true })).toBeVisible()
    // Public group is shown
    await expect(page.getByText('Prague Crypto Circle')).toBeVisible()
    // Private group NOT shown to unauthenticated user
    await expect(page.getByText('Secret Builders Guild')).toBeHidden()
  })

  test('shows empty state when no groups exist', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/communities')
    await expect(page.getByText('No community groups yet')).toBeVisible()
  })

  test('group card links to detail page', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/communities')
    await page.getByText('Prague Crypto Circle').click()
    await expect(page).toHaveURL(/\/community\/prague-crypto-circle/)
  })

  test('shows Create Community button for authenticated user', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, admin)
    await page.goto('/communities')
    await expect(page.getByRole('button', { name: 'Create Community' })).toBeVisible()
  })

  test('authenticated user can create a public community group', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)

    await loginAs(page, admin)
    await page.goto('/communities')

    await page.getByRole('button', { name: 'Create Community' }).click()
    await page.getByLabel('Community name').fill('My New Community')
    // Trigger auto-slug via blur
    await page.getByLabel('Community name').blur()
    await page.getByLabel('URL slug').fill('my-new-community')
    await page.getByLabel('Short summary').fill('A brand new community')
    await page.getByLabel('Visibility').selectOption('PUBLIC')
    // Scope to form-actions to avoid strict-mode conflict with the toggle button
    await page.locator('.form-actions').getByRole('button', { name: 'Create Community' }).click()

    // The group appears in the list
    await expect(page.getByText('My New Community')).toBeVisible()
  })

  test('shows error when slug is already taken', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(makePublicGroup({ slug: 'taken-slug' }))

    await loginAs(page, admin)
    await page.goto('/communities')

    await page.getByRole('button', { name: 'Create Community' }).click()
    await page.getByLabel('Community name').fill('Another Group')
    // clear() ensures autoSlug-generated value is removed before fill() sets the slug
    await page.getByLabel('URL slug').clear()
    await page.getByLabel('URL slug').fill('taken-slug')
    // Scope to form-actions to avoid strict-mode conflict with the toggle button
    await page.locator('.form-actions').getByRole('button', { name: 'Create Community' }).click()

    await expect(page.locator('.error-banner')).toContainText(/already taken/i)
  })
})

// ── Community detail page ─────────────────────────────────────────────────────

test.describe('Community detail page - public group', () => {
  test('shows group name and member count', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Prague Crypto Circle' })).toBeVisible()
    await expect(page.getByText('1 member')).toBeVisible()
    await expect(page.getByText('Public')).toBeVisible()
  })

  test('shows summary description', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('A community for crypto enthusiasts in Prague.')).toBeVisible()
  })

  test('shows sign-in prompt for unauthenticated user', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText(/sign in to join/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('shows Join button for authenticated non-member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible()
  })

  test('authenticated user can join a public group', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByText('Joined')).toBeVisible()
  })

  test('shows Joined badge for existing member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Joined')).toBeVisible()
  })

  test('shows not-found state for unknown slug', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/community/does-not-exist')
    await expect(page.getByText('Community not found')).toBeVisible()
  })

  test('shows associated published events', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    state.events.push(makeApprovedEvent({ name: 'Crypto Summit 2026' }))

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Community Events')).toBeVisible()
    await expect(page.getByText('Crypto Summit 2026')).toBeVisible()
  })

  test('shows empty events state when no events associated', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('No events yet')).toBeVisible()
  })
})

// ── Private group access ──────────────────────────────────────────────────────

test.describe('Community detail page - private group', () => {
  test('shows private notice for unauthenticated user', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePrivateGroup())

    await page.goto('/community/secret-builders-guild')
    // Use getByRole to avoid strict-mode: "Private Community" appears in summary and description too
    await expect(page.getByRole('heading', { name: 'Private Community' })).toBeVisible()
    // Use .private-notice to scope: description contains "request access" as a substring
    await expect(page.locator('.private-notice')).toContainText(/request access/i)
  })

  test('shows Request Access button for authenticated non-member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePrivateGroup())

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByRole('button', { name: 'Request Access' })).toBeVisible()
  })

  test('authenticated user can request membership in private group', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePrivateGroup())

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Request Access' }).click()
    await expect(page.getByText('Your membership request has been sent')).toBeVisible()
    await expect(page.getByText('Pending approval')).toBeVisible()
  })

  test('shows pending state for already-requested membership', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByText('Pending approval')).toBeVisible()
  })
})

// ── Admin member management ───────────────────────────────────────────────────

test.describe('Community detail page - admin member management', () => {
  test('admin sees Pending Requests section', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByText('Pending Requests')).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
  })

  test('admin can approve a pending membership request', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    const pending = makePendingMembership(group.id, contributor.id)
    state.communityMemberships.push(pending)

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Approve' }).click()

    // After approval, the pending member moves to active members
    await expect(page.getByText('Members')).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
  })

  test('admin can reject a pending membership request', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Reject' }).click()

    // The contributor is no longer in pending list
    await expect(page.getByText('No pending membership requests.')).toBeVisible()
  })

  test('admin sees Members section with active members', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    // Use getByRole heading to avoid matching "members" in "2 members" count and in "membership requests"
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
    // Use role badge locator to avoid matching "Member" in <option> elements
    await expect(page.locator('.member-role-badge', { hasText: 'Member' })).toBeVisible()
  })

  test('admin can change member role to Event Manager', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    const memberMembership = makeActiveMembership(group.id, contributor.id, 'MEMBER')
    state.communityMemberships.push(memberMembership)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    // Change role using the select dropdown in the member row
    const roleSelect = page.locator('.role-select').first()
    await roleSelect.selectOption('EVENT_MANAGER')

    // The role badge updates — scope to .member-role-badge to avoid matching <option> elements
    await expect(page.locator('.member-role-badge', { hasText: 'Event Manager' })).toBeVisible()
  })

  test('admin can remove a member', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Contributor User')).toBeVisible()

    // Click the Remove button for the contributor
    await page.locator('.member-row', { hasText: 'Contributor User' }).getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Contributor User')).toBeHidden()
  })

  test('non-admin does not see admin panel', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Pending Requests')).toBeHidden()
    await expect(page.locator('.role-select')).toBeHidden()
  })
})

// ── Nav link ──────────────────────────────────────────────────────────────────

test.describe('Communities nav link', () => {
  test('header contains Communities link', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Communities', exact: true })).toBeVisible()
  })

  test('Communities nav link navigates to /communities', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'Communities', exact: true }).click()
    await expect(page).toHaveURL('/communities')
  })
})

// ── External source claims ────────────────────────────────────────────────────

test.describe('External source claims (admin)', () => {
  test('admin sees Connected External Sources section', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeVisible()
  })

  test('shows empty state when no external sources connected', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.empty-sources')).toBeVisible()
    await expect(page.getByText('No external sources connected yet.')).toBeVisible()
  })

  test('shows existing external source claims with status badge', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.source-type-badge', { hasText: 'MEETUP' })).toBeVisible()
    await expect(page.locator('.claim-status-badge', { hasText: 'Pending review' })).toBeVisible()
  })

  test('shows verified claim with Sync Now button enabled', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.claim-status-badge', { hasText: 'Verified' })).toBeVisible()
    const syncBtn = page.getByRole('button', { name: 'Sync Now' }).first()
    await expect(syncBtn).toBeEnabled()
  })

  test('shows Sync Now disabled for pending-review claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    const syncBtn = page.getByRole('button', { name: 'Sync Now' }).first()
    await expect(syncBtn).toBeDisabled()
  })

  test('admin can add a valid Meetup source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('MEETUP')
    await page.locator('#new-source-url').fill('https://www.meetup.com/my-test-group')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.source-type-badge', { hasText: 'MEETUP' })).toBeVisible()
    await expect(page.locator('.claim-status-badge', { hasText: 'Pending review' })).toBeVisible()
  })

  test('shows error for invalid Meetup URL format', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('MEETUP')
    await page.locator('#new-source-url').fill('https://lu.ma/wrong-platform')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.error-banner')).toBeVisible()
  })

  test('admin can add a valid Luma source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('LUMA')
    await page.locator('#new-source-url').fill('https://lu.ma/my-luma-community')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.source-type-badge', { hasText: 'LUMA' })).toBeVisible()
  })

  test('admin can remove an external source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.source-row')).toHaveCount(1)
    await page.locator('.source-row').getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.source-row')).toHaveCount(0)
    await expect(page.locator('.empty-sources')).toBeVisible()
  })

  test('admin can trigger sync on a verified claim and sees result', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Sync Now' }).first().click()
    // After sync, result summary is shown
    await expect(page.locator('.sync-result-badge')).toBeVisible()
  })

  test('non-admin does not see external sources section', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeHidden()
  })

  test('unauthenticated user does not see external sources section', async ({ page }) => {
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.communityGroups.push(group)

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeHidden()
  })
})
